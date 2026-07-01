//! Regression tests for the h2 read-loop hang on non-200 responses
//! with sizeable chunked bodies (the Cloudflare `cf-mitigated:
//! challenge` 403 page case).
//!
//! Each test boots a TCP listener on `127.0.0.1:0`, terminates TLS
//! using a self-signed cert (with ALPN advertising `h2`), runs an
//! `h2::server::handshake`, accepts the first request, and replies
//! with a fixture status + body. The client side calls
//! `tlsfetch_common::http2::send_request` (the same path
//! `HttpClient::send` takes for HTTP/2) with `insecure: true` so it
//! accepts the self-signed cert, then asserts the response came back
//! within a 5-second budget with the right status + body length.
//!
//! The bug we're guarding against: `send_request` used to await the
//! h2 connection-driver task while still holding the `RecvStream`
//! for the response body. The connection driver only exits once the
//! last stream reference is dropped — so it deadlocked. Long-lived
//! peers (Cloudflare CF challenge pages) keep the TCP socket open
//! expecting connection reuse, which is what tripped the hang in
//! production. Servers that proactively send GOAWAY would mask the
//! bug, which is why the green path didn't surface it.
//!
//! Three scenarios:
//!
//! - `h2_403_with_chunked_body_returns_promptly` — the original repro
//!   shape: 403 + 16 KiB body across multiple DATA frames.
//! - `h2_200_with_chunked_body_still_works` — green path sanity.
//! - `h2_404_with_zero_length_body` — edge case: HEADERS with
//!   END_STREAM and no DATA frame at all.
//!
//! Gated on the `http2` feature: the rest of the crate compiles
//! without it (HTTP/1.1-only build), and `tlsfetch_common::http2::
//! send_request` is the entry point under test.

#![cfg(feature = "http2")]

use std::sync::Arc;
use std::time::{Duration, Instant};

use bytes::Bytes;
use h2::server;
use http::{HeaderMap, Method, Response, StatusCode};
use rcgen::{CertificateParams, KeyPair};
use rustls::pki_types::{CertificateDer, PrivateKeyDer, PrivatePkcs8KeyDer};
use rustls::ServerConfig;
use tokio::net::TcpListener;
use tokio_rustls::TlsAcceptor;

/// Five-second per-test budget. The bug manifested as an indefinite
/// hang; anything well above realistic round-trip time on loopback
/// (single-digit ms) means we regressed.
const TEST_BUDGET: Duration = Duration::from_secs(5);

fn install_default_provider() {
    // tokio-rustls 0.26 requires a CryptoProvider in the global
    // default. We mirror the runtime crate's choice — pure-Rust
    // `rustls-rustcrypto` — so tests work on the same crypto
    // surface as the production path. Tests run in parallel; install
    // is idempotent (second caller's `Err` is fine to ignore).
    let _ = rustls_rustcrypto::provider().install_default();
}

fn gen_self_signed() -> (Vec<CertificateDer<'static>>, PrivateKeyDer<'static>) {
    let key_pair = KeyPair::generate().unwrap();
    let params = CertificateParams::new(vec!["localhost".to_string()]).unwrap();
    let cert = params.self_signed(&key_pair).unwrap();
    let cert_der = cert.der().to_vec();
    let key_der = PrivatePkcs8KeyDer::from(key_pair.serialize_der());
    (
        vec![CertificateDer::from(cert_der)],
        PrivateKeyDer::Pkcs8(key_der),
    )
}

fn build_server_config(
    chain: Vec<CertificateDer<'static>>,
    key: PrivateKeyDer<'static>,
) -> Arc<ServerConfig> {
    let mut cfg = ServerConfig::builder()
        .with_no_client_auth()
        .with_single_cert(chain, key)
        .expect("valid cert/key");
    // The client only negotiates h2 on the wire (see
    // `http2::send_request` ALPN list). The server has to advertise
    // `h2` in its ALPN list or rustls's selection will fail.
    cfg.alpn_protocols = vec![b"h2".to_vec()];
    Arc::new(cfg)
}

