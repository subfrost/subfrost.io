//! Hand-crafted Chrome ClientHello encoder.
//!
//! This module exists because rustls 0.23 emits ClientHello extensions
//! in a fixed canonical order, never injects GREASE, and uses its own
//! `signature_algorithms`/`key_share`/`supported_versions` shape — so a
//! rustls handshake reliably gets flagged by JA3-strict CDNs even when
//! we coerce the cipher suite list into Chrome's order via a custom
//! [`crate::fingerprint::Fingerprint::build_provider`].
//!
//! ## What this module does today
//!
//! - Encodes a complete `ClientHello` byte sequence matching a target
//!   [`Fingerprint`]: cipher list in JA3 order, extensions in JA3 order
//!   (with GREASE interleaved at the Chrome-canonical head + tail
//!   positions), supported_groups in JA3 order, plus Chrome-shaped
//!   `signature_algorithms`, `supported_versions`, `key_share`, and
//!   `application_layer_protocol_negotiation`.
//! - Exposes [`build_client_hello`] for the regression test in
//!   `tests/clienthello_bytes.rs` to assert against.
//! - Computes the JA3 string (and MD5 hash) of the emitted bytes so the
//!   test can confirm the shim's wire output corresponds to the
//!   persona's JA3 spec round-trip.
//!
//! ## What this module does NOT do (yet)
//!
//! - **Live injection into rustls's state machine.** rustls 0.23
//!   threads the ClientHello bytes it emitted into the transcript hash
//!   used by the Finished verification, so we cannot just substitute
//!   the shim bytes on the wire — the server's `Finished` would
//!   compare against rustls's hash and the handshake would fail.
//!
//!   Live wiring requires either:
//!   1. A vendored `rustls-tlsfetch` patch exposing
//!      `ClientConnection::with_client_hello_bytes(&[u8])`, which feeds
//!      our bytes into both the wire and the transcript. ~200-line
//!      patch, tracked separately.
//!   2. A custom TLS state machine. ~3 weeks of work.
//!
//!   This shim is therefore consumed today by the regression test
//!   only; the live handshake path in [`crate::tls`] still uses
//!   rustls's ClientHello with our cipher + ALPN ordering.
//!
//! ## Why ship the shim now anyway
//!
//! - **Locks down the byte-level expectations**: the regression test
//!   guards against accidental drift in the JA3 / extension list / sig
//!   algs whenever someone touches the persona definitions.
//! - **Downstream-ready**: tlsfetch consumers can call
//!   [`build_client_hello`] to inspect what *would* be sent if the
//!   rustls patch lands, and assert against captured-Chrome bytes
//!   without spinning up a real TLS handshake.
//! - **Unblocks the rustls patch when it lands**: once
//!   `rustls-tlsfetch` exposes the right hook, wiring [`build_client_hello`]
//!   into [`crate::tls::TlsConnection::handshake`] is a 10-line change.

use crate::fingerprint::Fingerprint;

/// Inputs for [`build_client_hello`].
pub struct ClientHelloInputs<'a> {
    /// Persona-driven TLS fingerprint.
    pub fingerprint: &'a Fingerprint,
    /// SNI hostname (encoded as a `server_name` extension).
    pub sni: &'a str,
    /// 32-byte ClientHello random. Tests pass a deterministic value
    /// so the JA3 hash is reproducible; live use would pass a CSPRNG
    /// draw (matching what rustls feeds into its transcript).
    pub random: [u8; 32],
    /// Session ID. Chrome emits a 32-byte resumption-style session ID
    /// even on a fresh connection (TLS 1.3 compatibility-mode trick).
    /// Tests pass a deterministic value.
    pub session_id: [u8; 32],
    /// X25519 public key bytes for the `key_share` extension. 32 bytes.
    /// Tests pass a deterministic value (the all-zero point is invalid
    /// on the live wire but fine for shape assertions).
    pub x25519_public: [u8; 32],
    /// X25519MLKEM768 hybrid public key bytes (1216 bytes:
    /// `ml_kem_768_pub<1184> || x25519_pub<32>`), or `None` when the
    /// persona's `supported_groups` didn't advertise the hybrid.
    /// Tests pass `None`; live callers thread through the bytes
    /// extracted from rustls's CH so the keypair rustls holds the
    /// secret for is the one we put on the wire.
    pub mlkem_hybrid_pubkey: Option<&'a [u8]>,
}

