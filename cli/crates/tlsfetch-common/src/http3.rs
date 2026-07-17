//! HTTP/3 over QUIC via `quinn` + the `h3` codec.
//!
//! Mirrors the [`crate::http2`] module: behind the `http3` cargo
//! feature we expose an async `send_request` plus a sync
//! `send_request_blocking` that spins a `current_thread` tokio
//! runtime, so the caller-facing `HttpClient::send` API stays sync.
//!
//! Architecture:
//!
//! - quinn 0.11 owns a tokio UDP socket and runs the QUIC state
//!   machine. We feed it a `rustls::ClientConfig` with ALPN
//!   advertising "h3" and (optionally) the same custom CryptoProvider
//!   that the JA3 fingerprint module produces, so HTTP/3 inherits the
//!   same TLS-impersonation surface as HTTP/1.1 and HTTP/2.
//! - h3 + h3-quinn run RFC 9114 on top of the QUIC connection: send
//!   the headers, drain the body stream, return the parsed response.
//!
//! The wasm side is a follow-up: it'll need a `quinn::AsyncUdpSocket`
//! adapter that pumps packets through the JS-supplied
//! `DatagramSocketFactory` (Node `dgram.Socket`, or — for the browser
//! — an IP-over-WebSocket tunnel like subzero-rs's frtun).

#[cfg(feature = "http3")]
mod inner {
    use std::net::{SocketAddr, ToSocketAddrs};
    use std::sync::Arc;
    use std::time::Duration;

    use bytes::{Buf, Bytes};
    use http::{HeaderMap, Method, Request, Uri};
    use rustls::{ClientConfig, RootCertStore};

    use crate::datagram::{DatagramSocket, DatagramSocketFactory};
    use crate::dgram_quinn::DatagramAsyncUdpSocket;
    use crate::error::TlsFetchError;
    use crate::fingerprint::Fingerprint;
    use crate::http1::HttpResponse;
    use crate::tls::install_fingerprint;

    /// Re-export so callers don't have to know about the http1 type.
    pub use crate::http1::HttpResponse as Http3Response;

    /// One-shot HTTP/3 request. Opens a fresh QUIC connection,
    /// sends `request`, returns the response, closes.
    pub async fn send_request(
        host: &str,
        port: u16,
        method: Method,
        path: &str,
        headers: HeaderMap,
        body: Vec<u8>,
        insecure: bool,
        connect_timeout: Option<Duration>,
        fingerprint: Option<Fingerprint>,
    ) -> Result<HttpResponse, TlsFetchError> {
        // 1. Resolve the peer to a SocketAddr. quinn needs the
        //    concrete address; the SNI/cert verification still uses
        //    `host`.
        let addr: SocketAddr = (host, port)
            .to_socket_addrs()
            .map_err(|e| TlsFetchError::Io(format!("resolve {}: {}", host, e)))?
            .next()
            .ok_or_else(|| TlsFetchError::Io(format!("no addrs for {}", host)))?;

        // 2. Build a rustls ClientConfig with ALPN h3.
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        // quinn requires a provider that supports TLS 1.3 — the
        // ring provider is the documented default. We use it
        // directly here (rather than rustls-rustcrypto) because
        // quinn 0.11's QUIC integration is built against ring's
        // HKDF/AEAD APIs.
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let mut tls_config = ClientConfig::builder_with_provider(provider)
            .with_protocol_versions(&[&rustls::version::TLS13])
            .map_err(|e| TlsFetchError::HandshakeFailed(e.to_string()))?
            .with_root_certificates(roots)
            .with_no_client_auth();
        tls_config.alpn_protocols = vec![b"h3".to_vec()];
        if insecure {
            tls_config
                .dangerous()
                .set_certificate_verifier(Arc::new(NoVerify));
        }
        // Install the persona's ClientHello mutator on top of the
        // ring-backed config. Cipher provider stays ring (quinn
        // requirement); the mutator overrides the wire ClientHello
        // bytes regardless of which provider sourced them.
        install_fingerprint(&mut tls_config, fingerprint.as_ref(), host);

        // 3. Wrap the rustls config in a quinn ClientConfig.
        let quic_client_config = quinn::crypto::rustls::QuicClientConfig::try_from(tls_config)
            .map_err(|e| TlsFetchError::Other(format!("quic client config: {}", e)))?;
        let client_config = quinn::ClientConfig::new(Arc::new(quic_client_config));

        // 4. Bind a local UDP socket. 0.0.0.0:0 = let the OS pick.
        let bind_addr: SocketAddr = if addr.is_ipv4() {
            "0.0.0.0:0".parse().unwrap()
        } else {
            "[::]:0".parse().unwrap()
        };
        let mut endpoint = quinn::Endpoint::client(bind_addr)
            .map_err(|e| TlsFetchError::Io(format!("bind udp: {}", e)))?;
        endpoint.set_default_client_config(client_config);

        run_request(endpoint, addr, host, method, path, headers, body, connect_timeout).await
    }

