//! HTTP protocol selection. The `HttpClient` picks one of these per
//! request based on URL scheme + ALPN negotiation + caller config.

use serde::{Deserialize, Serialize};

#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum Protocol {
    /// HTTP/1.1 over TLS. Implemented today.
    Http1,
    /// HTTP/2 over TLS. Phase 2 — wire the `h2` crate behind a tokio
    /// adapter so it works on both native and wasm runtimes.
    Http2,
    /// HTTP/3 over QUIC. Phase 3 — wire `quiche` behind the
    /// `DatagramSocket` trait.
    Http3,
}

impl Protocol {
    pub fn as_alpn(self) -> &'static [u8] {
        match self {
            Protocol::Http1 => b"http/1.1",
            Protocol::Http2 => b"h2",
            Protocol::Http3 => b"h3",
        }
    }
}