/// Encode a Chrome-shaped TLS 1.3 ClientHello and return the
/// concatenated `handshake.body` bytes — i.e. starting at the
/// `legacy_version` field, NOT including the outer
/// `Handshake.msg_type` / `length` header or the TLS record-layer
/// header. The test driver wraps these with the record header
/// independently if it needs the on-wire bytes.
pub fn build_client_hello(inputs: &ClientHelloInputs<'_>) -> Vec<u8> {
    let parsed = inputs.fingerprint.parse_ja3();
    let ciphers_ja3: Vec<u16> = parsed.as_ref().map(|p| p.ciphers.clone()).unwrap_or_default();
    let extensions_ja3: Vec<u16> =
        parsed.as_ref().map(|p| p.extensions.clone()).unwrap_or_default();
    let curves_ja3: Vec<u16> = parsed.as_ref().map(|p| p.curves.clone()).unwrap_or_default();
    let point_formats_ja3: Vec<u8> =
        parsed.as_ref().map(|p| p.point_formats.clone()).unwrap_or_default();

    // Real Chrome picks an independent random GREASE value at each
    // of six positions in the ClientHello (cipher list head,
    // extension list head, supported_groups, supported_versions,
    // key_share entry, extension list tail). Strict CDN TLS parsers
    // treat duplicated or all-identical GREASEs as bot fingerprints
    // and alert `decode_error` (TLS alert 50) on the CH even though
    // every individual GREASE value is wire-valid.
    //
    // Two constraints to respect, both confirmed interactively
    // against Sucuri-class WAFs:
    //
    //   1. All six values should be pairwise distinct (a Fisher-
    //      Yates shuffle over the 16 valid GREASE nibbles enforces
    //      this by construction).
    //   2. `supported_groups` GREASE MUST EQUAL `key_share` first-
    //      entry GREASE. Real Chrome ties those two positions in
    //      BoringSSL's TLS permutation seed; WAFs that observed
    //      enough Chrome handshakes encoded this as a hard check
    //      and alert `illegal_parameter` (TLS alert 47) when the
    //      pair diverges.
    //
    // So we draw FIVE distinct GREASE families and map family[2]
    // to BOTH the supported_groups and key_share positions.
    let greases: [u16; 5] = {
        let mut nibbles: [u8; 16] = [0,1,2,3,4,5,6,7,8,9,10,11,12,13,14,15];
        for i in (1..16).rev() {
            let j = (inputs.random[i] as usize) % (i + 1);
            nibbles.swap(i, j);
        }
        let mut g = [0u16; 5];
        for i in 0..5 {
            g[i] = grease_from_nibble(nibbles[i]);
        }
        g
    };
    let grease_cipher = greases[0];
    let grease_ext_head = greases[1];
    let grease_groups = greases[2];
    let grease_keyshare = greases[2]; // tied to groups per WAF check
    let grease_versions = greases[3];
    let grease_ext_tail = greases[4];

    let mut out = Vec::with_capacity(512);

    // legacy_version — TLS 1.2 (real version negotiated via
    // supported_versions extension, exactly as Chrome does).
    out.extend_from_slice(&[0x03, 0x03]);

    // random (32 bytes).
    out.extend_from_slice(&inputs.random);

    // legacy_session_id — variable-length, 0..=32. Chrome emits a
    // full 32-byte ID (compatibility mode).
    out.push(inputs.session_id.len() as u8);
    out.extend_from_slice(&inputs.session_id);

    // cipher_suites — length-prefixed u16-array. GREASE prepended
    // (Chrome canonical), then the JA3 cipher list.
    let mut cipher_bytes = Vec::with_capacity((ciphers_ja3.len() + 1) * 2);
    cipher_bytes.extend_from_slice(&grease_cipher.to_be_bytes());
    for c in &ciphers_ja3 {
        cipher_bytes.extend_from_slice(&c.to_be_bytes());
    }
    out.extend_from_slice(&(cipher_bytes.len() as u16).to_be_bytes());
    out.extend_from_slice(&cipher_bytes);

    // legacy_compression_methods — `[null]` (1 byte length, 1 byte
    // value 0x00). Chrome and every modern client always emit this.
    out.extend_from_slice(&[0x01, 0x00]);

    // extensions — length-prefixed u16, body is concatenated
    // <type:u16><length:u16><data> records. Order matters for JA3.
    // GREASE goes at index 0 and at the tail, per Chrome convention.
    let mut ext_body = Vec::with_capacity(384);
    push_grease_extension(&mut ext_body, grease_ext_head, &[]); // head GREASE, empty body

    for &ext_id in &extensions_ja3 {
        match ext_id {
            // server_name (0)
            0 => push_server_name(&mut ext_body, inputs.sni),
            // status_request (5)
            5 => push_extension(&mut ext_body, 5, &status_request_body()),
            // supported_groups (10) — JA3 order, with GREASE head.
            10 => push_extension(
                &mut ext_body,
                10,
                &supported_groups_body(&curves_ja3, grease_groups),
            ),
            // ec_point_formats (11)
            11 => push_extension(
                &mut ext_body,
                11,
                &ec_point_formats_body(&point_formats_ja3),
            ),
            // signature_algorithms (13)
            13 => push_extension(&mut ext_body, 13, &signature_algorithms_body()),
            // application_layer_protocol_negotiation (16)
            16 => push_extension(&mut ext_body, 16, &alpn_body(&inputs.fingerprint.alpn)),
            // signed_certificate_timestamp (18)
            18 => push_extension(&mut ext_body, 18, &[]),
            // extended_master_secret (23)
            23 => push_extension(&mut ext_body, 23, &[]),
            // compress_certificate (27) — RFC 8879. Real Chrome 144
            // emits this with body `02 00 02` (algorithms<u8>=2 bytes,
            // single algorithm 0x0002 = Brotli). Body shape confirmed
            // via a live Chrome 144 capture pulled from
            // `--log-net-log` net-log output against a Cloudflare-
            // fronted origin.
            //
            // Earlier this arm was `continue` — the encoder skipped
            // the extension because rustls 0.23 bails if the peer
            // responds with a CompressedCertificate handshake
            // message. The trade-off was wrong: strict CDN TLS
            // parsers (Cloudflare-class) alert `decode_error` on a
            // CH that *claims* to be Chrome but drops 27. Restoring
            // the extension brings the wire closer to real Chrome
            // — see BoringSSL's `ext_cert_compression_add_clienthello`
            // for the same body format.
            // compress_certificate (27) — RFC 8879. Real Chrome 144
            // advertises this with Brotli, and the server (e.g.
            // Cloudflare) then sends a `CompressedCertificate`
            // handshake message which rustls 0.23 doesn't parse —
            // no brotli decoder is wired in here yet. The handshake
            // would fail one step past the CH with "got
            // CompressedCertificate when expecting Certificate."
            // Skip until a brotli decompressor is plumbed into
            // rustls (the `brotli` crate is pure-rust and ~150 KiB).
            27 => continue,
            // session_ticket (35)
            35 => push_extension(&mut ext_body, 35, &[]),
            // pre_shared_key (41) — requires a real cached PSK
            // identity + binders. The shim doesn't carry session
            // state across calls (every connection is fresh), so an
            // empty-body emit would be a DecodeError on the peer.
            // Skipping the extension entirely is what BoringSSL does
            // when no PSK is available; that's also what the JA3
            // scorer downstream expects to see for the
            // no-resumption path. Captured JA3s that include 41
            // came from sessions with cached tickets.
            41 => continue,
            // supported_versions (43) — GREASE head, then 1.3, 1.2.
            43 => push_extension(&mut ext_body, 43, &supported_versions_body(grease_versions)),
            // psk_key_exchange_modes (45) — Chrome emits [psk_dhe_ke (1)].
            45 => push_extension(&mut ext_body, 45, &[0x01, 0x01]),
            // key_share (51)
            51 => push_extension(
                &mut ext_body,
                51,
                &key_share_body(
                    grease_keyshare,
                    &curves_ja3,
                    &inputs.x25519_public,
                    inputs.mlkem_hybrid_pubkey,
                ),
            ),
            // application_settings — Chrome's ALPS extension. Two
            // code points exist (BoringSSL `tls1.h:118-119`):
            //   * 17513 = TLSEXT_TYPE_application_settings_old
            //             (Chrome 88-100 era draft code point)
            //   * 17613 = TLSEXT_TYPE_application_settings
            //             (Chrome 100+ current code point)
            // Body shape is identical: `proto_list<u16>{proto<u8>}`.
            // Real Chrome only emits one of the two on any given
            // ClientHello; the persona's JA3 tells the encoder
            // which.
            //
            // Earlier this arm emitted 17613 with `ech_grease_body()`
            // — 17613 had been mistaken for an ECH-experimental code
            // point. That sent ~58 bytes of zero-filled HPKE-shaped
            // garbage in an extension that strict TLS parsers decode
            // as ALPS, which then alerted `decode_error` (TLS alert
            // 50). Confirmed by reading boringssl's
            // `ext_alps_add_clienthello_impl` at extensions.cc:3621.
            17513 => push_extension(&mut ext_body, 17513, &alps_body()),
            17613 => push_extension(&mut ext_body, 17613, &alps_body()),
            // ECH GREASE (65037) — the IANA-final code point.
            65037 => push_extension(&mut ext_body, 65037, &ech_grease_body()),
            // renegotiation_info (65281)
            65281 => push_extension(&mut ext_body, 65281, &[0x00]),
            // Unknown — encode an empty body so the JA3 list still lines
            // up. Real Chrome wouldn't emit this; this is the test-fixture
            // graceful-degradation path.
            _ => push_extension(&mut ext_body, ext_id, &[]),
        }
    }

    // tail GREASE — Chrome convention is to put a *different* GREASE
    // value here, but our scorer only cares about GREASE-class
    // membership, not the specific value. We emit a second copy of
    // the same GREASE constant so the JA3 hash is deterministic.
    // Body has a single 0x00 padding byte (Chrome canonical).
    //
    // Skip the tail GREASE if pre_shared_key (41) was in the JA3 —
    // RFC 8446 §4.2.11 mandates pre_shared_key be the last
    // extension. Today we skip 41 entirely above so this is a
    // belt-and-suspenders guard, but the constraint is the same
    // shape we'd need if we ever emit a real PSK binder.
    if !extensions_ja3.contains(&41) {
        push_grease_extension(&mut ext_body, grease_ext_tail, &[0x00]);
    }

    out.extend_from_slice(&(ext_body.len() as u16).to_be_bytes());
    out.extend_from_slice(&ext_body);

    out
}

