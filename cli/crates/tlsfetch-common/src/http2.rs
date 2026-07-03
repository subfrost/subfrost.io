//! HTTP/2 over TLS via the `h2` crate.
//!
//! This module is gated behind the `http2` cargo feature so that the
//! base build (used by wasm32) doesn't pull in tokio. The native side
//! enables it via tlsfetch-sys, which provides the tokio runtime.
//!
//! Architecture: tokio's `TcpStream` is wrapped in a tokio-rustls
//! `TlsConnector` to do the TLS handshake (with ALPN advertising
//! `h2`), then the resulting AsyncRead+AsyncWrite stream is fed to
//! `h2::client::handshake` which gives us a `SendRequest` for issuing
//! HTTP/2 requests.
//!
//! The public entry point is `send_request_native` — a single-shot
//! HTTP/2 request that opens a fresh connection, completes one
//! request/response, and tears it down. Connection pooling and
//! multiplexing are a follow-up.

#[cfg(feature = "http2")]
mod inner {
    use std::sync::Arc;
    use std::time::Duration;

    use bytes::Bytes;
    use http::{HeaderMap, Method, Request, Uri};
    use rustls::pki_types::ServerName;
    use tokio::net::TcpStream;
    use tokio_rustls::TlsConnector;

    use crate::error::TlsFetchError;
    use crate::fingerprint::Fingerprint;
    use crate::http1::HttpResponse;
    use crate::socket::{IntoStdTcpStream, SocketFactory};
    use crate::tls::{build_client_config, TlsConfig};

    /// Classify an `h2::Error` per pingora's matrix and produce a
    /// typed [`TlsFetchError::Http2`]. `phase` is a short tag that
    /// goes into the detail string so logs can tell header-read
    /// failures apart from body-chunk failures and send-side
    /// failures.
    ///
    /// Retryability rules (cribbed from
    /// `~/pingora/pingora-core/src/protocols/http/v2/client.rs:490`):
    /// - GOAWAY/NO_ERROR from peer → server is shutting down; retry
    ///   on a fresh connection.
    /// - PROTOCOL_ERROR from our local library → peer sent invalid
    ///   H2; usually means h1-only, retry/downgrade.
    /// - RST_STREAM/REFUSED_STREAM from peer → RFC 9113 §8.7 says
    ///   the request was definitely not processed; retry.
    /// - HTTP_1_1_REQUIRED → peer demands h1; retryable on h1.
    /// - I/O error → reused-conn drop is common; retryable in
    ///   pooled scenarios. (Our one-shot path isn't reused, but the
    ///   flag is honest for downstream consumers that do pool.)
    /// - Anything else → not retryable.
    pub fn classify_h2_error(phase: &'static str, e: &h2::Error) -> TlsFetchError {
        let reason = e.reason();
        let retryable = if e.is_go_away() && e.is_remote() && reason == Some(h2::Reason::NO_ERROR) {
            true
        } else if e.is_go_away() && e.is_library() && reason == Some(h2::Reason::PROTOCOL_ERROR) {
            true
        } else if e.is_reset() && e.is_remote() && reason == Some(h2::Reason::REFUSED_STREAM) {
            true
        } else if e.is_remote() && reason == Some(h2::Reason::HTTP_1_1_REQUIRED) {
            true
        } else {
            e.is_io()
        };
        TlsFetchError::Http2 {
            detail: format!("{phase}: {e}"),
            retryable,
        }
    }

    /// Result of an HTTP/2 round-trip.
    pub use crate::http1::HttpResponse as Http2Response;

