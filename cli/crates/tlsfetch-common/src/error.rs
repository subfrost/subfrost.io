use thiserror::Error;

#[derive(Error, Debug)]
pub enum TlsFetchError {
    #[error("io error: {0}")]
    Io(String),

    #[error("rustls error: {0}")]
    Tls(String),

    #[error("invalid URL: {0}")]
    InvalidUrl(String),

    #[error("invalid DNS name: {0}")]
    InvalidDnsName(String),

    #[error("invalid HTTP response: {0}")]
    InvalidHttpResponse(String),

    #[error("connection closed by peer mid-{0}")]
    ConnectionClosed(&'static str),

    #[error("handshake failed: {0}")]
    HandshakeFailed(String),

    /// Caller forced an HTTP version the server didn't accept via
    /// ALPN. Emitted by the H2 / H3 paths when the negotiated ALPN
    /// is something other than what was requested. Wrapped here as
    /// a typed variant so retry-on-fallback logic in higher layers
    /// (tlsfetch-emulation) can downgrade to H1 cleanly without
    /// string-matching error messages.
    #[error("ALPN mismatch: wanted {wanted}, server picked {got:?}")]
    AlpnMismatch { wanted: &'static str, got: Option<Vec<u8>> },

    /// HTTP/2 error surfaced from the `h2` crate, classified per
    /// pingora's matrix into "safe to retry on a fresh connection"
    /// vs "application-side may have observed the request — blind
    /// retry risks duplicate side effects". Callers can match on
    /// `retryable` to decide.
    ///
    /// Set when the peer sends:
    /// - GOAWAY with NO_ERROR (graceful shutdown — retryable)
    /// - PROTOCOL_ERROR from our local h2 library (peer sent
    ///   invalid frames — retryable, often signals an h1-only server)
    /// - RST_STREAM with REFUSED_STREAM (RFC 9113 §8.7 says the
    ///   request was definitely not processed — retryable)
    /// - HTTP_1_1_REQUIRED (peer demands HTTP/1.1 — retryable on a
    ///   fresh h1 connection)
    /// - any other h2 error (retryable = false; caller must judge
    ///   request idempotence)
    #[error("HTTP/2: {detail} (retryable={retryable})")]
    Http2 { detail: String, retryable: bool },

    #[error("other: {0}")]
    Other(String),
}

impl From<std::io::Error> for TlsFetchError {
    fn from(e: std::io::Error) -> Self {
        TlsFetchError::Io(e.to_string())
    }
}

impl From<rustls::Error> for TlsFetchError {
    fn from(e: rustls::Error) -> Self {
        TlsFetchError::Tls(e.to_string())
    }
}