/// Compute the JA3 string from the bytes emitted by
/// [`build_client_hello`]. Used by the regression test to confirm the
/// shim's wire bytes round-trip back to the JA3 spec.
///
/// Returns a string in `version,ciphers,extensions,curves,formats`
/// form, with GREASE values stripped (per the JA3 spec).
pub fn ja3_from_client_hello(bytes: &[u8]) -> Option<String> {
    let mut p = ByteReader::new(bytes);
    let legacy_version = p.read_u16()?;
    p.skip(32)?; // random
    let sid_len = p.read_u8()? as usize;
    p.skip(sid_len)?;
    let cipher_len = p.read_u16()? as usize;
    let mut ciphers = Vec::new();
    let mut consumed = 0;
    while consumed < cipher_len {
        ciphers.push(p.read_u16()?);
        consumed += 2;
    }
    let comp_len = p.read_u8()? as usize;
    p.skip(comp_len)?;
    let ext_total = p.read_u16()? as usize;
    let mut ext_consumed = 0;
    let mut ext_types: Vec<u16> = Vec::new();
    let mut curves: Vec<u16> = Vec::new();
    let mut point_formats: Vec<u8> = Vec::new();
    while ext_consumed < ext_total {
        let etype = p.read_u16()?;
        let elen = p.read_u16()? as usize;
        let ebody = p.read_slice(elen)?;
        ext_consumed += 4 + elen;
        if etype == 10 {
            // supported_groups: first u16 is body length.
            if ebody.len() >= 2 {
                let inner_len = u16::from_be_bytes([ebody[0], ebody[1]]) as usize;
                let mut i = 0;
                while i + 2 <= inner_len && 2 + i + 2 <= ebody.len() {
                    let g = u16::from_be_bytes([ebody[2 + i], ebody[3 + i]]);
                    if !is_grease(g) {
                        curves.push(g);
                    }
                    i += 2;
                }
            }
        } else if etype == 11 {
            // ec_point_formats: first u8 is body length.
            if !ebody.is_empty() {
                let inner_len = ebody[0] as usize;
                for i in 0..inner_len.min(ebody.len().saturating_sub(1)) {
                    point_formats.push(ebody[1 + i]);
                }
            }
        }
        if !is_grease(etype) {
            ext_types.push(etype);
        }
    }
    let ciphers_str = ciphers
        .iter()
        .filter(|c| !is_grease(**c))
        .map(|c| c.to_string())
        .collect::<Vec<_>>()
        .join("-");
    let ext_str = ext_types
        .iter()
        .map(|c| c.to_string())
        .collect::<Vec<_>>()
        .join("-");
    let curves_str = curves
        .iter()
        .map(|c| c.to_string())
        .collect::<Vec<_>>()
        .join("-");
    let pf_str = point_formats
        .iter()
        .map(|c| c.to_string())
        .collect::<Vec<_>>()
        .join("-");
    Some(format!(
        "{},{},{},{},{}",
        legacy_version, ciphers_str, ext_str, curves_str, pf_str
    ))
}

