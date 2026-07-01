// Adapted from cloudflare/pingora-timeout/src/fast_timeout.rs (Apache-2.0).

//! The actual fast-path entry points: [`fast_timeout`] and
//! [`fast_sleep`]. Both lazy-initialize a single process-wide
//! [`TimerManager`] on first call and spawn the clock thread the
//! first time the manager looks dead.

use super::timer::*;
use super::*;
use once_cell::sync::Lazy;
use std::sync::Arc;

static TIMER_MANAGER: Lazy<Arc<TimerManager>> = Lazy::new(|| {
    let tm = Arc::new(TimerManager::new());
    check_clock_thread(&tm);
    tm
});

fn check_clock_thread(tm: &Arc<TimerManager>) {
    if tm.should_i_start_clock() {
        std::thread::Builder::new()
            .name("tlsfetch-timer".into())
            .spawn(|| TIMER_MANAGER.clock_thread())
            .expect("spawn timer thread");
    }
}

/// Per-timeout state for [`fast_timeout`]. Just holds the
/// duration; the actual timer is registered lazily on first poll.
pub struct FastTimeout(Duration);

impl ToTimeout for FastTimeout {
    fn timeout(&self) -> Pin<Box<dyn Future<Output = ()> + Send + Sync>> {
        Box::pin(TIMER_MANAGER.register_timer(self.0).poll())
    }

    fn create(d: Duration) -> Self {
        FastTimeout(d)
    }
}

/// Drop-in replacement for [`tokio::time::timeout`]. Lazily
/// initializes the per-call timer on first Pending; shares timers
/// across concurrent calls with the same 10 ms-rounded deadline.
pub fn fast_timeout<T>(duration: Duration, future: T) -> Timeout<T, FastTimeout>
where
    T: Future,
{
    check_clock_thread(&TIMER_MANAGER);
    Timeout::new_with_delay(future, duration)
}

/// Drop-in replacement for [`tokio::time::sleep`]. Shares the
/// same per-process timer manager as [`fast_timeout`].
pub async fn fast_sleep(duration: Duration) {
    check_clock_thread(&TIMER_MANAGER);
    TIMER_MANAGER.register_timer(duration).poll().await
}

/// Pause the timer manager so a subsequent `fork()` is safe.
/// Pair with [`unpause`] in the child immediately after fork.
pub fn pause_for_fork() {
    TIMER_MANAGER.pause_for_fork();
}

/// Resume the timer manager after fork.
pub fn unpause() {
    TIMER_MANAGER.unpause();
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn fast_timeout_fires_on_overrun() {
        let fut = tokio_sleep(Duration::from_secs(1000));
        let to = fast_timeout(Duration::from_millis(30), fut);
        assert!(to.await.is_err());
    }

    #[tokio::test]
    async fn fast_timeout_passes_immediate_value() {
        let fut = async { 1 };
        let to = fast_timeout(Duration::from_secs(1), fut);
        assert_eq!(to.await.unwrap(), 1);
    }

    #[tokio::test]
    async fn fast_timeout_passes_delayed_value() {
        let fut = async {
            tokio_sleep(Duration::from_millis(20)).await;
            7
        };
        let to = fast_timeout(Duration::from_secs(1), fut);
        assert_eq!(to.await.unwrap(), 7);
    }

    #[tokio::test]
    async fn fast_sleep_then_fast_timeout_compose() {
        let fut = async {
            fast_sleep(Duration::from_millis(20)).await;
            9
        };
        let to = fast_timeout(Duration::from_secs(1), fut);
        assert_eq!(to.await.unwrap(), 9);
    }
}
