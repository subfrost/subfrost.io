//! End-to-end test: drive an HTTPS request through `WsTcpFactory`
//! against a live `ws-tunnel/server.mjs` relay. Validates that the
//! WebSocket-tunneled byte stream is bit-identical to a direct TCP
//! connection from `tlsfetch_common::TlsConnection`'s perspective.
//!
//! Marked `#[ignore]` because it expects a relay running on
//! `ws://127.0.0.1:19999/` and reaches out to nghttp2.org. Run with:
//!
//!     node ws-tunnel/server.mjs &
//!     cargo test -p tlsfetch-sys --features ws-tunnel \
//!         --test ws_tcp_tunnel -- --ignored --nocapture

#![cfg(feature = "ws-tunnel")]

use tlsfetch_common::client::{HttpClient, RequestOptions};
use tlsfetch_common::http1::HttpRequest;
use tlsfetch_sys::WsTcpFactory;

#[test]
#[ignore = "needs ws-tunnel relay on :19999"]
fn https_get_through_ws_tcp_tunnel() {
    let factory = WsTcpFactory::new("ws://127.0.0.1:19999/").expect("relay url");
    let client = HttpClient::new(factory);

    let mut req = HttpRequest::get("nghttp2.org", "/");
    req.headers.push(("Host".into(), "nghttp2.org".into()));
    req.headers.push(("Connection".into(), "close".into()));
    req.headers.push(("User-Agent".into(), "tlsfetch-ws-tunnel-test/0.1".into()));

    let opts = RequestOptions::default();
    let resp = client
        .send("nghttp2.org", 443, &req, &opts)
        .expect("https through ws-tunnel");

    assert_eq!(resp.status, 200, "expected 200, got {}", resp.status);
    let body = String::from_utf8_lossy(&resp.body);
    assert!(
        body.to_lowercase().contains("nghttp2"),
        "body should mention nghttp2 (got {} bytes, first 200: {:?})",
        body.len(),
        &body.chars().take(200).collect::<String>()
    );
}