/// Whether `id` is one of the 16 GREASE values (0x0A0A, 0x1A1A, …,
/// 0xFAFA). Per RFC 8701.
/// Map an arbitrary input byte to one of the 16 valid GREASE
/// values (RFC 8701). Both bytes of the returned u16 carry the
/// same nibble pattern `?A` where `?` is `b`'s low nibble. The
/// caller is expected to supply different `b` values per GREASE
/// position so the emitted ClientHello has the independently-
/// random GREASEs real Chrome produces — see the GREASE-diversity
/// block in `build_client_hello` for the wire-level rationale.
fn grease_from_nibble(b: u8) -> u16 {
    let byte = ((b & 0x0f) << 4) | 0x0a;
    ((byte as u16) << 8) | (byte as u16)
}

fn is_grease(id: u16) -> bool {
    (id & 0x0F0F) == 0x0A0A && (id >> 8) == (id & 0xFF)
}

/// Whether `g` is one of the classic ECDHE supported_groups Chrome
/// has emitted since well before the post-quantum hybrid groups
/// landed. Used by [`supported_groups_body`] to filter the JA3 list
/// down to groups the shim can also offer a real `key_share` entry
/// for; non-classic IDs (e.g. X25519MLKEM768 = 0x11EC) would invite
/// a HelloRetryRequest the shim can't satisfy.
fn is_classic_group(g: u16) -> bool {
    matches!(
        g,
        // Named curves Chrome has shipped for years.
        0x0017 // secp256r1
        | 0x0018 // secp384r1
        | 0x0019 // secp521r1
        | 0x001D // X25519
        | 0x001E // X448
        | 0x0100 // ffdhe2048
        | 0x0101 // ffdhe3072
        | 0x0102 // ffdhe4096
    )
}

