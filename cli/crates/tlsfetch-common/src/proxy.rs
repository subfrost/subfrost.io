//! Proxy support — `HttpConnectProxy` and `Socks5Proxy`.
//!
//! Both are implemented as [`crate::SocketFactory`] wrappers: the
//! wrapper dials the configured proxy via the inner factory,
//! performs the proxy handshake (HTTP CONNECT or SOCKS5), and yields
//! the resulting `Socket` to the caller. From [`crate::TlsConnection`]'s
//! perspective the returned socket is just a regular byte stream — TLS
//! is layered on top of the proxy tunnel exactly as it would be
//! layered on a direct TCP connection.
//!
//! ## Design
//!
//! The wrappers are generic over the inner [`crate::SocketFactory`],
//! so the same proxy code drives the native (`tlsfetch-sys`) and
//! wasm (`tlsfetch-web-sys`) builds: native gets its `TcpStream`
//! through the proxy, wasm gets its JS-supplied socket through the
//! proxy. No transport assumptions.
//!
//! ## Curl flag mapping
//!
//! | curl flag | tlsfetch type |
//! |---|---|
//! | `-x http://[user:pass@]host:port` | [`HttpConnectProxy`] |
//! | `--proxy-user user:pass` | added to the `Proxy-Authorization` header |
//! | `-x socks5://[user:pass@]host:port` | [`Socks5Proxy`] (atyp = ipv4/ipv6) |
//! | `--socks5-hostname host:port` | [`Socks5Proxy`] (atyp = domain) |
//!
//! Both wrappers honor `NO_PROXY` matching done at the CLI layer
//! (see `cli::pick_proxy`).

use std::fmt;
use std::io;
use std::time::Duration;

use crate::socket::{Socket, SocketFactory};

/// What address type the SOCKS5 connect request should use.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Socks5Resolution {
    /// Resolve `host` locally and send an IPv4/IPv6 atyp. Curl: `--socks5`.
    LocalDns,
    /// Send `host` as a domain-name atyp and let the proxy resolve.
    /// Curl: `--socks5-hostname`. Better for anonymity.
    RemoteDns,
}

/// Proxy authentication credentials.
#[derive(Debug, Clone)]
pub struct ProxyAuth {
    pub user: String,
    pub pass: String,
}

/// HTTP CONNECT proxy. Wraps an inner SocketFactory.
#[derive(Debug, Clone)]
pub struct HttpConnectProxy<F: SocketFactory> {
    inner: F,
    proxy_host: String,
    proxy_port: u16,
    auth: Option<ProxyAuth>,
}

impl<F: SocketFactory> HttpConnectProxy<F> {
    pub fn new(inner: F, proxy_host: impl Into<String>, proxy_port: u16) -> Self {
        Self {
            inner,
            proxy_host: proxy_host.into(),
            proxy_port,
            auth: None,
        }
    }

    pub fn with_auth(mut self, user: impl Into<String>, pass: impl Into<String>) -> Self {
        self.auth = Some(ProxyAuth {
            user: user.into(),
            pass: pass.into(),
        });
        self
    }
}

