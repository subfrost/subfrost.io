//! The abstract socket trait. Implement this for any byte-stream
//! transport you want to wrap with TLS.
//!
//! On native targets, `tlsfetch-sys` provides a `TcpSocket` impl over
//! `std::net::TcpStream`. On wasm, `tlsfetch-web-sys` provides a
//! `JsSocket` impl that delegates to a JS-supplied object with
//! `read`/`write`/`close` methods.

/// A duplex byte stream. Synchronous and blocking — TLS state machine
/// drives reads/writes one chunk at a time, polling until the rustls
/// state machine is satisfied.
///
/// We deliberately don't use `std::io::Read`/`Write` directly because
/// the wasm side has its own quirks around blocking — but the contract
/// is the same:
///   - `read` blocks until at least one byte is available, returning
///     the number of bytes written into `buf`. Return `Ok(0)` only on
///     clean EOF.
///   - `write` blocks until all bytes have been queued for sending.
///   - `close` is best-effort; idempotent.
pub trait Socket {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize>;
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize>;
    fn flush(&mut self) -> std::io::Result<()> {
        Ok(())
    }
    fn close(&mut self) -> std::io::Result<()> {
        Ok(())
    }
}

/// Blanket impl for anything that's already `Read + Write`. Lets us
/// pass `std::net::TcpStream` straight through.
impl<T: std::io::Read + std::io::Write> Socket for T {
    fn read(&mut self, buf: &mut [u8]) -> std::io::Result<usize> {
        std::io::Read::read(self, buf)
    }
    fn write(&mut self, buf: &[u8]) -> std::io::Result<usize> {
        std::io::Write::write(self, buf)
    }
    fn flush(&mut self) -> std::io::Result<()> {
        std::io::Write::flush(self)
    }
}

/// Factory for creating new sockets per-request. The HTTP client uses
/// this to dial a fresh TCP connection for each request (HTTP/1.1
/// `Connection: close`) or to establish a multiplexed pool (HTTP/2/3).
pub trait SocketFactory {
    type Socket: Socket;
    type Error: std::fmt::Display + std::fmt::Debug + Send + Sync + 'static;

    /// Open a new socket to `host:port`. The implementation is free to
    /// resolve `host` however it likes — DNS, hosts file, /etc/hosts,
    /// `--resolve` overrides, a custom device resolver, etc.
    fn connect(
        &self,
        host: &str,
        port: u16,
        timeout: Option<std::time::Duration>,
    ) -> Result<Self::Socket, Self::Error>;
}

/// Adapter for the HTTP/2 native path.
///
/// `tlsfetch-common`'s H2 codec sits on top of `tokio-rustls`, which
/// needs a `tokio::net::TcpStream` as its underlying transport. The
/// generic [`Socket`] is a blocking byte stream — to bridge,
/// implementations that wrap a real OS socket expose the inner
/// `std::net::TcpStream` here; the H2 caller flips it to non-blocking
/// and hands it to `tokio::net::TcpStream::from_std`.
///
/// `HttpConnectProxy<F>` and SOCKS5 wrappers inherit this for free as
/// long as their inner `F::Socket` implements it — they perform their
/// blocking handshake against the inner socket, then yield the same
/// socket type back. A wasm `Socket` impl that isn't backed by a real
/// `std::net::TcpStream` simply doesn't implement this trait; the H2
/// path is native-only anyway (gated by `feature = "http2"`).
pub trait IntoStdTcpStream {
    fn into_std_tcp_stream(self) -> std::io::Result<std::net::TcpStream>;
}

