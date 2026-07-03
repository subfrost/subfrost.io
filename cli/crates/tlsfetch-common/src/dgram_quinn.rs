//! Bridge from a [`crate::DatagramSocket`] (sync, blocking, simple)
//! to `quinn::AsyncUdpSocket` (async, poll-based, what quinn 0.11
//! actually consumes).
//!
//! ## Status: experimental
//!
//! The bridge compiles, opens a QUIC connection, and shuttles
//! packets bidirectionally — verified with packet traces against
//! `cloudflare-quic.com`. However the QUIC handshake does not
//! currently complete through it: ~120 packets flow in each
//! direction, then the connection stalls. Suspected causes (still
//! under investigation):
//!
//! - quinn's `try_send` may expect particular `WouldBlock` semantics
//!   our generic `DatagramSocket` doesn't surface.
//! - `RecvMeta::dst_ip`, ECN, or stride may need to be populated
//!   for quinn's path-validation state to advance.
//! - The `UdpPoller::poll_writable` "always writable" stub may
//!   prevent quinn from registering wakeups it expects on send
//!   backpressure.
//!
//! Default HTTP/3 (via [`crate::http3::send_request`], using
//! quinn's built-in tokio UDP transport) is unaffected and ships
//! green. The bridge is exposed via
//! [`crate::http3::send_request_with_factory`] for users who want
//! to plug a custom UDP transport once the handshake issue is
//! resolved.
//!
//! This lets a caller plug a custom UDP-style transport into the
//! HTTP/3 stack — e.g. UDP-over-TLS, UDP through a SOCKS5 UDP
//! associate, or a unit-test mock — without having to reimplement
//! quinn's whole transport layer.
//!
//! How it works:
//!
//! - On construction we spawn a `tokio::task::spawn_blocking` that
//!   loops on the underlying `DatagramSocket::recv`, pushing each
//!   packet into an `mpsc::UnboundedSender` along with a `Notify`
//!   wakeup so any task currently parked in `poll_recv` can make
//!   progress.
//! - `try_send` runs the underlying `DatagramSocket::send` directly.
//!   We don't use a separate task because UDP sends are essentially
//!   non-blocking (kernel just memcpy's into the socket buffer);
//!   blocking briefly under the quinn driver is acceptable and
//!   simpler than another channel.
//! - `poll_recv` drains queued packets into the caller's `IoSliceMut`
//!   buffers (one packet per slice), then registers the waker if
//!   nothing was queued.
//! - `create_io_poller` returns a "always writable" poller — we
//!   never apply backpressure on the send side.
//!
//! ## Wasm note
//!
//! quinn 0.11 itself doesn't compile to `wasm32-unknown-unknown`
//! today: it depends transitively on `mio` (via `quinn-udp`) and on
//! tokio's reactor primitives. The `dgram_quinn` adapter therefore
//! only builds on native targets even though the underlying
//! `DatagramSocket` trait is wasm-friendly.
//!
//! For a true wasm HTTP/3 client we'd need a state-machine QUIC
//! stack (e.g. `quiche::Connection`) driven by JS-supplied UDP
//! callbacks, similar to how `tlsfetch-web-sys` already drives
//! rustls. That's tracked separately as Phase 3b.

#![cfg(feature = "http3")]

use std::fmt;
use std::io::{self, IoSliceMut};
use std::net::SocketAddr;
use std::pin::Pin;
use std::sync::{Arc, Mutex};
use std::task::{Context, Poll};

use quinn::udp::{RecvMeta, Transmit};
use quinn::{AsyncUdpSocket, UdpPoller};
use tokio::sync::mpsc;

use crate::datagram::DatagramSocket;

/// Bridge struct. Constructed with `Self::new(socket)` and then
/// passed to `quinn::Endpoint::new_with_abstract_socket`.
pub struct DatagramAsyncUdpSocket {
    local: SocketAddr,
    peer: SocketAddr,
    /// Send-side mutex around the underlying socket. The receive
    /// pump task also locks this briefly per non-blocking poll, so
    /// the lock is never held across a blocking call.
    socket: Arc<Mutex<dyn DatagramSocket>>,
    /// Channel receiver. tokio's `UnboundedReceiver::poll_recv`
    /// handles waker registration internally — that's how we
    /// avoid the missed-wakeup race that a hand-rolled waker slot
    /// would have.
    rx: tokio::sync::Mutex<mpsc::UnboundedReceiver<io::Result<Vec<u8>>>>,
}

impl fmt::Debug for DatagramAsyncUdpSocket {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        f.debug_struct("DatagramAsyncUdpSocket")
            .field("local", &self.local)
            .finish()
    }
}

