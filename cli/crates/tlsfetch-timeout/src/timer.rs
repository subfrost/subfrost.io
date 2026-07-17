// Adapted from cloudflare/pingora-timeout/src/timer.rs (Apache-2.0).

//! Per-thread timer trees + a single clock thread that fires due
//! timers at 10 ms resolution. Users don't interact with this
//! module directly — see [`crate::fast_timeout`] for the front
//! door.
//!
//! The design buckets timers by their rounded deadline so that
//! multiple timeouts created concurrently with similar expiry
//! share a single [`Timer`] entry (one `Notify`, one
//! `AtomicBool`). The clock thread sweeps each thread-local tree
//! every 10 ms and fires the expired buckets.

use parking_lot::RwLock;
use std::collections::BTreeMap;
use std::sync::atomic::{AtomicBool, AtomicI64, Ordering};
use std::sync::Arc;
use std::time::{Duration, Instant};
use thread_local::ThreadLocal;
use tokio::sync::Notify;

const RESOLUTION_MS: u64 = 10;
const RESOLUTION_DURATION: Duration = Duration::from_millis(RESOLUTION_MS);

// Round `raw` UP to the next multiple of `resolution`.
#[inline]
fn round_to(raw: u128, resolution: u128) -> u128 {
    raw - 1 + resolution - (raw - 1) % resolution
}

/// Deadline timestamp quantized to the 10 ms grid. Two timeouts
/// rounding to the same `Time` share a `Timer`.
#[derive(PartialEq, PartialOrd, Eq, Ord, Clone, Copy, Debug)]
struct Time(u128);

impl From<u128> for Time {
    fn from(raw_ms: u128) -> Self {
        Time(round_to(raw_ms, RESOLUTION_MS as u128))
    }
}

impl From<Duration> for Time {
    fn from(d: Duration) -> Self {
        Time(round_to(d.as_millis(), RESOLUTION_MS as u128))
    }
}

impl Time {
    pub fn not_after(&self, ts: u128) -> bool {
        self.0 <= ts
    }
}

/// Handle a caller awaits to be notified when a timer fires.
pub struct TimerStub(Arc<Notify>, Arc<AtomicBool>);

impl TimerStub {
    /// Resolve when the timer fires. Safe to call after the timer
    /// has already fired — returns immediately in that case.
    pub async fn poll(self) {
        if self.1.load(Ordering::SeqCst) {
            return;
        }
        self.0.notified().await;
    }
}

struct Timer(Arc<Notify>, Arc<AtomicBool>);

impl Timer {
    pub fn new() -> Self {
        Timer(Arc::new(Notify::new()), Arc::new(AtomicBool::new(false)))
    }

    pub fn fire(&self) {
        self.1.store(true, Ordering::SeqCst);
        self.0.notify_waiters();
    }

    pub fn subscribe(&self) -> TimerStub {
        TimerStub(self.0.clone(), self.1.clone())
    }
}

/// The shared timer storage. One per process via the `Lazy` in
/// `fast_timeout.rs`.
pub struct TimerManager {
    // Per-thread tree avoids cross-thread lock contention; only
    // the clock thread reads other threads' trees.
    timers: ThreadLocal<RwLock<BTreeMap<Time, Timer>>>,
    zero: Instant,
    clock_watchdog: AtomicI64,
    paused: AtomicBool,
}

// Seconds without a watchdog update before we consider the clock
// thread dead. Must exceed RESOLUTION_DURATION.
const DELAYS_SEC: i64 = 2;

impl Default for TimerManager {
    fn default() -> Self {
        TimerManager {
            timers: ThreadLocal::new(),
            zero: Instant::now(),
            clock_watchdog: AtomicI64::new(-DELAYS_SEC),
            paused: AtomicBool::new(false),
        }
    }
}

impl TimerManager {
    pub fn new() -> Self {
        Self::default()
    }

    /// Sleep for the resolution, then fire any timer whose
    /// deadline has passed. Intended to run on a dedicated
    /// std::thread spawned by [`crate::fast_timeout`]. Loops
    /// forever.
    pub(crate) fn clock_thread(&self) {
        loop {
            std::thread::sleep(RESOLUTION_DURATION);
            let now = Instant::now() - self.zero;
            self.clock_watchdog
                .store(now.as_secs() as i64, Ordering::Relaxed);
            if self.is_paused_for_fork() {
                continue;
            }
            let now = now.as_millis();
            for thread_timer in self.timers.iter() {
                let mut timers = thread_timer.write();
                loop {
                    let key_to_remove = timers.iter().next().and_then(|(k, _)| {
                        if k.not_after(now) {
                            Some(*k)
                        } else {
                            None
                        }
                    });
                    if let Some(k) = key_to_remove {
                        let timer = timers.remove(&k);
                        timer.unwrap().fire();
                    } else {
                        break;
                    }
                }
            }
        }
    }