impl<F> SocketFactory for HttpConnectProxy<F>
where
    F: SocketFactory,
    F::Socket: Socket,
{
    type Socket = F::Socket;
    type Error = ProxyError;

    fn connect(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> Result<Self::Socket, Self::Error> {
        // 1. Dial the proxy via the inner factory.
        let mut sock = self
            .inner
            .connect(&self.proxy_host, self.proxy_port, timeout)
            .map_err(|e| ProxyError::Inner(e.to_string()))?;

        // 2. Send the CONNECT request.
        let mut req = format!("CONNECT {host}:{port} HTTP/1.1\r\nHost: {host}:{port}\r\n");
        if let Some(auth) = &self.auth {
            use base64::Engine;
            let cred = format!("{}:{}", auth.user, auth.pass);
            let b64 = base64::engine::general_purpose::STANDARD.encode(cred.as_bytes());
            req.push_str(&format!("Proxy-Authorization: Basic {b64}\r\n"));
        }
        req.push_str("Proxy-Connection: Keep-Alive\r\n\r\n");
        write_all(&mut sock, req.as_bytes())?;

        // 3. Read the response head until \r\n\r\n. We don't care
        //    about the body — CONNECT responses don't have one.
        let head = read_until_double_crlf(&mut sock)?;

        // 4. Parse status line.
        let first_line = head
            .split(|&b| b == b'\n')
            .next()
            .ok_or_else(|| ProxyError::BadResponse("empty response".into()))?;
        let line = std::str::from_utf8(first_line)
            .map_err(|_| ProxyError::BadResponse("non-utf8 status line".into()))?
            .trim_end_matches('\r');
        // "HTTP/1.1 200 Connection established"
        let mut parts = line.splitn(3, ' ');
        let _version = parts.next();
        let status = parts
            .next()
            .and_then(|s| s.parse::<u16>().ok())
            .ok_or_else(|| ProxyError::BadResponse(format!("bad status line: {line:?}")))?;
        if !(200..300).contains(&status) {
            return Err(ProxyError::ConnectFailed {
                status,
                line: line.to_string(),
            });
        }

        Ok(sock)
    }
}

/// SOCKS5 proxy. Wraps an inner SocketFactory.
#[derive(Debug, Clone)]
pub struct Socks5Proxy<F: SocketFactory> {
    inner: F,
    proxy_host: String,
    proxy_port: u16,
    auth: Option<ProxyAuth>,
    resolution: Socks5Resolution,
}

impl<F: SocketFactory> Socks5Proxy<F> {
    pub fn new(
        inner: F,
        proxy_host: impl Into<String>,
        proxy_port: u16,
        resolution: Socks5Resolution,
    ) -> Self {
        Self {
            inner,
            proxy_host: proxy_host.into(),
            proxy_port,
            auth: None,
            resolution,
        }
    }

    pub fn with_auth(mut self, user: impl Into<String>, pass: impl Into<String>) -> Self {
        self.auth = Some(ProxyAuth {
            user: user.into(),
            pass: pass.into(),
        });
        self
    }
}

impl<F> SocketFactory for Socks5Proxy<F>
where
    F: SocketFactory,
    F::Socket: Socket,
{
    type Socket = F::Socket;
    type Error = ProxyError;

    fn connect(
        &self,
        host: &str,
        port: u16,
        timeout: Option<Duration>,
    ) -> Result<Self::Socket, Self::Error> {
        // 1. Dial the proxy.
        let mut sock = self
            .inner
            .connect(&self.proxy_host, self.proxy_port, timeout)
            .map_err(|e| ProxyError::Inner(e.to_string()))?;

        // 2. Greeting. RFC 1928 §3.
        //    +----+----------+----------+
        //    |VER | NMETHODS | METHODS  |
        //    +----+----------+----------+
        //    | 1  |    1     | 1 to 255 |
        let mut methods: Vec<u8> = vec![0x00]; // no auth
        if self.auth.is_some() {
            methods.push(0x02); // username/password
        }
        let mut greeting = vec![0x05u8, methods.len() as u8];
        greeting.extend_from_slice(&methods);
        write_all(&mut sock, &greeting)?;

        // Server response: VER METHOD
        let mut buf = [0u8; 2];
        read_exact(&mut sock, &mut buf)?;
        if buf[0] != 0x05 {
            return Err(ProxyError::BadResponse(format!(
                "socks5: wrong version {}",
                buf[0]
            )));
        }
        match buf[1] {
            0x00 => { /* no auth needed */ }
            0x02 => {
                // RFC 1929 username/password sub-negotiation:
                //  +----+------+----------+------+----------+
                //  |VER | ULEN |  UNAME   | PLEN |  PASSWD  |
                //  +----+------+----------+------+----------+
                let auth = self
                    .auth
                    .as_ref()
                    .ok_or_else(|| ProxyError::BadResponse("server demanded auth, none configured".into()))?;
                if auth.user.len() > 255 || auth.pass.len() > 255 {
                    return Err(ProxyError::BadConfig("user/pass > 255 bytes".into()));
                }
                let mut sub = vec![0x01u8, auth.user.len() as u8];
                sub.extend_from_slice(auth.user.as_bytes());
                sub.push(auth.pass.len() as u8);
                sub.extend_from_slice(auth.pass.as_bytes());
                write_all(&mut sock, &sub)?;
                let mut resp = [0u8; 2];
                read_exact(&mut sock, &mut resp)?;
                if resp[0] != 0x01 || resp[1] != 0x00 {
                    return Err(ProxyError::AuthFailed);
                }
            }
            0xff => return Err(ProxyError::BadResponse("socks5: no acceptable methods".into())),
            other => {
                return Err(ProxyError::BadResponse(format!(
                    "socks5: unsupported method {other:#x}"
                )))
            }
        }

        // 3. CONNECT request. RFC 1928 §4.
        //    +----+-----+-------+------+----------+----------+
        //    |VER | CMD |  RSV  | ATYP | DST.ADDR | DST.PORT |
        //    +----+-----+-------+------+----------+----------+
        let mut req = vec![0x05u8, 0x01, 0x00];
        let want_remote_dns = matches!(self.resolution, Socks5Resolution::RemoteDns);

        if !want_remote_dns {
            // Try parsing host as a literal IP first.
            if let Ok(ip) = host.parse::<std::net::IpAddr>() {
                match ip {
                    std::net::IpAddr::V4(v4) => {
                        req.push(0x01);
                        req.extend_from_slice(&v4.octets());
                    }
                    std::net::IpAddr::V6(v6) => {
                        req.push(0x04);
                        req.extend_from_slice(&v6.octets());
                    }
                }
            } else {
                // Resolve locally. Use std::net::ToSocketAddrs which
                // is the same path tlsfetch-sys uses.
                let resolved = (host, port)
                    .to_socket_addrs()
                    .map_err(|e| ProxyError::Inner(format!("resolve {host}: {e}")))?
                    .next()
                    .ok_or_else(|| ProxyError::Inner(format!("no addrs for {host}")))?;
                match resolved.ip() {
                    std::net::IpAddr::V4(v4) => {
                        req.push(0x01);
                        req.extend_from_slice(&v4.octets());
                    }
                    std::net::IpAddr::V6(v6) => {
                        req.push(0x04);
                        req.extend_from_slice(&v6.octets());
                    }
                }
            }
        } else {
            // atyp = domain
            if host.len() > 255 {
                return Err(ProxyError::BadConfig("host > 255 bytes".into()));
            }
            req.push(0x03);
            req.push(host.len() as u8);
            req.extend_from_slice(host.as_bytes());
        }
        req.extend_from_slice(&port.to_be_bytes());
        write_all(&mut sock, &req)?;

        // 4. Reply. Same shape as request.
        let mut head = [0u8; 4];
        read_exact(&mut sock, &mut head)?;
        if head[0] != 0x05 {
            return Err(ProxyError::BadResponse(format!(
                "socks5 reply: wrong version {}",
                head[0]
            )));
        }
        if head[1] != 0x00 {
            return Err(ProxyError::ConnectFailed {
                status: head[1] as u16,
                line: socks5_status_text(head[1]).to_string(),
            });
        }
        // Drain BND.ADDR + BND.PORT (we ignore them — same policy
        // as curl). Length depends on atyp.
        let bnd_addr_len = match head[3] {
            0x01 => 4,
            0x04 => 16,
            0x03 => {
                let mut l = [0u8; 1];
                read_exact(&mut sock, &mut l)?;
                l[0] as usize
            }
            other => {
                return Err(ProxyError::BadResponse(format!(
                    "socks5 reply: bad atyp {other:#x}"
                )))
            }
        };
        let mut drain = vec![0u8; bnd_addr_len + 2];
        read_exact(&mut sock, &mut drain)?;

        Ok(sock)
    }
}

// ============ helpers ============

fn write_all<S: Socket>(sock: &mut S, mut buf: &[u8]) -> Result<(), ProxyError> {
    while !buf.is_empty() {
        match sock.write(buf) {
            Ok(0) => return Err(ProxyError::Io("proxy: write returned 0".into())),
            Ok(n) => buf = &buf[n..],
            Err(e) => return Err(ProxyError::Io(e.to_string())),
        }
    }
    Ok(())
}

fn read_exact<S: Socket>(sock: &mut S, buf: &mut [u8]) -> Result<(), ProxyError> {
    let mut filled = 0;
    while filled < buf.len() {
        match sock.read(&mut buf[filled..]) {
            Ok(0) => return Err(ProxyError::Io("proxy: unexpected EOF".into())),
            Ok(n) => filled += n,
            Err(e) => return Err(ProxyError::Io(e.to_string())),
        }
    }
    Ok(())
}

fn read_until_double_crlf<S: Socket>(sock: &mut S) -> Result<Vec<u8>, ProxyError> {
    let mut out = Vec::with_capacity(256);
    let mut byte = [0u8; 1];
    loop {
        match sock.read(&mut byte) {
            Ok(0) => return Err(ProxyError::Io("proxy: EOF before headers".into())),
            Ok(_) => out.push(byte[0]),
            Err(e) => return Err(ProxyError::Io(e.to_string())),
        }
        if out.ends_with(b"\r\n\r\n") {
            return Ok(out);
        }
        if out.len() > 16384 {
            return Err(ProxyError::BadResponse("proxy: headers > 16K".into()));
        }
    }
}

use std::net::ToSocketAddrs;

fn socks5_status_text(code: u8) -> &'static str {
    match code {
        0x00 => "succeeded",
        0x01 => "general SOCKS server failure",
        0x02 => "connection not allowed by ruleset",
        0x03 => "network unreachable",
        0x04 => "host unreachable",
        0x05 => "connection refused",
        0x06 => "TTL expired",
        0x07 => "command not supported",
        0x08 => "address type not supported",
        _ => "unknown",
    }
}

/// Errors raised by the proxy connectors.
#[derive(Debug)]
pub enum ProxyError {
    Inner(String),
    Io(String),
    BadConfig(String),
    BadResponse(String),
    ConnectFailed { status: u16, line: String },
    AuthFailed,
}

impl fmt::Display for ProxyError {
    fn fmt(&self, f: &mut fmt::Formatter<'_>) -> fmt::Result {
        match self {
            ProxyError::Inner(s) => write!(f, "proxy inner connect: {s}"),
            ProxyError::Io(s) => write!(f, "proxy io: {s}"),
            ProxyError::BadConfig(s) => write!(f, "proxy config: {s}"),
            ProxyError::BadResponse(s) => write!(f, "proxy response: {s}"),
            ProxyError::ConnectFailed { status, line } => {
                write!(f, "proxy connect failed: {status} {line}")
            }
            ProxyError::AuthFailed => write!(f, "proxy auth failed"),
        }
    }
}

impl std::error::Error for ProxyError {}

impl From<ProxyError> for io::Error {
    fn from(e: ProxyError) -> io::Error {
        io::Error::new(io::ErrorKind::Other, e.to_string())
    }
}