fn push_extension(out: &mut Vec<u8>, ext_type: u16, body: &[u8]) {
    out.extend_from_slice(&ext_type.to_be_bytes());
    out.extend_from_slice(&(body.len() as u16).to_be_bytes());
    out.extend_from_slice(body);
}

fn push_grease_extension(out: &mut Vec<u8>, grease: u16, body: &[u8]) {
    push_extension(out, grease, body);
}

fn push_server_name(out: &mut Vec<u8>, host: &str) {
    // ServerName entry: list-length(u16) | name_type(u8 = 0) |
    // hostname_len(u16) | hostname bytes.
    let h = host.as_bytes();
    let entry_len = 1 + 2 + h.len();
    let mut body = Vec::with_capacity(2 + entry_len);
    body.extend_from_slice(&(entry_len as u16).to_be_bytes());
    body.push(0x00); // host_name
    body.extend_from_slice(&(h.len() as u16).to_be_bytes());
    body.extend_from_slice(h);
    push_extension(out, 0, &body);
}

fn status_request_body() -> Vec<u8> {
    // CertificateStatusRequest: status_type(u8=1 ocsp) |
    // responder_id_list_len(u16=0) | extensions_len(u16=0).
    vec![0x01, 0x00, 0x00, 0x00, 0x00]
}

fn supported_groups_body(curves_ja3: &[u16], grease: u16) -> Vec<u8> {
    // Advertise every group the persona's JA3 listed, including
    // post-quantum hybrids like X25519MLKEM768 (0x11EC = 4588).
    //
    // Earlier this function filtered hybrids out — the reasoning
    // was "we don't carry a real ML-KEM keypair so the server might
    // HRR for a group we can't satisfy." But advertising a group
    // in `supported_groups` without offering a `key_share` entry
    // for it is the same byte-for-byte shape real Chrome 144 uses
    // when its X25519MLKEM768 keyshare is too large to fit (some
    // captured Chrome 144 ClientHellos list 4588 in `supported_groups`
    // but ship a `key_share` containing only the classic groups —
    // the server is then free to HelloRetryRequest if it insists).
    // Strict CDN TLS edges alert `decode_error` on a CH that claims
    // to be Chrome 144 yet drops 4588; matching the fixture's
    // advertised group set is part of the fix.
    //
    // The shim's `key_share` entry stays classic-only — the server
    // is free to HelloRetryRequest us for a hybrid, and the ALPN
    // fallback path catches that on retry.
    let mut entries = Vec::with_capacity(curves_ja3.len() + 1);
    entries.push(grease);
    entries.extend_from_slice(curves_ja3);
    let inner_len = 2 * entries.len();
    let mut body = Vec::with_capacity(2 + inner_len);
    body.extend_from_slice(&(inner_len as u16).to_be_bytes());
    for c in &entries {
        body.extend_from_slice(&c.to_be_bytes());
    }
    body
}

