//! UDP datagram socket trait, used by the HTTP/3 support and any
//! consumer that wants to plug a custom UDP-style transport (e.g. an
//! IP-over-WebSocket tunnel) into the QUIC stack.
//!
//! See [`crate::dgram_quinn`] for the bridge that turns a
//! [`DatagramSocket`] into a `quinn::AsyncUdpSocket`.

use std::net::SocketAddr;
use std::time::Duration;

/// A connected UDP socket — i.e. you supplied a remote address at
/// open time and `send` always targets that peer. Matches the QUIC
/// expected socket model.
pub trait DatagramSocket: Send + 'static {
    /// Receive one packet into `buf`. Returns the number of bytes
    /// written. Blocks until a packet arrives or the read timeout
    /// elapses.
    fn recv(&mut self, buf: &mut [u8]) -> std::io::Result<usize>;

    /// Send `buf` as a single packet to the connected peer.
    fn send(&mut self, buf: &[u8]) -> std::io::Result<usize>;

    /// The bound local address. quinn needs this for the QUIC
    /// connection ID + path validation.
    fn local_addr(&self) -> std::io::Result<SocketAddr>;

    /// The connected peer address. Same use as `local_addr`.
    fn peer_addr(&self) -> std::io::Result<SocketAddr>;

    /// Best-effort close.
    fn close(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Factory for creating new connected UDP sockets per-request.
pub trait DatagramSocketFactory {
    type Socket: DatagramSocket;
    type Error: std::fmt::Display + std::fmt::Debug + Send + Sync + 'static;

    fn connect(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> Result<Self::Socket, Self::Error>;
}