    /// One-shot HTTP/2 GET/POST/etc. Opens a fresh TLS+h2 connection,
    /// sends `request`, returns the response, closes.
    ///
    /// The transport socket comes from `factory`. The factory may be
    /// a direct TCP dialer (`TcpSocketFactory`), an HTTP-CONNECT
    /// proxy wrapper, a SOCKS5 wrapper, or any other [`SocketFactory`]
    /// whose `Socket` impl can yield a `std::net::TcpStream` via
    /// [`IntoStdTcpStream`]. We do the proxy/transport handshake
    /// synchronously (it's short — < 1s typically), then flip the
    /// resulting std socket non-blocking and hand it to tokio for
    /// the TLS + h2 layers.
    ///
    /// Uses tokio internally so the caller has to be inside a tokio
    /// runtime (or use the `block_on` helper below).
    pub async fn send_request<F>(
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
        F: SocketFactory,
        F::Socket: IntoStdTcpStream,
    {
        // 1. Open the underlying TCP connection through the factory.
        //    For a direct factory that's just `TcpStream::connect`; for
        //    a proxy wrapper it's connect-to-proxy + CONNECT handshake.
        //    The call is blocking; the cost is comparable to the original
        //    direct `TcpStream::connect`, so we accept the executor stall.
        let std_tcp = factory
            .connect(host, port, connect_timeout)
            .map_err(|e| TlsFetchError::Io(format!("connect: {}", e)))?
            .into_std_tcp_stream()
            .map_err(|e| TlsFetchError::Io(format!("yield std::TcpStream: {}", e)))?;
        std_tcp
            .set_nonblocking(true)
            .map_err(|e| TlsFetchError::Io(format!("set_nonblocking: {}", e)))?;
        let tcp = TcpStream::from_std(std_tcp)
            .map_err(|e| TlsFetchError::Io(format!("from_std: {}", e)))?;
        tcp.set_nodelay(true)
            .map_err(|e| TlsFetchError::Io(e.to_string()))?;

        // 2. TLS handshake with ALPN h2.
        //
        // Build the ClientConfig through the shared helper so the
        // persona's cipher list + ClientHello mutator fire on this
        // path too. With no fingerprint we land on the same defaults
        // the older bare-h2 path used.
        let tls_cfg = TlsConfig {
            sni: Some(host.to_string()),
            insecure_skip_verify: insecure,
            alpn: vec![b"h2".to_vec(), b"http/1.1".to_vec()],
            fingerprint,
        };
        let config = build_client_config(&tls_cfg, host)?;
        let connector = TlsConnector::from(Arc::new(config));
        let server_name: ServerName<'static> = ServerName::try_from(host.to_string())
            .map_err(|e| TlsFetchError::InvalidDnsName(e.to_string()))?;
        let tls = connector
            .connect(server_name, tcp)
            .await
            .map_err(|e| TlsFetchError::HandshakeFailed(e.to_string()))?;

        // Confirm we negotiated h2.
        let alpn = tls.get_ref().1.alpn_protocol().map(|s| s.to_vec());
        if alpn.as_deref() != Some(b"h2") {
            return Err(TlsFetchError::AlpnMismatch {
                wanted: "h2",
                got: alpn,
            });
        }

        // 3. h2 client handshake.
        let (h2, h2_conn) = h2::client::handshake(tls)
            .await
            .map_err(|e| TlsFetchError::Other(format!("h2 handshake: {}", e)))?;

        // Spawn the connection driver. It owns the read/write loop.
        let conn_task = tokio::spawn(async move {
            let _ = h2_conn.await;
        });

        // 4. Build + send the request.
        let uri: Uri = format!("https://{}{}", host, path)
            .parse()
            .map_err(|e: http::uri::InvalidUri| TlsFetchError::InvalidUrl(e.to_string()))?;
        let mut builder = Request::builder().method(method.clone()).uri(uri);
        for (k, v) in headers.iter() {
            builder = builder.header(k, v);
        }
        let req = builder
            .body(())
            .map_err(|e| TlsFetchError::Other(format!("build req: {}", e)))?;

        // h2 0.4: SendRequest::ready takes self by value and returns
        // a Self once the connection is ready to send.
        let mut h2 = h2
            .ready()
            .await
            .map_err(|e| TlsFetchError::Other(format!("h2 ready: {}", e)))?;
        let (response_fut, mut send_stream) = h2
            .send_request(req, body.is_empty())
            .map_err(|e| classify_h2_error("send_request", &e))?;

        if !body.is_empty() {
            send_stream
                .send_data(Bytes::from(body), true)
                .map_err(|e| classify_h2_error("send_data", &e))?;
        }

        // 5. Receive response head + body. response_fut surfaces the
        //    most common GOAWAY-mid-handshake error here; classify so
        //    downstream retry logic can see the typed signal.
        let resp = response_fut
            .await
            .map_err(|e| classify_h2_error("response", &e))?;

        let status = resp.status().as_u16();
        let mut headers_out = std::collections::HashMap::new();
        for (k, v) in resp.headers().iter() {
            let name = k.as_str().to_ascii_lowercase();
            let value = String::from_utf8_lossy(v.as_bytes()).to_string();
            // Match the H1 codec: join repeated headers (notably
            // Set-Cookie — Yahoo, Cloudflare, etc. routinely emit
            // multiple Set-Cookie rows on a single response and we
            // need callers to see all of them) with `\n` so callers
            // can split.
            headers_out
                .entry(name)
                .and_modify(|existing: &mut String| {
                    existing.push('\n');
                    existing.push_str(&value);
                })
                .or_insert(value);
        }

        let mut body_stream = resp.into_body();
        let mut body_bytes = Vec::with_capacity(8192);
        while let Some(chunk) = body_stream.data().await {
            let chunk = chunk.map_err(|e| classify_h2_error("body_chunk", &e))?;
            // Tell the flow control we consumed this chunk so the
            // peer can keep sending. release_capacity bumps both the
            // stream-level and connection-level windows; without this,
            // bodies larger than the default 64 KiB initial window
            // stall mid-flight.
            let _ = body_stream
                .flow_control()
                .release_capacity(chunk.len());
            body_bytes.extend_from_slice(&chunk);
        }
        // Trailers are also possible but we don't surface them yet.
        let _trailers = body_stream.trailers().await.ok();

        // IMPORTANT: drop ALL stream-ref handles (RecvStream included)
        // BEFORE awaiting `conn_task`. The h2 connection driver only
        // exits once the last stream-ref drops — `Connection::poll`
        // calls `maybe_close_connection_if_no_streams` which transitions
        // to GOAWAY only when `has_streams_or_other_references()`
        // returns false, and that check counts every live OpaqueStream-
        // Ref (i.e. every alive `RecvStream`/`SendStream` plus every
        // `Streams` clone). Holding `body_stream` across the await
        // therefore deadlocks: the connection waits for us to drop our
        // ref, we wait for the connection to exit. Long-lived peers
        // that hold the TCP socket open expecting reuse — Cloudflare's
        // `cf-mitigated: challenge` 403 page is the canonical case —
        // never close on their own, so the deadlock is permanent.
        // Servers that proactively GOAWAY would have masked this bug
        // (the EOF on the wire forces conn_task to exit anyway), which
        // is why it slipped through earlier integration runs.
        drop(body_stream);
        drop(send_stream);
        drop(h2);
        // Connection task will finish naturally now that no streams
        // remain. Bound it with a 1-second budget anyway so a peer
        // that refuses to honor our GOAWAY (or a half-broken TLS
        // shutdown) can't wedge the caller — at this point the
        // response is already fully buffered, so the only thing left
        // is the courtesy GOAWAY round-trip. Uses tlsfetch_timeout's
        // lazy-init shared-timer primitive (Phase 1 of the tlsd
        // plan) — measurably cheaper than tokio's default timer
        // when timeouts are created and dropped at high rates.
        let _ = tlsfetch_timeout::timeout(Duration::from_secs(1), conn_task).await;

        Ok(HttpResponse {
            status,
            status_text: String::new(),
            headers: headers_out,
            body: body_bytes,
        })
    }

    /// Synchronous wrapper. Spins up a single-threaded tokio current-thread
    /// runtime, runs the request, returns the result. Used by the
    /// blocking CLI path so callers don't have to be async.
    pub fn send_request_blocking<F>(
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
        F: SocketFactory,
        F::Socket: IntoStdTcpStream,
    {
        let rt = tokio::runtime::Builder::new_current_thread()
            .enable_all()
            .build()
            .map_err(|e| TlsFetchError::Io(e.to_string()))?;
        rt.block_on(send_request(
            factory,
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

    // NoVerify is provided by `crate::tls` and installed by
    // `build_client_config` when `insecure_skip_verify` is set, so
    // no duplicate impl is needed here.

    #[cfg(test)]
    mod tests {
        use super::*;

        /// classify_h2_error must produce the typed `Http2` variant
        /// (never the stringly-typed `Other`) regardless of the
        /// input error's specific flag combo. h2::Error's internal
        /// `is_library` / `is_remote` / `is_go_away` state is not
        /// influenced by `h2::Error::from(Reason)`, so we can't
        /// directly synthesize a retryable error in a unit test —
        /// but we can verify the wrapper shape and the phase tag.
        #[test]
        fn classify_produces_typed_http2_variant_with_phase_tag() {
            let e = h2::Error::from(h2::Reason::PROTOCOL_ERROR);
            let classified = classify_h2_error("test_phase", &e);
            match classified {
                TlsFetchError::Http2 { retryable: _, detail } => {
                    assert!(
                        detail.starts_with("test_phase:"),
                        "phase tag must be preserved in detail: {detail}"
                    );
                }
                other => panic!("expected TlsFetchError::Http2, got {other:?}"),
            }
        }

        /// A second Reason — REFUSED_STREAM — should also yield the
        /// typed variant. Catches any future regression where someone
        /// changes the classifier to short-circuit to a different
        /// error type for some Reason values.
        #[test]
        fn classify_refused_stream_also_yields_typed_variant() {
            let e = h2::Error::from(h2::Reason::REFUSED_STREAM);
            let classified = classify_h2_error("recv", &e);
            assert!(
                matches!(classified, TlsFetchError::Http2 { .. }),
                "any h2::Error should classify into the Http2 variant"
            );
        }
    }
}

#[cfg(feature = "http2")]
pub use inner::{send_request, send_request_blocking, Http2Response};

use crate::error::TlsFetchError;

/// Stub for builds without the `http2` feature.
#[cfg(not(feature = "http2"))]
pub fn not_implemented() -> TlsFetchError {
    TlsFetchError::Other(
        "tlsfetch was built without the `http2` feature. Rebuild \
         with `--features http2` to enable HTTP/2 support."
            .to_string(),
    )
}

#[cfg(feature = "http2")]
pub fn not_implemented() -> TlsFetchError {
    // Shouldn't be called when feature is on, but kept for API parity.
    TlsFetchError::Other("http2 feature is enabled but the dispatch path was misconfigured".to_string())
}