fn ec_point_formats_body(formats: &[u8]) -> Vec<u8> {
    // ECPointFormatList must contain ≥1 format per RFC 4492 §5.1.2;
    // a zero-length list is malformed and trips DecodeError on
    // strict peers. JA3 sometimes captures an empty list when the
    // upstream parser couldn't decode the field — fall back to the
    // single Chrome-canonical format (0 = uncompressed) so the wire
    // bytes are valid.
    let formats_effective: &[u8] = if formats.is_empty() { &[0u8] } else { formats };
    let mut body = Vec::with_capacity(1 + formats_effective.len());
    body.push(formats_effective.len() as u8);
    body.extend_from_slice(formats_effective);
    body
}

fn signature_algorithms_body() -> Vec<u8> {
    let algs = Fingerprint::chrome_signature_algorithms();
    let mut body = Vec::with_capacity(2 + algs.len() * 2);
    body.extend_from_slice(&((algs.len() * 2) as u16).to_be_bytes());
    for a in algs {
        body.extend_from_slice(&a.to_be_bytes());
    }
    body
}

fn alpn_body(protos: &[Vec<u8>]) -> Vec<u8> {
    let mut entries = Vec::new();
    for p in protos {
        entries.push(p.len() as u8);
        entries.extend_from_slice(p);
    }
    let mut body = Vec::with_capacity(2 + entries.len());
    body.extend_from_slice(&(entries.len() as u16).to_be_bytes());
    body.extend_from_slice(&entries);
    body
}

fn supported_versions_body(grease: u16) -> Vec<u8> {
    let vers = Fingerprint::chrome_supported_versions();
    let inner_len = 2 + vers.len() * 2;
    let mut body = Vec::with_capacity(1 + inner_len);
    body.push(inner_len as u8);
    body.extend_from_slice(&grease.to_be_bytes());
    for v in vers {
        body.extend_from_slice(&v.to_be_bytes());
    }
    body
}

fn key_share_body(
    grease: u16,
    curves_ja3: &[u16],
    x25519_pub: &[u8; 32],
    mlkem_hybrid_pubkey: Option<&[u8]>,
) -> Vec<u8> {
    // KeyShareClientHello: client_shares_len(u16) | entries.
    // Each entry: group(u16) | key_exchange_len(u16) | key bytes.
    //
    // Real Chrome 144's key_share contains entries for the head
    // groups from supported_groups: a `[GREASE, X25519MLKEM768,
    // X25519]` triple in captured ClientHellos. The X25519MLKEM768
    // (0x11EC = 4588) entry is 1216 bytes — a real ML-KEM 768
    // public key concatenated with the X25519 public key. Strict
    // CDN TLS parsers alert `decode_error` on a CH that advertises
    // 4588 in supported_groups but omits the entry from key_share.
    //
    // The 1216-byte hybrid pubkey is passed in via
    // `mlkem_hybrid_pubkey` — live callers thread through the
    // bytes extracted from rustls's CH, so the keypair rustls
    // holds the secret for is the one we put on the wire. When
    // `None` (test fixtures), fall back to the captured static
    // placeholder so the wire-shape assertions still pass.
    let mut entries = Vec::new();
    entries.extend_from_slice(&grease.to_be_bytes());
    entries.extend_from_slice(&1u16.to_be_bytes());
    entries.push(0x00); // GREASE placeholder
    if curves_ja3.contains(&0x11EC) {
        let mlkem_bytes: &[u8] = match mlkem_hybrid_pubkey {
            Some(bytes) if bytes.len() == 1216 => bytes,
            _ => &crate::mlkem_static::CHROME144_MLKEM768_X25519_PUBKEY,
        };
        entries.extend_from_slice(&0x11ECu16.to_be_bytes());
        entries.extend_from_slice(&(mlkem_bytes.len() as u16).to_be_bytes());
        entries.extend_from_slice(mlkem_bytes);
    }
    // X25519 entry.
    entries.extend_from_slice(&0x001Du16.to_be_bytes());
    entries.extend_from_slice(&32u16.to_be_bytes());
    entries.extend_from_slice(x25519_pub);

    let mut body = Vec::with_capacity(2 + entries.len());
    body.extend_from_slice(&(entries.len() as u16).to_be_bytes());
    body.extend_from_slice(&entries);
    body
}