    /// Same as [`send_request`] but routes the QUIC traffic through a
    /// caller-supplied [`DatagramSocketFactory`] instead of quinn's
    /// built-in tokio UDP. Lets a consumer plug a custom UDP-style
    /// transport (UDP-over-tunnel, SOCKS5 UDP associate, mock socket
    /// for tests, …) into the HTTP/3 path.
    pub async fn send_request_with_factory<F>(
        factory: &F,
        host: &str,
        port: u16,
        method: Method,
        path: &str,
        headers: HeaderMap,
        body: Vec<u8>,
        insecure: bool,
        connect_timeout: Option<Duration>,
        fingerprint: Option<Fingerprint>,
    ) -> Result<HttpResponse, TlsFetchError>
    where
        F: DatagramSocketFactory,
        F::Socket: crate::datagram::DatagramSocket + 'static,
    {
        // We deliberately do NOT resolve the host here — we let the
        // factory dial via its own resolution path so the
        // SocketAddr we hand to quinn matches the one the bridge
        // actually reports via peer_addr() in RecvMeta. Resolving
        // twice (here AND in the factory) risks picking different
        // entries from a dual-stack DNS result, which makes quinn
        // reject every inbound packet because the source address
        // doesn't match its connection state.

        // Build the same TLS+ALPN config as the default path.
        let mut roots = RootCertStore::empty();
        roots.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());
        let provider = Arc::new(rustls::crypto::ring::default_provider());
        let mut tls_config = ClientConfig::builder_with_provider(provider)
            .with_protocol_versions(&[&rustls::version::TLS13])
            .map_err(|e| TlsFetchError::HandshakeFailed(e.to_string()))?
            .with_root_certificates(roots)
            .with_no_client_auth();
        tls_config.alpn_protocols = vec![b"h3".to_vec()];
        if insecure {
            tls_config
                .dangerous()
                .set_certificate_verifier(Arc::new(NoVerify));
        }
        // Same mutator install as the default-factory path above.
        install_fingerprint(&mut tls_config, fingerprint.as_ref(), host);
        let quic_client_config = quinn::crypto::rustls::QuicClientConfig::try_from(tls_config)
            .map_err(|e| TlsFetchError::Other(format!("quic client config: {}", e)))?;
        let client_config = quinn::ClientConfig::new(Arc::new(quic_client_config));

        // Open a DatagramSocket via the factory and wrap it. The
        // peer addr we read here is the one quinn will see in every
        // RecvMeta, so we hand the SAME addr to endpoint.connect()
        // below for source-address matching.
        let dgram = factory
            .connect(host, port, connect_timeout)
            .map_err(|e| TlsFetchError::Io(format!("dgram connect: {}", e)))?;
        let addr = dgram
            .peer_addr()
            .map_err(|e| TlsFetchError::Io(format!("peer_addr: {}", e)))?;
        let async_socket = DatagramAsyncUdpSocket::new(dgram)
            .map_err(|e| TlsFetchError::Io(format!("dgram adapter: {}", e)))?;

