//! `WsTcpFactory` — a [`tlsfetch_common::SocketFactory`] that dials
//! TCP via the `ws-tunnel/` WebSocket relay.
//!
//! For each [`SocketFactory::connect`] call we open one WebSocket to
//! the relay at `<relay_url>/tcp/<host>/<port>`. Frames are
//! interpreted as raw TCP byte stream chunks per `ws-tunnel/PROTOCOL.md`.
//!
//! See `ws-tunnel/server.mjs` for the reference relay implementation.

#![cfg(feature = "ws-tunnel")]

use std::collections::VecDeque;
use std::io;
use std::time::Duration;

use tlsfetch_common::socket::{Socket, SocketFactory};
use tungstenite::client::IntoClientRequest;
use tungstenite::stream::MaybeTlsStream;
use tungstenite::{Message, WebSocket};
use url::Url;

/// A TCP-byte-stream socket whose underlying transport is a single
/// WebSocket connection to the WS-tunnel relay.
pub struct WsSocket {
    ws: WebSocket<MaybeTlsStream<std::net::TcpStream>>,
    /// Bytes received from the relay but not yet drained by the
    /// reader. WS frames may be larger than the caller's read buf.
    rx_buf: VecDeque<u8>,
    /// Set when the relay has closed the WS or signalled upstream EOF.
    closed: bool,
}

impl WsSocket {
    fn read_more(&mut self) -> io::Result<()> {
        // Block waiting for the next WS message. tungstenite's read
        // is sync; for our test bed that's fine.
        loop {
            match self.ws.read() {
                Ok(Message::Binary(bytes)) => {
                    self.rx_buf.extend(bytes.iter().copied());
                    return Ok(());
                }
                Ok(Message::Text(s)) => {
                    // Per PROTOCOL.md text frames carry control /
                    // error info. Surface as an io::Error.
                    return Err(io::Error::new(
                        io::ErrorKind::Other,
                        format!("ws relay error: {s}"),
                    ));
                }
                Ok(Message::Close(_)) => {
                    self.closed = true;
                    return Ok(());
                }
                Ok(Message::Ping(payload)) => {
                    // tungstenite auto-handles Pong on the next
                    // write, but we need to keep reading until we
                    // get actual data.
                    let _ = self.ws.send(Message::Pong(payload));
                    continue;
                }
                Ok(Message::Pong(_)) | Ok(Message::Frame(_)) => continue,
                Err(tungstenite::Error::ConnectionClosed)
                | Err(tungstenite::Error::AlreadyClosed) => {
                    self.closed = true;
                    return Ok(());
                }
                Err(e) => {
                    return Err(io::Error::new(io::ErrorKind::Other, e.to_string()));
                }
            }
        }
    }
}

impl Socket for WsSocket {
    fn read(&mut self, buf: &mut [u8]) -> io::Result<usize> {
        if self.rx_buf.is_empty() {
            if self.closed {
                return Ok(0);
            }
            self.read_more()?;
        }
        let n = self.rx_buf.len().min(buf.len());
        for slot in buf.iter_mut().take(n) {
            *slot = self.rx_buf.pop_front().unwrap();
        }
        Ok(n)
    }

    fn write(&mut self, buf: &[u8]) -> io::Result<usize> {
        // Each write is one WS binary frame. We send the whole
        // buffer as one frame so the receiver can rely on
        // ordered byte delivery; tungstenite handles fragmentation
        // internally if needed.
        self.ws
            .send(Message::Binary(buf.to_vec().into()))
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
        // tungstenite buffers writes; flush so the bytes hit the
        // wire before the caller's next read.
        self.ws
            .flush()
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))?;
        Ok(buf.len())
    }

    fn flush(&mut self) -> io::Result<()> {
        self.ws
            .flush()
            .map_err(|e| io::Error::new(io::ErrorKind::Other, e.to_string()))
    }

    fn close(&mut self) -> io::Result<()> {
        let _ = self.ws.close(None);
        Ok(())
    }
}

/// SocketFactory that opens TCP sockets via the WS-tunnel relay.
#[derive(Debug, Clone)]
pub struct WsTcpFactory {
    relay_url: Url,
}

impl WsTcpFactory {
    /// Create a factory pointed at the relay's base URL, e.g.
    /// `ws://127.0.0.1:19999/`.
    pub fn new(relay_url: impl AsRef<str>) -> Result<Self, String> {
        let mut url = Url::parse(relay_url.as_ref()).map_err(|e| e.to_string())?;
        // Make sure the path ends with a single slash so we can
        // append `tcp/host/port` cleanly.
        if !url.path().ends_with('/') {
            url.set_path(&format!("{}/", url.path()));
        }
        Ok(Self { relay_url: url })
    }
}

impl SocketFactory for WsTcpFactory {
    type Socket = WsSocket;
    type Error = io::Error;

    fn connect(
        &self,
        host: &str,
        port: u16,
        _timeout: Option<Duration>,
    ) -> Result<Self::Socket, Self::Error> {
        let target_path = format!(
            "{}tcp/{}/{}",
            self.relay_url.path(),
            urlencoding(host),
            port
        );
        let mut target = self.relay_url.clone();
        target.set_path(&target_path);
        let req = target
            .as_str()
            .into_client_request()
            .map_err(|e| io::Error::new(io::ErrorKind::InvalidInput, e.to_string()))?;
        let (ws, _resp) = tungstenite::connect(req)
            .map_err(|e| io::Error::new(io::ErrorKind::Other, format!("ws connect: {e}")))?;
        Ok(WsSocket {
            ws,
            rx_buf: VecDeque::with_capacity(8192),
            closed: false,
        })
    }
}

/// Minimal percent-encoder for the host portion of the path. Only
/// escapes characters that would break the path parser; we don't
/// need full RFC 3986 here because hostnames + IP literals don't
/// contain anything exotic.
fn urlencoding(s: &str) -> String {
    let mut out = String::with_capacity(s.len());
    for b in s.bytes() {
        match b {
            b'a'..=b'z' | b'A'..=b'Z' | b'0'..=b'9' | b'.' | b'-' | b'_' | b'~' => {
                out.push(b as char);
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}
