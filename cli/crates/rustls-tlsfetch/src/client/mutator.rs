//! ClientHello mutator hook — tlsfetch fork extension.
//!
//! This module is NOT part of upstream rustls 0.23. It exposes a
//! single trait, [`ClientHelloMutator`], that lets a caller substitute
//! a different byte sequence for the ClientHello rustls would have
//! emitted on its own.
//!
//! ## Why this exists
//!
//! Bot-detection systems on the modern web (Cloudflare, Akamai, Imperva,
//! and homegrown JA3/JA4-scored gateways) classify the source of a
//! TLS connection by hashing the byte-layout of its `ClientHello`:
//! cipher-suite ordering, extension type ordering, GREASE injection,
//! specific extension bodies. Stock rustls 0.23 emits the same
//! `ClientHello` shape on every connection — a recognizable
//! "rustls 0.23" fingerprint — so any consumer that needs to look
//! like Chrome (or another real browser) on the wire cannot use
//! stock rustls directly.
//!
//! tlsfetch ships a [`tlsfetch_common::handshake_shim`] module that
//! encodes a Chrome-shaped `ClientHello`. The mutator hook below is
//! the plumbing that lets that hand-crafted byte sequence replace
//! rustls's own, while keeping the transcript hash in sync so the
//! TLS 1.3 `Finished` MAC still verifies.
//!
//! ## Contract
//!
//! Implementations receive the **full** handshake-layer bytes rustls
//! would have emitted (i.e. the bytes starting at the
//! `HandshakeType` octet `0x01 ClientHello`, including the 3-byte
//! length prefix and the entire ClientHello body) and must return a
//! replacement that:
//!
//! 1. Is still a syntactically valid `Handshake.ClientHello` payload
//!    (same `0x01` type byte, correct 3-byte length, and a body
//!    structured according to RFC 8446 §4.1.2).
//! 2. Uses the same TLS 1.3 `key_share` X25519 public key as the
//!    `ours` parameter. Otherwise the server's ECDH math will
//!    produce a different shared secret than rustls's local key
//!    schedule, and the handshake will fail at `EncryptedExtensions`
//!    decryption.
//! 3. Uses the same `random` and `legacy_session_id` as `ours`. The
//!    `random` is committed to rustls's `ClientHelloInput`; the
//!    `session_id` controls the TLS 1.3 compatibility-mode CCS
//!    record. Failure to mirror these means the server will see
//!    different values in `ServerHello` echo than rustls is
//!    expecting and disagreement on identity.
//!
//! Practically, point (1) is the only invariant the mutator has full
//! freedom over: it can reorder extensions, add GREASE, swap
//! `signature_algorithms` body, etc. Points (2) and (3) require the
//! mutator to read those fields out of `ours` and copy them through.
//! The `tlsfetch_common::handshake_shim` builder accepts these
//! values as inputs precisely to satisfy this contract.
//!
//! ## Effect on the transcript hash
//!
//! rustls 0.23 hashes the `encoded` payload of the `Handshake`
//! message into its TLS 1.3 transcript before sending. When a
//! mutator is installed, the hook in
//! `client/hs.rs::emit_client_hello_for_retry` substitutes the
//! mutator's output for the `encoded` payload *before* both the
//! transcript-add and the wire-send. The result is that the
//! transcript hash rustls computes locally is over the same bytes
//! the server hashes from the wire, so the TLS 1.3 Finished MAC
//! continues to verify on both sides of the handshake.
//!
//! ## Limitations
//!
//! - **HelloRetryRequest path is not mutated.** If the server sends
//!   an HRR, the second ClientHello rustls emits is not run through
//!   the mutator. This is fine for the typical
//!   send-Chrome-shaped-CH-and-the-server-accepts-X25519-immediately
//!   case (no HRR), which is what Chrome itself does ≥99 % of the
//!   time. Servers that always HRR (e.g. forcing post-quantum key
//!   exchange) will fall back to rustls's stock CH shape.
//! - **ECH is not mutated.** If the caller installs both an ECH
//!   `EchMode` and a `ClientHelloMutator`, the mutator runs on the
//!   *outer* (cover) hello only. Mixing the two is unsupported.
//! - **PSK/0-RTT binders are not recomputed.** A caller that uses
//!   both 0-RTT and a mutator must produce a `Vec<u8>` whose
//!   `binders` field is already correctly signed for the resuming
//!   PSK. The mutator runs after rustls's `fill_in_psk_binder`
//!   call, so any caller-side binder must be computed off the
//!   mutated bytes externally. tlsfetch does not use 0-RTT today.

use alloc::boxed::Box;
use alloc::sync::Arc;
use alloc::vec::Vec;
use core::fmt;

/// Substitutes a caller-controlled byte sequence for the ClientHello
/// rustls would have emitted. See the module docs for the contract.
///
/// Implementations must be `Send + Sync` because rustls's
/// `ClientConfig` is `Send + Sync` and can be shared across threads.
pub trait ClientHelloMutator: Send + Sync + fmt::Debug {
    /// Called by rustls's `emit_client_hello_for_retry` after the
    /// initial ClientHello has been assembled but before either the
    /// transcript hash or the wire write happens. `ours` is the
    /// handshake-layer bytes rustls would otherwise have emitted
    /// (starting at the `0x01 ClientHello` type byte).
    ///
    /// Return value: the bytes that should replace `ours` for both
    /// the wire write and the transcript-hash input. Must satisfy
    /// the invariants documented at module level: same `random`,
    /// same `legacy_session_id`, and at least one `key_share` entry
    /// for the group rustls picked (typically X25519).
    fn mutate_client_hello(&self, ours: &[u8]) -> Vec<u8>;
}

impl<T: ClientHelloMutator + ?Sized> ClientHelloMutator for Arc<T> {
    fn mutate_client_hello(&self, ours: &[u8]) -> Vec<u8> {
        (**self).mutate_client_hello(ours)
    }
}

impl<T: ClientHelloMutator + ?Sized> ClientHelloMutator for Box<T> {
    fn mutate_client_hello(&self, ours: &[u8]) -> Vec<u8> {
        (**self).mutate_client_hello(ours)
    }
}
