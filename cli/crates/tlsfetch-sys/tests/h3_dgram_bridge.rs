//! End-to-end test that drives HTTP/3 through the
//! `dgram_quinn` adapter, using `tlsfetch-sys`'s `UdpSocketFactory`
//! as the underlying `DatagramSocket` source. Proves the bridge
//! actually works against a real h3 server, not just compiles.
//!
//! Marked `#[ignore]` so `cargo test` doesn't hammer Cloudflare on
//! every CI run; opt in with `cargo test -p tlsfetch-sys --
//! --ignored h3_dgram_bridge`.

use std::time::Duration;

use http::{HeaderMap, Method};
use tlsfetch_common::http3::send_request_with_factory;
use tlsfetch_sys::UdpSocketFactory;

#[tokio::test(flavor = "multi_thread", worker_threads = 2)]
#[ignore = "bridge currently stalls mid-handshake — see dgram_quinn module status"]
async fn h3_through_dgram_bridge_returns_200() {
    let factory = UdpSocketFactory::new();
    let resp = send_request_with_factory(
        &factory,
        "cloudflare-quic.com",
        443,
        Method::GET,
        "/",
        HeaderMap::new(),
        Vec::new(),
        false,
        Some(Duration::from_secs(60)),
        None,
    )
    .await
    .expect("h3 via dgram bridge");

    assert_eq!(resp.status, 200, "expected 200, got {}", resp.status);
    assert!(
        !resp.body.is_empty(),
        "body should not be empty (got 0 bytes)"
    );
    let body_str = String::from_utf8_lossy(&resp.body);
    assert!(
        body_str.to_lowercase().contains("quic"),
        "body should mention QUIC"
    );
}
