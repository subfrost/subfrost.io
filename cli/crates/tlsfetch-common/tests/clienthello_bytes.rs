//! Regression test for the Chrome extension-order patch.
//!
//! Builds a ClientHello via [`tlsfetch_common::handshake_shim::build_client_hello`]
//! for each Chrome-class persona and asserts that:
//!
//! 1. The leading bytes match the TLS ClientHello shape Chrome emits
//!    (legacy_version = TLS 1.2, 32-byte random, 32-byte session ID,
//!    GREASE-class cipher at the head of the cipher list).
//! 2. The JA3 string parsed back out of the shim bytes equals the JA3
//!    string stored on the persona's [`tlsfetch_common::Fingerprint`]
//!    — i.e. the wire output round-trips back to the JA3 spec the
//!    persona declared. This is the equivalent of "the leading bytes
//!    match Chrome 144's JA3 hash exactly" from the task spec; we
//!    assert against the persona's declared JA3 string rather than
//!    re-computing the MD5 here because the MD5 hashes are already
//!    pinned in the persona fixture files.
//!
//! Adding a new Chrome persona? Add it to [`CHROME_PERSONAS`] below and
//! the test will pick it up.

use tlsfetch_common::handshake_shim::{build_client_hello, ja3_from_client_hello, ClientHelloInputs};
use tlsfetch_common::{Fingerprint, KnownFingerprint};

const CHROME_PERSONAS: &[KnownFingerprint] = &[
    KnownFingerprint::Chrome120,
    KnownFingerprint::Chrome144,
];

fn deterministic_inputs(fp: &Fingerprint) -> ClientHelloInputs<'_> {
    // Deterministic inputs so the JA3 hash is reproducible. Random
    // bytes ≠ 0 so we'd catch a fencepost zero-copy bug. Session ID
    // 32 bytes (Chrome TLS-1.3-compat). x25519 public 32 bytes.
    ClientHelloInputs {
        fingerprint: fp,
        sni: "example.invalid",
        random: [0x42; 32],
        session_id: [0x33; 32],
        x25519_public: [0x77; 32],
    }
}

fn is_grease_class(id: u16) -> bool {
    (id & 0x0F0F) == 0x0A0A && (id >> 8) == (id & 0xFF)
}

#[test]
fn chrome_personas_round_trip_their_ja3_strings() {
    for kf in CHROME_PERSONAS {
        let fp = kf.into_fingerprint();
        let bytes = build_client_hello(&deterministic_inputs(&fp));
        let ja3 = ja3_from_client_hello(&bytes).unwrap_or_else(|| {
            panic!("ja3_from_client_hello failed for {:?}", kf)
        });
        assert_eq!(
            Some(ja3.clone()),
            fp.ja3,
            "ja3 round-trip mismatch for {:?}: shim emitted {}, persona declared {:?}",
            kf,
            ja3,
            fp.ja3
        );
    }
}

#[test]
fn client_hello_starts_with_tls12_record_legacy_version() {
    for kf in CHROME_PERSONAS {
        let fp = kf.into_fingerprint();
        let bytes = build_client_hello(&deterministic_inputs(&fp));
        // First two bytes must be 0x0303 (TLS 1.2) — Chrome and every
        // modern TLS 1.3 client pins legacy_version to 0x0303 and
        // negotiates the real version via supported_versions.
        assert_eq!(
            &bytes[..2],
            &[0x03, 0x03],
            "legacy_version mismatch for {:?}",
            kf
        );
    }
}

#[test]
fn cipher_list_has_grease_at_head() {
    for kf in CHROME_PERSONAS {
        let fp = kf.into_fingerprint();
        let bytes = build_client_hello(&deterministic_inputs(&fp));
        // Layout: legacy_version(2) + random(32) + session_id_len(1) +
        // session_id(32) + cipher_list_len(2) + first_cipher(2)…
        let head_off = 2 + 32 + 1 + 32 + 2;
        let first = u16::from_be_bytes([bytes[head_off], bytes[head_off + 1]]);
        assert!(
            is_grease_class(first),
            "{:?}: first cipher should be GREASE-class, got 0x{:04X}",
            kf,
            first
        );
    }
}

#[test]
fn extension_block_has_grease_at_head_and_tail() {
    for kf in CHROME_PERSONAS {
        let fp = kf.into_fingerprint();
        let bytes = build_client_hello(&deterministic_inputs(&fp));
        // Walk past everything up to the extensions block.
        let mut pos = 2 + 32; // version + random
        pos += 1 + (bytes[pos] as usize); // session_id (length-prefixed)
        let cipher_len = u16::from_be_bytes([bytes[pos], bytes[pos + 1]]) as usize;
        pos += 2 + cipher_len;
        pos += 1 + (bytes[pos] as usize); // compression methods
        let ext_total = u16::from_be_bytes([bytes[pos], bytes[pos + 1]]) as usize;
        pos += 2;
        let ext_end = pos + ext_total;

        // First extension type — must be GREASE.
        let head_ext = u16::from_be_bytes([bytes[pos], bytes[pos + 1]]);
        assert!(
            is_grease_class(head_ext),
            "{:?}: first extension should be GREASE-class, got 0x{:04X}",
            kf,
            head_ext
        );

        // Walk to the last extension; collect its type.
        let mut cursor = pos;
        let mut last_type = head_ext;
        while cursor < ext_end {
            let etype = u16::from_be_bytes([bytes[cursor], bytes[cursor + 1]]);
            let elen =
                u16::from_be_bytes([bytes[cursor + 2], bytes[cursor + 3]]) as usize;
            last_type = etype;
            cursor += 4 + elen;
        }
        assert!(
            is_grease_class(last_type),
            "{:?}: last extension should be GREASE-class, got 0x{:04X}",
            kf,
            last_type
        );
    }
}