/// Boot a self-signed h2 listener that responds to the first
/// incoming request with the given status + body. Body is sent in
/// 16-KiB DATA frames to force the chunked-read path. Returns the
/// listener's port and a handle that resolves once the server has
/// finished its single-request lifecycle (so tests can `.await` it
/// for cleanup).
async fn spawn_h2_server(
    status: StatusCode,
    body: Bytes,
) -> (u16, tokio::task::JoinHandle<()>) {
    install_default_provider();
    let (chain, key) = gen_self_signed();
    let acceptor = TlsAcceptor::from(build_server_config(chain, key));
    let listener = TcpListener::bind("127.0.0.1:0").await.expect("bind");
    let port = listener.local_addr().unwrap().port();

    let handle = tokio::spawn(async move {
        let (sock, _) = listener.accept().await.expect("accept");
        sock.set_nodelay(true).ok();
        let tls = acceptor.accept(sock).await.expect("server tls hs");
        let mut conn = server::handshake(tls).await.expect("h2 server hs");
        // Single request, single response — this matches what
        // Cloudflare does for an unauthenticated challenge fetch.
        if let Some(req_result) = conn.accept().await {
            let (_req, mut respond) = req_result.expect("server request");
            let resp = Response::builder()
                .status(status)
                .header("content-type", "text/html; charset=utf-8")
                .header("server", "h2-self-signed-test")
                .body(())
                .unwrap();
            // `end_of_stream = false` so we have to send DATA frames
            // explicitly. If the body is empty we send a single
            // zero-length DATA with END_STREAM, mirroring
            // Cloudflare's behavior for short error pages.
            let mut send = respond.send_response(resp, body.is_empty()).expect("send_response");
            if !body.is_empty() {
                // Chunk the body across multiple DATA frames so the
                // read loop has to iterate. 16 KiB matches the
                // default H2 max frame size.
                let chunk_size = 16 * 1024;
                let mut offset = 0;
                while offset < body.len() {
                    let end = (offset + chunk_size).min(body.len());
                    let piece = body.slice(offset..end);
                    let last = end == body.len();
                    send.send_data(piece, last).expect("send_data");
                    offset = end;
                }
            }
            // Drain any leftover protocol traffic (e.g. WINDOW_UPDATE
            // ACKs from the client) so the connection can wind down
            // cleanly. The client closes after consuming the response.
        }
        // Server-side: hold the TCP connection alive for 30s to
        // mimic a long-lived peer (Cloudflare) that does NOT
        // proactively send GOAWAY after the response — the production
        // case that wedged the client read loop. The 30s budget is
        // far longer than the test's 5s budget, so if the client
        // hangs, the test fails on its own timeout (not the server's
        // tolerance). The drive loop pumps the h2 server state
        // machine so client-side WINDOW_UPDATE and GOAWAY frames are
        // still processed; we exit early when the client GOAWAYs
        // (`accept` returns None) so the test cleans up promptly on
        // the green path.
        let _ = tokio::time::timeout(Duration::from_secs(30), async {
            while conn.accept().await.is_some() {}
        })
        .await;
    });

    (port, handle)
}

/// Drive `send_request` against a server bound to `port` with a
/// hard timeout. Asserts that the call returns within `TEST_BUDGET`
/// — anything else means we've regressed back into the deadlock.
async fn fetch(port: u16) -> tlsfetch_common::http1::HttpResponse {
    let started = Instant::now();
    let result = tokio::time::timeout(
        TEST_BUDGET,
        tlsfetch_common::http2::send_request(
            "localhost",
            port,
            Method::GET,
            "/",
            HeaderMap::new(),
            Vec::new(),
            true, // insecure: accept the self-signed cert
            Some(Duration::from_secs(2)),
            None, // no persona fingerprint
        ),
    )
    .await;
    let elapsed = started.elapsed();
    let resp = match result {
        Ok(Ok(r)) => r,
        Ok(Err(e)) => panic!("send_request errored: {e:?}"),
        Err(_) => panic!(
            "send_request hung past {TEST_BUDGET:?} (elapsed {elapsed:?}) — \
             the h2 chunked-body read deadlock is back"
        ),
    };
    eprintln!(
        "fetch: status={} body_len={} elapsed={:?}",
        resp.status,
        resp.body.len(),
        elapsed
    );
    resp
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn h2_403_with_chunked_body_returns_promptly() {
    // 32 KiB body across 2× 16-KiB DATA frames + a final empty
    // END_STREAM. Bigger than the 64 KiB default flow-control window
    // is overkill for the deadlock case, but exercises the
    // release_capacity + chunked read path in one shot.
    let body = Bytes::from(vec![b'X'; 32 * 1024]);
    let (port, server) = spawn_h2_server(StatusCode::FORBIDDEN, body.clone()).await;

    let resp = fetch(port).await;
    assert_eq!(resp.status, 403, "status code");
    assert_eq!(resp.body.len(), body.len(), "body length");
    assert!(
        resp.body.iter().all(|&b| b == b'X'),
        "body content corrupted"
    );

    let _ = tokio::time::timeout(Duration::from_secs(3), server).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn h2_200_with_chunked_body_still_works() {
    // Green-path sanity: a normal 200 with a 16-KiB body. Verifies
    // the deadlock fix didn't break the success case.
    let body = Bytes::from(vec![b'Y'; 16 * 1024]);
    let (port, server) = spawn_h2_server(StatusCode::OK, body.clone()).await;

    let resp = fetch(port).await;
    assert_eq!(resp.status, 200, "status code");
    assert_eq!(resp.body.len(), body.len(), "body length");
    assert!(
        resp.body.iter().all(|&b| b == b'Y'),
        "body content corrupted"
    );

    let _ = tokio::time::timeout(Duration::from_secs(3), server).await;
}

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
async fn h2_404_with_zero_length_body() {
    // Edge case: HEADERS with END_STREAM, no DATA frame. The read
    // loop should see `body_stream.data().await -> None` on the
    // first poll and return immediately.
    let body = Bytes::new();
    let (port, server) = spawn_h2_server(StatusCode::NOT_FOUND, body).await;

    let resp = fetch(port).await;
    assert_eq!(resp.status, 404, "status code");
    assert_eq!(resp.body.len(), 0, "body length");

    let _ = tokio::time::timeout(Duration::from_secs(3), server).await;
}