impl DatagramAsyncUdpSocket {
    /// Wrap a [`DatagramSocket`] in the quinn-compatible adapter.
    /// Spawns a background `spawn_blocking` task that pumps the
    /// receive side; that task lives until the channel receiver
    /// is dropped or the socket errors.
    ///
    /// The underlying socket MUST be in non-blocking mode (so each
    /// `recv` returns `WouldBlock` immediately when no packet is
    /// queued) — otherwise the recv pump would hold the send-side
    /// mutex across a blocking syscall and starve `try_send`.
    pub fn new<S: DatagramSocket>(socket: S) -> io::Result<Self> {
        let local = socket.local_addr()?;
        let peer = socket.peer_addr()?;
        let socket: Arc<Mutex<dyn DatagramSocket>> = Arc::new(Mutex::new(socket));
        let (tx, rx) = mpsc::unbounded_channel();

        let socket_recv = socket.clone();
        tokio::task::spawn_blocking(move || {
            let mut buf = vec![0u8; 65_535];
            loop {
                let result = {
                    let mut guard = match socket_recv.lock() {
                        Ok(g) => g,
                        Err(_) => return,
                    };
                    guard.recv(&mut buf)
                };
                match result {
                    Ok(0) => {}
                    Ok(n) => {
                        if tx.send(Ok(buf[..n].to_vec())).is_err() {
                            return;
                        }
                    }
                    Err(e) if e.kind() == io::ErrorKind::WouldBlock => {
                        std::thread::sleep(std::time::Duration::from_millis(1));
                    }
                    Err(e) => {
                        let _ = tx.send(Err(e));
                        return;
                    }
                }
            }
        });

        Ok(Self {
            local,
            peer,
            socket,
            rx: tokio::sync::Mutex::new(rx),
        })
    }
}

impl AsyncUdpSocket for DatagramAsyncUdpSocket {
    fn create_io_poller(self: Arc<Self>) -> Pin<Box<dyn UdpPoller>> {
        Box::pin(AlwaysWritable)
    }

    fn try_send(&self, transmit: &Transmit) -> io::Result<()> {
        let segment_size = transmit.segment_size.unwrap_or(transmit.contents.len());
        if segment_size == 0 {
            return Ok(());
        }
        let mut guard = self
            .socket
            .lock()
            .map_err(|_| io::Error::new(io::ErrorKind::Other, "socket mutex poisoned"))?;
        for chunk in transmit.contents.chunks(segment_size) {
            guard.send(chunk)?;
        }
        Ok(())
    }

    fn poll_recv(
        &self,
        cx: &mut Context,
        bufs: &mut [IoSliceMut<'_>],
        meta: &mut [RecvMeta],
    ) -> Poll<io::Result<usize>> {
        if bufs.is_empty() {
            return Poll::Ready(Ok(0));
        }

        // tokio::sync::Mutex::try_lock is sync; if we can't grab
        // it (another poll in flight on a different task), tell
        // quinn to come back later. quinn calls poll_recv from a
        // single task in practice so this is just defensive.
        let mut rx = match self.rx.try_lock() {
            Ok(g) => g,
            Err(_) => {
                cx.waker().wake_by_ref();
                return Poll::Pending;
            }
        };

        // First packet: poll_recv on the channel registers the
        // waker internally — that's how we avoid the missed-wakeup
        // race a hand-rolled waker slot would have. If a packet is
        // ready, opportunistically drain more via try_recv.
        // Yield exactly one packet per call. tokio mpsc's
        // `poll_recv` re-arms the waker on every call that returns
        // `Ready(Some(_))`, so a strict one-per-poll cadence keeps
        // wakeups reliable. Draining extra packets via `try_recv`
        // would orphan their wake signals. quinn will re-poll
        // immediately after each Ready return, so the throughput
        // hit is just an extra poll per packet — fine for HTTP/3
        // request volumes.
        let pkt = match rx.poll_recv(cx) {
            Poll::Ready(Some(Ok(p))) => p,
            Poll::Ready(Some(Err(e))) => return Poll::Ready(Err(e)),
            Poll::Ready(None) => {
                return Poll::Ready(Err(io::Error::new(
                    io::ErrorKind::UnexpectedEof,
                    "datagram recv task ended",
                )));
            }
            Poll::Pending => return Poll::Pending,
        };

        let buf_slot = &mut bufs[0];
        let n = pkt.len().min(buf_slot.len());
        buf_slot[..n].copy_from_slice(&pkt[..n]);
        meta[0] = RecvMeta {
            addr: self.peer,
            len: n,
            stride: n,
            ecn: None,
            dst_ip: None,
        };
        Poll::Ready(Ok(1))
    }

    fn local_addr(&self) -> io::Result<SocketAddr> {
        Ok(self.local)
    }

    fn may_fragment(&self) -> bool {
        // We have no way to set IPV6_DONTFRAG on a generic
        // DatagramSocket, so be honest about it.
        true
    }
}

#[derive(Debug)]
struct AlwaysWritable;

impl UdpPoller for AlwaysWritable {
    fn poll_writable(self: Pin<&mut Self>, _cx: &mut Context) -> Poll<io::Result<()>> {
        Poll::Ready(Ok(()))
    }
}
