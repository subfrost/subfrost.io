// Adapted from cloudflare/pingora-timeout (Apache-2.0). This crate
// keeps the same public surface so it can drop into call sites that
// previously used `tokio::time::timeout` with no other changes.
//
// Divergence from upstream:
//   - Renamed re-exports' module path (pingora_timeout → tlsfetch_timeout).
//   - No `benches/` directory — we'd add one if our own profiling
//     ever needed it; pingora's published numbers are good enough as
//     a justification.
//   - No `clippy::all` warn at crate level — workspace lints handle that.

//! Lazy-init shared-timer timeout primitive — drop-in faster
//! replacement for [`tokio::time::timeout`].
//!
//! Three optimizations vs tokio's default timer:
//! - **Lazy timer init.** The timeout's timer is only created the
//!   first time the inner future returns `Pending`. Busy IO that's
//!   ready immediately (TCP read with data already buffered, in-
//!   memory channels, etc.) never touches the timer at all.
//! - **No global lock.** Per-thread timer trees mean creating /
//!   cancelling timeouts doesn't contend with other threads.
//! - **Timer sharing + 10 ms quantization.** Multiple timeouts with
//!   the same deadline (rounded to the next 10 ms tick) share a
//!   single timer entry. Drastically cuts allocator and waker
//!   traffic under load.
//!
//! Pingora's measured numbers (which carry over since the code is
//! lifted with minor renames): create/drop a timeout in ~4 ns avg
//! vs ~107 ns for `tokio::time::timeout`. The wins matter once you
//! cross ~100 timeouts/sec process-wide; below that, either
//! primitive is fine. tlsd will be well above the threshold.
//!
//! ## Usage
//!
//! Drop-in for `tokio::time::timeout`:
//!
//! ```ignore
//! use tlsfetch_timeout::timeout;
//! use std::time::Duration;
//!
//! let result = timeout(Duration::from_secs(5), some_async_op()).await;
//! ```
//!
//! Or sleep:
//!
//! ```ignore
//! use tlsfetch_timeout::sleep;
//! sleep(Duration::from_millis(100)).await;
//! ```

pub mod fast_timeout;
pub mod timer;

pub use fast_timeout::fast_sleep as sleep;
pub use fast_timeout::fast_timeout as timeout;

use pin_project_lite::pin_project;
use std::future::Future;
use std::pin::Pin;
use std::task::{self, Poll};
use tokio::time::{sleep as tokio_sleep, Duration};

/// The interface used by [`Timeout`] to spawn its delay future.
///
/// Users don't need to interact with this trait directly — it's
/// implemented for the [`fast_timeout::FastTimeout`] and
/// [`TokioTimeout`] types this crate ships.
pub trait ToTimeout {
    fn timeout(&self) -> Pin<Box<dyn Future<Output = ()> + Send + Sync>>;
    fn create(d: Duration) -> Self;
}

/// The timeout-callback produced by [`tokio_timeout()`] — uses
/// `tokio::time::sleep` for the delay, but keeps the lazy-init
/// behaviour that's the smaller half of this crate's win.
pub struct TokioTimeout(Duration);

impl ToTimeout for TokioTimeout {
    fn timeout(&self) -> Pin<Box<dyn Future<Output = ()> + Send + Sync>> {
        Box::pin(tokio_sleep(self.0))
    }

    fn create(d: Duration) -> Self {
        TokioTimeout(d)
    }
}

/// Error returned when a [`Timeout`] elapses before its inner future
/// completes.
#[derive(Debug)]
pub struct Elapsed;

impl std::fmt::Display for Elapsed {
    fn fmt(&self, f: &mut std::fmt::Formatter<'_>) -> std::fmt::Result {
        write!(f, "Timeout Elapsed")
    }
}

impl std::error::Error for Elapsed {}

/// [`tokio::time::timeout`] with lazy timer initialization but
/// without the shared-timer optimization. Useful when you only
/// occasionally need a timeout (a few per second) and don't want
/// to pay the cost of starting the clock thread that [`timeout`]
/// (i.e. [`fast_timeout`](fast_timeout::fast_timeout)) spawns.
pub fn tokio_timeout<T>(duration: Duration, future: T) -> Timeout<T, TokioTimeout>
where
    T: Future,
{
    Timeout::<T, TokioTimeout>::new_with_delay(future, duration)
}

pin_project! {
    /// Future returned by the timeout functions. Polls the inner
    /// future first on every wake; only creates the timer on the
    /// first Pending return.
    #[must_use = "futures do nothing unless you `.await` or poll them"]
    pub struct Timeout<T, F> {
        #[pin]
        value: T,
        #[pin]
        delay: Option<Pin<Box<dyn Future<Output = ()> + Send + Sync>>>,
        callback: F,
    }
}

impl<T, F> Timeout<T, F>
where
    F: ToTimeout,
{
    pub(crate) fn new_with_delay(value: T, d: Duration) -> Timeout<T, F> {
        Timeout {
            value,
            delay: None,
            callback: F::create(d),
        }
    }
}

impl<T, F> Future for Timeout<T, F>
where
    T: Future,
    F: ToTimeout,
{
    type Output = Result<T::Output, Elapsed>;

    fn poll(self: Pin<&mut Self>, cx: &mut task::Context<'_>) -> Poll<Self::Output> {
        let mut me = self.project();

        // Try the inner future first. Cheap path — if it's ready,
        // we never even allocate the timer.
        if let Poll::Ready(v) = me.value.poll(cx) {
            return Poll::Ready(Ok(v));
        }

        let delay = me
            .delay
            .get_or_insert_with(|| Box::pin(me.callback.timeout()));

        match delay.as_mut().poll(cx) {
            Poll::Pending => Poll::Pending,
            Poll::Ready(()) => Poll::Ready(Err(Elapsed {})),
        }
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[tokio::test]
    async fn timeout_fires_when_inner_future_takes_too_long() {
        let fut = tokio_sleep(Duration::from_secs(1000));
        let to = timeout(Duration::from_millis(20), fut);
        assert!(to.await.is_err());
    }

    #[tokio::test]
    async fn timeout_passes_through_immediate_value() {
        let fut = async { 42 };
        let to = timeout(Duration::from_secs(1), fut);
        assert_eq!(to.await.unwrap(), 42);
    }

    #[tokio::test]
    async fn timeout_passes_through_delayed_value_within_budget() {
        let fut = async {
            tokio_sleep(Duration::from_millis(20)).await;
            42
        };
        let to = timeout(Duration::from_secs(1), fut);
        assert_eq!(to.await.unwrap(), 42);
    }

    #[tokio::test]
    async fn tokio_timeout_variant_works() {
        // Same semantics as `timeout`, but without spawning the
        // shared clock thread. Useful as a sanity check that the
        // lazy-init core itself is sound independent of the timer
        // manager.
        let fut = tokio_sleep(Duration::from_secs(1000));
        let to = tokio_timeout(Duration::from_millis(20), fut);
        assert!(to.await.is_err());
    }
}