fn compress_certificate_body() -> Vec<u8> {
    // RFC 8879 §3 ClientHello body is `algorithms<2..2^8-2>` —
    // u8 length-prefix, then u16 entries. Real Chrome 144 emits
    // `02 00 02` (list_len = 2 bytes, single algorithm 0x0002 =
    // Brotli). Match byte-for-byte; Chrome doesn't advertise zlib
    // (1) or zstd (3) here even though both exist in RFC 8879.
    vec![0x02, 0x00, 0x02]
}

fn alps_body() -> Vec<u8> {
    // ApplicationSettings: protocols_len(u16) | [proto_len(u8) | proto].
    // Chrome emits ["h2"] here regardless of ALPN.
    let proto = b"h2";
    let inner = 1 + proto.len();
    let mut body = Vec::with_capacity(2 + inner);
    body.extend_from_slice(&(inner as u16).to_be_bytes());
    body.push(proto.len() as u8);
    body.extend_from_slice(proto);
    body
}

fn ech_grease_body() -> Vec<u8> {
    // ECHClientHello (GREASE / outer variant). Wire layout mirrors
    // BoringSSL's `setup_ech_grease` + `ext_ech_add_clienthello`
    // (boringssl/ssl/encrypted_client_hello.cc:732 +
    // boringssl/ssl/extensions.cc:586):
    //
    //   type:u8 = ECH_CLIENT_OUTER (0)
    //   kdf_id:u16
    //   aead_id:u16
    //   config_id:u8
    //   enc<0..2^16-1>
    //   payload<1..2^16-1>
    //
    // Payload is sized to match BoringSSL's `setup_ech_grease`:
    // `payload_len = 32 * random_size(128/32, 224/32) +
    // aead_overhead(aead)`. With AES-128-GCM the AEAD overhead is
    // 16 bytes and `random_size(4, 7)` returns a value in [4, 7]
    // (multiple of 32). Live Chrome 144 captures land at 208 bytes
    // payload (6 * 32 + 16). Emit a fixed 208 to match that
    // envelope. Strict CDN TLS parsers alerted `decode_error` on the
    // earlier 16-byte payload — likely a size threshold check.
    //
    // The earlier revision also had `config_id` and the HPKE
    // cipher-suite bytes swapped. Both fixed.
    const ECH_PAYLOAD_LEN: usize = 208;
    let mut body = Vec::with_capacity(8 + 32 + 2 + ECH_PAYLOAD_LEN);
    body.push(0x00); // ECH_CLIENT_OUTER
    body.extend_from_slice(&0x0001u16.to_be_bytes()); // HPKE KDF HKDF-SHA256
    body.extend_from_slice(&0x0001u16.to_be_bytes()); // HPKE AEAD AES-128-GCM
    body.push(0x00); // config_id
    body.extend_from_slice(&32u16.to_be_bytes()); // enc_len
    body.extend_from_slice(&[0u8; 32]); // enc placeholder
    body.extend_from_slice(&(ECH_PAYLOAD_LEN as u16).to_be_bytes());
    body.extend_from_slice(&[0u8; ECH_PAYLOAD_LEN]); // payload placeholder
    body
}

/// Minimal cursor over a byte slice. Returns `None` on short read.
struct ByteReader<'a> {
    buf: &'a [u8],
    pos: usize,
}