    /// Returns true exactly once per dead-clock cycle. The caller
    /// owns spawning the clock thread; this lets multiple threads
    /// race safely to start the thread without spawning duplicates.
    pub(crate) fn should_i_start_clock(&self) -> bool {
        let Err(prev) = self.is_clock_running() else {
            return false;
        };
        let now = Instant::now().duration_since(self.zero).as_secs() as i64;
        let res =
            self.clock_watchdog
                .compare_exchange(prev, now, Ordering::SeqCst, Ordering::SeqCst);
        res.is_ok()
    }

    pub(crate) fn is_clock_running(&self) -> Result<(), i64> {
        let now = Instant::now().duration_since(self.zero).as_secs() as i64;
        let prev = self.clock_watchdog.load(Ordering::SeqCst);
        if now < prev + DELAYS_SEC {
            Ok(())
        } else {
            Err(prev)
        }
    }

    /// Register a timer. Returns a [`TimerStub`] that resolves when
    /// the deadline fires. Two registrations with deadlines rounding
    /// to the same 10 ms grid bucket share a Timer.
    pub fn register_timer(&self, duration: Duration) -> TimerStub {
        if self.is_paused_for_fork() {
            // Buffering would be safer but pause_for_fork() is
            // intended to be called immediately before fork() — any
            // timer registered on a non-fork thread is about to be
            // discarded anyway.
            let timer = Timer::new();
            timer.fire();
            return timer.subscribe();
        }
        let now: Time = (Instant::now() + duration - self.zero).into();
        {
            let timers = self.timers.get_or(|| RwLock::new(BTreeMap::new())).read();
            if let Some(t) = timers.get(&now) {
                return t.subscribe();
            }
        }

        let timer = Timer::new();
        let mut timers = self.timers.get_or(|| RwLock::new(BTreeMap::new())).write();
        // Only this thread writes its own tree; the clock thread
        // only removes. So no double-insert race to guard against.
        let stub = timer.subscribe();
        timers.insert(now, timer);
        stub
    }

    fn is_paused_for_fork(&self) -> bool {
        self.paused.load(Ordering::SeqCst)
    }

    /// Stop touching the timer trees so a subsequent `fork()` is
    /// safe (RwLock across fork is UB). Pair with [`Self::unpause`]
    /// in the child immediately after fork.
    pub fn pause_for_fork(&self) {
        self.paused.store(true, Ordering::SeqCst);
        // Give in-flight register_timer calls time to drop their
        // locks.
        std::thread::sleep(RESOLUTION_DURATION * 2);
    }

    /// Resume normal operation after fork.
    pub fn unpause(&self) {
        self.paused.store(false, Ordering::SeqCst)
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn round_to_next_resolution_boundary() {
        assert_eq!(round_to(30, 10), 30);
        assert_eq!(round_to(31, 10), 40);
        assert_eq!(round_to(29, 10), 30);
    }

    #[test]
    fn time_quantizes_to_grid() {
        let t: Time = 128.into(); // rounds up to 130
        assert_eq!(t, Duration::from_millis(130).into());
        assert!(!t.not_after(128));
        assert!(!t.not_after(129));
        assert!(t.not_after(130));
        assert!(t.not_after(131));
    }

    #[tokio::test]
    async fn coalesced_timers_fire_together() {
        let tm_a = Arc::new(TimerManager::new());
        let tm = tm_a.clone();
        std::thread::spawn(move || tm_a.clock_thread());

        let now = Instant::now();
        let t1 = tm.register_timer(Duration::from_millis(100));
        let t2 = tm.register_timer(Duration::from_millis(100));
        t1.poll().await;
        let elapsed_first = now.elapsed();
        let now2 = Instant::now();
        t2.poll().await;
        // Both timers should have rounded to the same bucket and
        // fired together; second poll should see the flag already
        // set.
        assert!(
            now2.elapsed() < Duration::from_millis(20),
            "second timer should have fired with first; took {:?}",
            now2.elapsed()
        );
        assert!(
            elapsed_first >= Duration::from_millis(90),
            "first timer fired too early: {elapsed_first:?}"
        );
    }

    #[test]
    fn should_i_start_clock_is_single_winner() {
        let tm = Arc::new(TimerManager::new());
        assert!(tm.should_i_start_clock());
        assert!(!tm.should_i_start_clock());
        assert!(tm.is_clock_running().is_ok());
    }

    #[test]
    #[ignore] // sleeps DELAYS_SEC+1, slow under cargo test
    fn watchdog_detects_dead_clock_thread() {
        let tm = Arc::new(TimerManager::new());
        assert!(tm.should_i_start_clock());
        assert!(!tm.should_i_start_clock());
        std::thread::sleep(Duration::from_secs(DELAYS_SEC as u64 + 1));
        assert!(tm.is_clock_running().is_err());
        assert!(tm.should_i_start_clock());
    }
}
