# rustls-tlsfetch

A minimal fork of [rustls](https://github.com/rustls/rustls) **0.23.38**
that adds one opt-in extension point — `ClientConfig::client_hello_mutator` —
so the tlsfetch stack can substitute a Chrome-shaped `ClientHello` on
the wire (and in the transcript hash) while still letting rustls drive
the rest of the TLS 1.3 handshake.

## Why

Stock rustls 0.23 emits a recognizable byte-layout in its `ClientHello`:
fixed extension ordering, no GREASE, rustls-specific `signature_algorithms`
list. Any JA3/JA4-scored gateway (Cloudflare, Akamai, …) classifies that
shape as "rustls" and rejects the connection or rate-limits aggressively.

tlsfetch's `handshake_shim` module produces a Chrome-shaped `ClientHello`
byte-by-byte (correct cipher order, GREASE injection, Chrome
`signature_algorithms`, etc.). This fork plumbs an injection point so
those bytes can replace rustls's own — without forking the rest of the
TLS 1.3 state machine.

## Divergence from upstream rustls 0.23.38

Forked at the published `rustls-0.23.38` crates.io release
(`https://github.com/rustls/rustls` tag `v/0.23.38`). All non-listed
files are byte-identical.

### Files added

- `src/client/mutator.rs` — new module. Defines the public
  `ClientHelloMutator` trait. ~120 lines, all comments and the trait
  declaration. Re-exported from `client::ClientHelloMutator`.

### Files modified

- `src/lib.rs` — registers the new `mutator` module under `client::`
  and re-exports `ClientHelloMutator`. Two added lines + comments.
- `src/client/client_conn.rs` — adds a new public field on
  `ClientConfig`: `client_hello_mutator: Option<Arc<dyn ClientHelloMutator>>`.
  Defaults to `None`. Strict superset of the upstream `ClientConfig`
  surface; all existing callers compile unchanged.
- `src/client/builder.rs` — initializes the new field to `None` in
  the single `ClientConfig` literal inside `with_client_cert_resolver`.
- `src/client/hs.rs` — between the `ClientHello` `Message`
  assembly (`MessagePayload::handshake(chp)`) and the two consumers
  of its `encoded` payload (`transcript_buffer.add_message(&ch)` and
  `cx.common.send_msg(ch, false)`), runs the mutator on the `encoded`
  bytes and substitutes its output. The mutator is skipped on the
  HelloRetryRequest path and the ECH-state path; see
  `mutator.rs` module docs for the exact contract and out-of-scope
  surfaces.

That's the entire patch — five files touched, ~30 net lines of code
plus comments.

### Package identity

The package is published under the upstream name (`rustls`) so a
`[patch.crates-io] rustls = { path = "..." }` block can transparently
swap in the fork across the entire dependency graph (including
transitively through `tokio-rustls`, `quinn`, `rustls-rustcrypto`).
The directory is named `rustls-tlsfetch` to make the divergence
obvious on disk. The library name and module surface are otherwise
unchanged from upstream.

### Defaults

Upstream `rustls 0.23.38` defaults to `["aws_lc_rs", "logging",
"prefer-post-quantum", "std", "tls12"]`. The fork drops the AWS-LC
provider from defaults to `["logging", "std", "tls12"]`, because
tlsfetch ships its own pure-Rust crypto provider
(`rustls-rustcrypto`) and the AWS-LC build pulls in `aws-lc-sys`
(NASM/cmake), which doesn't cross-compile cleanly to Android NDK.
Callers that want AWS-LC or ring can re-enable the feature
explicitly: `rustls = { version = "0.23", features = ["aws_lc_rs"] }`.

## Test the mutator

```
cargo build -p rustls
cargo test  -p tlsfetch-common
cargo test  -p tlsfetch-common --test live_handshake -- --ignored
```

The live tests require network. The `chrome120_http1_get_against_ja3_strict_edge`
test is the canonical proof of the patch: it drives a real TLS 1.3
handshake against a JA3-strict CDN edge (Cloudflare's default zone),
reads an HTTP/1.1 200 response, and exits clean. If the transcript
hash were out of sync after the mutator swap, the handshake would
fail at Finished MAC with `BadRecordMac` — not a 200 OK.

## License

Same as upstream rustls: Apache-2.0 OR ISC OR MIT.
