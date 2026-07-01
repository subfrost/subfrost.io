//! `tlsfetch-sys` — native socket backends for tlsfetch.
//!
//! Provides:
//!   - [`TcpSocket`] / [`TcpSocketFactory`] over `std::net::TcpStream`
//!   - [`UdpSocket`] / [`UdpSocketFactory`] over `std::net::UdpSocket`
//!     (used by the upcoming HTTP/3 support in Phase 3)
//!
//! These plug into `tlsfetch_common::HttpClient<F: SocketFactory>` so
//! the rest of the library is identical between native and wasm.

use std::io;
use std::net::{TcpStream, ToSocketAddrs, UdpSocket as StdUdpSocket};
use std::time::Duration;

use tlsfetch_common::datagram::{DatagramSocket, DatagramSocketFactory};
use tlsfetch_common::socket::{IntoStdTcpStream, Socket, SocketFactory};

#[cfg(feature = "ws-tunnel")]
pub mod ws_tcp;
#[cfg(feature = "ws-tunnel")]
pub use ws_tcp::{WsSocket, WsTcpFactory};

// ============ TCP ============

/// A blocking TCP socket. Already implements `Socket` via the blanket
/// `Read + Write` impl in tlsfetch-common — this struct exists mostly
/// to give callers a typed handle and a friendly `connect` constructor.
pub struct TcpSocket {
    stream: TcpStream,
}

impl TcpSocket {
    pub fn from_stream(stream: TcpStream) -> Self {
        TcpSocket { stream }
    }

    pub fn into_inner(self) -> TcpStream {
        self.stream
    }
}

impl IntoStdTcpStream for TcpSocket {
    fn into_std_tcp_stream(self) -> io::Result<TcpStream> {
        Ok(self.stream)
    }
}

impl Socket for TcpSocket {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        std::io::Read::read(&mut self.stream, buf)
    }

    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        std::io::Write::write(&mut self.stream, buf)
    }

    fn flush(&mut self) -> io::Result<()> {
        std::io::Write::flush(&mut self.stream)
    }

    fn close(&mut self) -> io::Result<()> {
        let _ = self.stream.shutdown(std::net::Shutdown::Both);
        Ok(())
    }
}

#[derive(Default, Clone)]
pub struct TcpSocketFactory;

impl TcpSocketFactory {
    pub fn new() -> Self {
        Self
    }
}

impl SocketFactory for TcpSocketFactory {
    type Socket = TcpSocket;
    type Error = io::Error;

    fn connect(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> Result<Self::Socket, Self::Error> {
        let addr = format!("{}:{}", host, port);
        let mut last_err: Option<io::Error> = None;
        for sa in addr.to_socket_addrs()? {
            let result = match timeout {
                Some(t) => TcpStream::connect_timeout(&sa, t),
                None => TcpStream::connect(sa),
            };
            match result {
                Ok(stream) => {
                    if let Some(t) = timeout {
                        let _ = stream.set_read_timeout(Some(t));
                        let _ = stream.set_write_timeout(Some(t));
                    }
                    let _ = stream.set_nodelay(true);
                    return Ok(TcpSocket { stream });
                }
                Err(e) => last_err = Some(e),
            }
        }
        Err(last_err.unwrap_or_else(|| io::Error::new(io::ErrorKind::Other, "no address resolved")))
    }
}

// ============ UDP (for HTTP/3) ============

pub struct UdpSocket {
    inner: StdUdpSocket,
}

impl UdpSocket {
    pub fn into_inner(self) -> StdUdpSocket {
        self.inner
    }
}

impl DatagramSocket for UdpSocket {
    fn recv(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        self.inner.recv(buf)
    }
    fn send(&mut self, buf: &[u8]) -> io::Result<usize> {
        self.inner.send(buf)
    }
    fn local_addr(&self) -> io::Result<std::net::SocketAddr> {
        self.inner.local_addr()
    }
    fn peer_addr(&self) -> io::Result<std::net::SocketAddr> {
        self.inner.peer_addr()
    }
}

#[derive(Default, Clone)]
pub struct UdpSocketFactory;

impl UdpSocketFactory {
    pub fn new() -> Self {
        Self
    }
}

impl DatagramSocketFactory for UdpSocketFactory {
    type Socket = UdpSocket;
    type Error = io::Error;

    fn connect(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> Result<Self::Socket, Self::Error> {
        let addrs: Vec<_> = format!("{}:{}", host, port).to_socket_addrs()?.collect();
        let any = addrs
            .first()
            .ok_or_else(|| io::Error::new(io::ErrorKind::Other, "no address resolved"))?;
        let bind_addr = if any.is_ipv4() { "0.0.0.0:0" } else { "[::]:0" };
        let sock = StdUdpSocket::bind(bind_addr)?;
        sock.connect(any)?;
        // Non-blocking is required for the dgram_quinn bridge, which
        // pumps recv on a spawn_blocking task and needs the recv to
        // return WouldBlock promptly so the send-side mutex doesn't
        // get starved. The brief poll-loop in dgram_quinn handles
        // the WouldBlock case with a 1ms sleep.
        sock.set_nonblocking(true)?;
        // Connect timeout doesn't really apply to UDP (no handshake)
        // but we honor it for read_timeout parity. Quinn drives its
        // own QUIC handshake timeout on top.
        let _ = timeout;
        Ok(UdpSocket { inner: sock })
    }
}