        let runtime = Arc::new(quinn::TokioRuntime);
        let endpoint_config = quinn::EndpointConfig::default();
        let mut endpoint = quinn::Endpoint::new_with_abstract_socket(
            endpoint_config,
            None,
            Arc::new(async_socket),
            runtime,
        )
        .map_err(|e| TlsFetchError::Io(format!("endpoint: {}", e)))?;
        endpoint.set_default_client_config(client_config);

        run_request(endpoint, addr, host, method, path, headers, body, connect_timeout).await
    }

    /// Shared tail between [`send_request`] and
    /// [`send_request_with_factory`]: drives the QUIC + h3 handshake,
    /// sends the request, drains the response, tears down.
    async fn run_request(
        endpoint: quinn::Endpoint,
        addr: SocketAddr,
        host: &str,
        method: Method,
        path: &str,
        headers: HeaderMap,
        body: Vec<u8>,
        connect_timeout: Option<Duration>,
    ) -> Result<HttpResponse, TlsFetchError> {
        // 5. Connect.
        let connecting = endpoint
            .connect(addr, host)
            .map_err(|e| TlsFetchError::Other(format!("quinn connect: {}", e)))?;
        // tlsfetch_timeout: lazy-init shared-timer primitive in
        // place of tokio::time::timeout. See crates/tlsfetch-timeout
        // for the divergence list and benchmark numbers.
        let conn = match connect_timeout {
            Some(t) => tlsfetch_timeout::timeout(t, connecting)
                .await
                .map_err(|_| TlsFetchError::Io(format!("h3 connect timeout {:?}", t)))?
                .map_err(|e| TlsFetchError::HandshakeFailed(format!("quic: {}", e)))?,
            None => connecting
                .await
                .map_err(|e| TlsFetchError::HandshakeFailed(format!("quic: {}", e)))?,
        };

        // 6. h3 client handshake on top of the QUIC connection.
        let h3_conn = h3_quinn::Connection::new(conn);
        let (mut driver, mut send_request) = h3::client::new(h3_conn)
            .await
            .map_err(|e| TlsFetchError::Other(format!("h3 handshake: {}", e)))?;

        // The driver future owns the connection event loop. Spawn
        // it; it returns once the connection drains.
        let driver_task = tokio::spawn(async move {
            let _ = futures_util::future::poll_fn(|cx| driver.poll_close(cx)).await;
        });

        // 7. Build the http::Request.
        let uri: Uri = format!("https://{}{}", host, path)
            .parse()
            .map_err(|e: http::uri::InvalidUri| TlsFetchError::InvalidUrl(e.to_string()))?;
        let mut builder = Request::builder().method(method).uri(uri);
        for (k, v) in headers.iter() {
            builder = builder.header(k, v);
        }
        let req = builder
            .body(())
            .map_err(|e| TlsFetchError::Other(format!("build req: {}", e)))?;

        // 8. Send headers, then body, then finish the send side.
        let mut stream = send_request
            .send_request(req)
            .await
            .map_err(|e| TlsFetchError::Other(format!("h3 send_request: {}", e)))?;

        if !body.is_empty() {
            stream
                .send_data(Bytes::from(body))
                .await
                .map_err(|e| TlsFetchError::Other(format!("h3 send_data: {}", e)))?;
        }
        stream
            .finish()
            .await
            .map_err(|e| TlsFetchError::Other(format!("h3 finish: {}", e)))?;

        // 9. Receive response head.
        let resp = stream
            .recv_response()
            .await
            .map_err(|e| TlsFetchError::Other(format!("h3 recv_response: {}", e)))?;

        let status = resp.status().as_u16();
        let mut headers_out = std::collections::HashMap::new();
        for (k, v) in resp.headers().iter() {
            headers_out.insert(
                k.as_str().to_ascii_lowercase(),
                String::from_utf8_lossy(v.as_bytes()).to_string(),
            );
        }

        // 10. Drain the body. h3's RecvStream yields chunks until
        //     None. Each chunk is a `bytes::Buf`.
        let mut body_bytes = Vec::with_capacity(8192);
        while let Some(mut chunk) = stream
            .recv_data()
            .await
            .map_err(|e| TlsFetchError::Other(format!("h3 recv_data: {}", e)))?
        {
            while chunk.has_remaining() {
                let slice = chunk.chunk();
                let n = slice.len();
                body_bytes.extend_from_slice(slice);
                chunk.advance(n);
            }
        }

        // Trailers / extra metadata are dropped for now — same
        // policy as the http2 module.
        let _ = stream.recv_trailers().await.ok();

        // 11. Tear down. Drop the send side, wait for driver to
        //     drain, close the endpoint.
        drop(send_request);
        let _ = driver_task.await;
        endpoint.close(0u32.into(), b"done");
        endpoint.wait_idle().await;

        Ok(HttpResponse {
            status,
            status_text: String::new(),
            headers: headers_out,
            body: body_bytes,
        })
    }

    /// Synchronous wrapper. Spins a single-threaded tokio runtime so
    /// the blocking [`crate::HttpClient`] API can dispatch h3
    /// requests without the caller being async.
    pub fn send_request_blocking(
        host: &str,
        port: u16,
        method: Method,
        path: &str,
        headers: HeaderMap,
        body: Vec<u8>,
        insecure: bool,
        connect_timeout: Option<Duration>,
        fingerprint: Option<Fingerprint>,
    ) -> Result<HttpResponse, TlsFetchError> {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| TlsFetchError::Io(e.to_string()))?;
        rt.block_on(send_request(
            host,
            port,
            method,
            path,
            headers,
            body,
            insecure,
            connect_timeout,
            fingerprint,
        ))
    }

    #[derive(Debug)]
    struct NoVerify;
    impl rustls::client::danger::ServerCertVerifier for NoVerify {
        fn verify_server_cert(
            &self,
            _: &rustls::pki_types::CertificateDer<'_>,
            _: &[rustls::pki_types::CertificateDer<'_>],
            _: &rustls::pki_types::ServerName<'_>,
            _: &[u8],
            _: rustls::pki_types::UnixTime,
        ) -> Result<rustls::client::danger::ServerCertVerified, rustls::Error> {
            Ok(rustls::client::danger::ServerCertVerified::assertion())
        }
        fn verify_tls12_signature(
            &self,
            _: &[u8],
            _: &rustls::pki_types::CertificateDer<'_>,
            _: &rustls::DigitallySignedStruct,
        ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
            Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
        }
        fn verify_tls13_signature(
            &self,
            _: &[u8],
            _: &rustls::pki_types::CertificateDer<'_>,
            _: &rustls::DigitallySignedStruct,
        ) -> Result<rustls::client::danger::HandshakeSignatureValid, rustls::Error> {
            Ok(rustls::client::danger::HandshakeSignatureValid::assertion())
        }
        fn supported_verify_schemes(&self) -> Vec<rustls::SignatureScheme> {
            use rustls::SignatureScheme::*;
            vec![
                RSA_PKCS1_SHA256,
                RSA_PKCS1_SHA384,
                RSA_PKCS1_SHA512,
                RSA_PSS_SHA256,
                RSA_PSS_SHA384,
                RSA_PSS_SHA512,
                ECDSA_NISTP256_SHA256,
                ECDSA_NISTP384_SHA384,
                ECDSA_NISTP521_SHA512,
                ED25519,
            ]
        }
    }
}

#[cfg(feature = "http3")]
pub use inner::{send_request, send_request_blocking, send_request_with_factory, Http3Response};

use crate::error::TlsFetchError;

/// Stub for builds without the `http3` feature.
#[cfg(not(feature = "http3"))]
pub fn not_implemented() -> TlsFetchError {
    TlsFetchError::Other(
        "tlsfetch was built without the `http3` feature. Rebuild \
         with `--features http3` to enable HTTP/3 support."
            .to_string(),
    )
}

#[cfg(feature = "http3")]
pub fn not_implemented() -> TlsFetchError {
    // Shouldn't be called when feature is on, but kept for API parity.
    TlsFetchError::Other(
        "http3 feature is enabled but the dispatch path was misconfigured".to_string(),
    )
}