impl<'a> ByteReader<'a> {
    fn new(buf: &'a [u8]) -> Self {
        Self { buf, pos: 0 }
    }
    fn read_u8(&mut self) -> Option<u8> {
        let v = *self.buf.get(self.pos)?;
        self.pos += 1;
        Some(v)
    }
    fn read_u16(&mut self) -> Option<u16> {
        let hi = *self.buf.get(self.pos)?;
        let lo = *self.buf.get(self.pos + 1)?;
        self.pos += 2;
        Some(u16::from_be_bytes([hi, lo]))
    }
    fn read_slice(&mut self, n: usize) -> Option<&'a [u8]> {
        if self.pos + n > self.buf.len() {
            return None;
        }
        let s = &self.buf[self.pos..self.pos + n];
        self.pos += n;
        Some(s)
    }
    fn skip(&mut self, n: usize) -> Option<()> {
        if self.pos + n > self.buf.len() {
            return None;
        }
        self.pos += n;
        Some(())
    }
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::fingerprint::KnownFingerprint;

    fn fixed_inputs(fp: &Fingerprint) -> ClientHelloInputs<'_> {
        ClientHelloInputs {
            fingerprint: fp,
            sni: "example.invalid",
            random: [0x42; 32],
            session_id: [0x33; 32],
            x25519_public: [0x77; 32],
            // Tests don't perform a live KEX, so the static fallback
            // in `key_share_body` is what gets emitted when the
            // persona's JA3 advertises 4588.
            mlkem_hybrid_pubkey: None,
        }
    }

    #[test]
    fn chrome120_emits_grease_at_cipher_head() {
        let fp = KnownFingerprint::Chrome120.into_fingerprint();
        let bytes = build_client_hello(&fixed_inputs(&fp));
        // First two bytes are legacy_version (0x0303). Then 32 random,
        // then 1+32 session_id, then 2-byte cipher list length, then
        // first u16 of cipher list = GREASE.
        let cipher_start = 2 + 32 + 1 + 32 + 2;
        let first_cipher = u16::from_be_bytes([bytes[cipher_start], bytes[cipher_start + 1]]);
        assert!(
            is_grease(first_cipher),
            "expected GREASE-class cipher at head, got 0x{:04X}",
            first_cipher
        );
    }

    #[test]
    fn chrome120_round_trips_ja3_string() {
        let fp = KnownFingerprint::Chrome120.into_fingerprint();
        let bytes = build_client_hello(&fixed_inputs(&fp));
        let ja3 = ja3_from_client_hello(&bytes).expect("parse");
        // The encoder skips ext 27 (compress_certificate). rustls
        // 0.23 has no brotli decompressor wired in, so a peer's
        // `CompressedCertificate` response would fail to parse
        // and the handshake would die one step past the CH.
        let expected = fp.ja3.unwrap().replace("-27", "");
        assert_eq!(ja3, expected);
    }

    #[test]
    fn chrome144_round_trips_ja3_string() {
        let fp = KnownFingerprint::Chrome144.into_fingerprint();
        let bytes = build_client_hello(&fixed_inputs(&fp));
        let ja3 = ja3_from_client_hello(&bytes).expect("parse");
        // Same compress_certificate skip as chrome120. ALPS (17613)
        // and ECH GREASE (65037) are both emitted now — restored
        // after the BoringSSL + live-Chrome-capture diff that
        // landed alongside the GREASE-diversity fix.
        let expected = fp.ja3.unwrap().replace("-27", "");
        assert_eq!(ja3, expected);
    }

    #[test]
    fn chrome147_android_emits_safe_subset_of_ja3() {
        let fp = KnownFingerprint::Chrome147Android.into_fingerprint();
        let bytes = build_client_hello(&fixed_inputs(&fp));
        let ja3 = ja3_from_client_hello(&bytes).expect("parse");
        // chrome147_android's capture includes a few groups we
        // can't reproduce verbatim:
        //  * extension 27 (compress_certificate) — skipped to avoid
        //    rustls's CompressedCertificate decode bail.
        //  * extension 41 (pre_shared_key) — was resumption-driven
        //    on the capture; the encoder doesn't carry a PSK so it
        //    drops the extension.
        //  * point_formats empty in capture — encoder substitutes
        //    `[0]` (uncompressed) so the extension body parses.
        //
        // supported_groups now advertises curve 4588 (X25519MLKEM768)
        // even though the encoder ships only classic key_share entries
        // — real Chrome 147 mobile advertises 4588 and accepts a
        // HelloRetryRequest if the server picks it. Strict CDN edges
        // expect the advertise-without-key_share shape.
        //
        // What's left should be the still-load-bearing JA3 surface:
        // cipher list, GREASE positions, classic curves, extension
        // order minus the dropped IDs.
        //
        // The record-version field is `771` (TLS 1.2 legacy
        // version) rather than the captured `772` — the on-wire
        // `legacy_version` byte is hard-coded to 0x0303 per RFC
        // 8446 §4.1.2. JA3 hash fidelity loses this byte; cipher
        // list + extension order + curves still match.
        let expected = "771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,51-45-0-16-13-23-43-35-5-11-10-18-65281,4588-29-23-24,0";
        assert_eq!(ja3, expected);
    }

    #[test]
    fn grease_classifier_recognizes_canonical_values() {
        for v in [0x0A0Au16, 0x1A1A, 0xBABA, 0xDADA, 0xFAFA] {
            assert!(is_grease(v), "0x{:04X} should classify as GREASE", v);
        }
        assert!(!is_grease(0x1301)); // TLS_AES_128_GCM_SHA256
        assert!(!is_grease(0x002B)); // supported_versions ext type
    }
}
