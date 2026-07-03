//! JA3-hash + JA4 fingerprint builders.
//!
//! This module sits next to [`crate::handshake_shim`], which already
//! knows how to turn a raw ClientHello into the classic JA3 *string*
//! (`version,ciphers,extensions,curves,formats`) via
//! [`crate::handshake_shim::ja3_from_client_hello`]. What was missing —
//! and what this module adds — is:
//!
//! * [`ja3_hash`] — the MD5 of a JA3 string (JA3 is defined as that MD5,
//!   not the cleartext string).
//! * [`ja4`] — the FoxIO JA4 fingerprint
//!   (<https://github.com/FoxIO-LLC/ja4/blob/main/technical_details/JA4.md>),
//!   computed from a parsed ClientHello.
//!
//! Both are driven from the *raw* ClientHello bytes (the same bytes the
//! inbound tlsd listener tees off the socket before completing the
//! rustls handshake), so wire-order / GREASE handling matches what a
//! passive observer would compute. The shared low-level parser lives in
//! [`parse_client_hello`].
//!
//! ## JA4 spec shortcuts (documented for the reviewer)
//!
//! * The transport nibble (`q`/`t`) is supplied by the caller — this
//!   parser only sees the TLS ClientHello, not whether it arrived over
//!   QUIC or TCP. tlsd terminates TLS-over-TCP, so the listener passes
//!   `Ja4Transport::Tcp`.
//! * The TLS version is taken from the `supported_versions` extension
//!   (max non-GREASE value) when present, else the record/legacy
//!   `client_version`, per the JA4 spec.
//! * SNI presence (`d`/`i`) keys off the `server_name` (0) extension
//!   being present, not whether the name is a hostname vs an IP. The
//!   spec says `i` when SNI is absent OR the destination is an IP; we
//!   only have the ClientHello here, so we can't tell "IP destination"
//!   apart — we report `d` whenever a `server_name` extension is
//!   present. Noted as a known gap.
//! * ALPN: first ALPN value's first+last byte per the spec's `ab`
//!   rule; `00` when no ALPN extension.

// `Digest` provides the `digest()` associated fn used below; both md5
// and sha2 re-export the same trait, so importing it once from sha2 is
// enough for `Md5::digest` and `Sha256::digest` alike.
use md5::Md5;
use sha2::{Digest as _, Sha256};

/// Whether `id` is one of the 16 GREASE values (RFC 8701). Kept local
/// so this module doesn't depend on `handshake_shim`'s private helper.
fn is_grease(id: u16) -> bool {
    (id & 0x0F0F) == 0x0A0A && (id >> 8) == (id & 0xFF)
}

/// Transport the ClientHello arrived over. JA4's leading nibble is
/// `q` for QUIC and `t` for TCP; the ClientHello bytes alone don't
/// carry this, so the caller supplies it.
#[derive(Clone, Copy, Debug, PartialEq, Eq)]
pub enum Ja4Transport {
    Tcp,
    Quic,
}

impl Ja4Transport {
    fn nibble(self) -> char {
        match self {
            Ja4Transport::Tcp => 't',
            Ja4Transport::Quic => 'q',
        }
    }
}

/// Structured view of the fields JA3/JA4 need out of a ClientHello,
/// parsed in wire order with GREASE preserved (callers strip GREASE
/// where the relevant spec requires it).
#[derive(Clone, Debug, Default)]
pub struct ClientHelloSummary {
    /// `legacy_version` field from the ClientHello body.
    pub legacy_version: u16,
    /// Highest non-GREASE value advertised in `supported_versions`
    /// (ext 43), if that extension was present.
    pub supported_versions_max: Option<u16>,
    /// Cipher suites in wire order (GREASE included).
    pub cipher_suites: Vec<u16>,
    /// Extension types in wire order (GREASE included).
    pub extensions: Vec<u16>,
    /// `supported_groups` / `elliptic_curves` (ext 10), GREASE stripped.
    pub curves: Vec<u16>,
    /// `ec_point_formats` (ext 11).
    pub point_formats: Vec<u8>,
    /// `signature_algorithms` (ext 13), in wire order (GREASE stripped).
    pub sig_algs: Vec<u16>,
    /// ALPN protocol ids (ext 16), in wire order.
    pub alpn: Vec<Vec<u8>>,
    /// Whether a `server_name` (ext 0) extension was present.
    pub has_sni: bool,
}

struct Reader<'a> {
    b: &'a [u8],
    pos: usize,
}

impl<'a> Reader<'a> {
    fn new(b: &'a [u8]) -> Self {
        Self { b, pos: 0 }
    }
    fn u8(&mut self) -> Option<u8> {
        let v = *self.b.get(self.pos)?;
        self.pos += 1;
        Some(v)
    }
    fn u16(&mut self) -> Option<u16> {
        let hi = self.u8()? as u16;
        let lo = self.u8()? as u16;
        Some((hi << 8) | lo)
    }
    fn skip(&mut self, n: usize) -> Option<()> {
        if self.pos + n > self.b.len() {
            return None;
        }
        self.pos += n;
        Some(())
    }
    fn slice(&mut self, n: usize) -> Option<&'a [u8]> {
        if self.pos + n > self.b.len() {
            return None;
        }
        let s = &self.b[self.pos..self.pos + n];
        self.pos += n;
        Some(s)
    }
}

/// Parse a raw ClientHello *body* (starting at `legacy_version`, i.e.
/// the same byte offset [`crate::handshake_shim::ja3_from_client_hello`]
/// expects — NOT including the handshake-message or record headers)
/// into a [`ClientHelloSummary`]. Returns `None` on a malformed body.
pub fn parse_client_hello(bytes: &[u8]) -> Option<ClientHelloSummary> {
    let mut r = Reader::new(bytes);
    let mut out = ClientHelloSummary {
        legacy_version: r.u16()?,
        ..Default::default()
    };
    r.skip(32)?; // random
    let sid_len = r.u8()? as usize;
    r.skip(sid_len)?;
    let cipher_len = r.u16()? as usize;
    let mut consumed = 0;
    while consumed < cipher_len {
        out.cipher_suites.push(r.u16()?);
        consumed += 2;
    }
    let comp_len = r.u8()? as usize;
    r.skip(comp_len)?;
    // Extensions are optional (TLS 1.0/1.1 CH may omit the block).
    let ext_total = match r.u16() {
        Some(v) => v as usize,
        None => return Some(out),
    };
    let mut ext_consumed = 0;
    while ext_consumed < ext_total {
        let etype = r.u16()?;
        let elen = r.u16()? as usize;
        let ebody = r.slice(elen)?;
        ext_consumed += 4 + elen;
        out.extensions.push(etype);
        match etype {
            0 => out.has_sni = true,
            10 => {
                // supported_groups: u16 inner length then u16 entries.
                if ebody.len() >= 2 {
                    let inner = u16::from_be_bytes([ebody[0], ebody[1]]) as usize;
                    let mut i = 0;
                    while i + 2 <= inner && 2 + i + 2 <= ebody.len() {
                        let g = u16::from_be_bytes([ebody[2 + i], ebody[3 + i]]);
                        if !is_grease(g) {
                            out.curves.push(g);
                        }
                        i += 2;
                    }
                }
            }
            11 => {
                // ec_point_formats: u8 inner length then u8 entries.
                if !ebody.is_empty() {
                    let inner = ebody[0] as usize;
                    for i in 0..inner.min(ebody.len().saturating_sub(1)) {
                        out.point_formats.push(ebody[1 + i]);
                    }
                }
            }
            13 => {
                // signature_algorithms: u16 inner length then u16 entries.
                if ebody.len() >= 2 {
                    let inner = u16::from_be_bytes([ebody[0], ebody[1]]) as usize;
                    let mut i = 0;
                    while i + 2 <= inner && 2 + i + 2 <= ebody.len() {
                        let s = u16::from_be_bytes([ebody[2 + i], ebody[3 + i]]);
                        if !is_grease(s) {
                            out.sig_algs.push(s);
                        }
                        i += 2;
                    }
                }
            }
            16 => {
                // ALPN: u16 list length then [u8 len || bytes]*.
                if ebody.len() >= 2 {
                    let inner = u16::from_be_bytes([ebody[0], ebody[1]]) as usize;
                    let mut i = 2;
                    while i < 2 + inner && i < ebody.len() {
                        let plen = ebody[i] as usize;
                        i += 1;
                        if i + plen > ebody.len() {
                            break;
                        }
                        out.alpn.push(ebody[i..i + plen].to_vec());
                        i += plen;
                    }
                }
            }
            43 => {
                // supported_versions: u8 inner length then u16 entries.
                if !ebody.is_empty() {
                    let inner = ebody[0] as usize;
                    let mut best: Option<u16> = None;
                    let mut i = 0;
                    while i + 2 <= inner && 1 + i + 2 <= ebody.len() {
                        let v = u16::from_be_bytes([ebody[1 + i], ebody[2 + i]]);
                        if !is_grease(v) {
                            best = Some(best.map_or(v, |b| b.max(v)));
                        }
                        i += 2;
                    }
                    out.supported_versions_max = best;
                }
            }
            _ => {}
        }
    }
    Some(out)
}

/// JA3 hash: the MD5 (lowercase hex) of a JA3 string. JA3 is *defined*
/// as this MD5 — the cleartext `version,ciphers,...` form is the
/// pre-image. Pass the output of
/// [`crate::handshake_shim::ja3_from_client_hello`].
pub fn ja3_hash(ja3_string: &str) -> String {
    let digest = Md5::digest(ja3_string.as_bytes());
    hex_lower(&digest)
}

/// Map a TLS version u16 to JA4's 2-char code. Per the FoxIO spec:
/// 1.3→`13`, 1.2→`12`, 1.1→`11`, 1.0→`10`, SSL3→`s3`, SSL2→`s2`,
/// anything else→`00`.
fn ja4_version(v: u16) -> &'static str {
    match v {
        0x0304 => "13",
        0x0303 => "12",
        0x0302 => "11",
        0x0301 => "10",
        0x0300 => "s3",
        0x0002 => "s2",
        _ => "00",
    }
}

/// Build the JA4 fingerprint from a parsed ClientHello.
///
/// Shape: `<a>_<b>_<c>` where
/// * `a` = transport nibble + 2-char TLS version + SNI flag + 2-digit
///   cipher count + 2-digit extension count + first-ALPN 2 chars.
/// * `b` = 12 hex chars: first 6 bytes of SHA-256 of the sorted,
///   GREASE-stripped cipher list (lowercase 4-hex each, comma-joined).
/// * `c` = 12 hex chars: first 6 bytes of SHA-256 of the sorted,
///   GREASE-stripped extension list (SNI=0 and ALPN=16 excluded per
///   spec) comma-joined, then `_`-joined with the (wire-order,
///   GREASE-stripped) signature-algorithm list.
///
/// When the cipher list is empty, `b` is the 12-char all-zero string
/// `000000000000` (FoxIO convention); same for `c` when there are no
/// extensions and no signature algorithms.
pub fn ja4(summary: &ClientHelloSummary, transport: Ja4Transport) -> String {
    // --- version ---
    let ver = summary
        .supported_versions_max
        .unwrap_or(summary.legacy_version);
    let ver_str = ja4_version(ver);

    // --- SNI flag ---
    let sni = if summary.has_sni { 'd' } else { 'i' };

    // --- counts (GREASE stripped, clamped to 2 digits / 99) ---
    let ciphers: Vec<u16> = summary
        .cipher_suites
        .iter()
        .copied()
        .filter(|c| !is_grease(*c))
        .collect();
    let exts_all: Vec<u16> = summary
        .extensions
        .iter()
        .copied()
        .filter(|e| !is_grease(*e))
        .collect();
    let cipher_count = ciphers.len().min(99);
    // Extension COUNT in `a` includes SNI + ALPN (spec counts all
    // non-GREASE extensions); only the hash in `c` excludes 0 and 16.
    let ext_count = exts_all.len().min(99);

    // --- first ALPN 2 chars ---
    let alpn_chars = first_alpn_chars(summary);

    let a = format!(
        "{}{}{}{:02}{:02}{}",
        transport.nibble(),
        ver_str,
        sni,
        cipher_count,
        ext_count,
        alpn_chars,
    );

    // --- b: sorted cipher hash ---
    let mut sorted_ciphers = ciphers.clone();
    sorted_ciphers.sort_unstable();
    let cipher_str = sorted_ciphers
        .iter()
        .map(|c| format!("{c:04x}"))
        .collect::<Vec<_>>()
        .join(",");
    let b = if sorted_ciphers.is_empty() {
        "000000000000".to_string()
    } else {
        sha256_trunc12(cipher_str.as_bytes())
    };

    // --- c: sorted extensions (excluding 0 + 16) joined with sig algs ---
    let mut sorted_exts: Vec<u16> = exts_all
        .iter()
        .copied()
        .filter(|e| *e != 0x0000 && *e != 0x0010)
        .collect();
    sorted_exts.sort_unstable();
    let ext_str = sorted_exts
        .iter()
        .map(|e| format!("{e:04x}"))
        .collect::<Vec<_>>()
        .join(",");
    let sig_str = summary
        .sig_algs
        .iter()
        .map(|s| format!("{s:04x}"))
        .collect::<Vec<_>>()
        .join(",");
    let c = if sorted_exts.is_empty() && summary.sig_algs.is_empty() {
        "000000000000".to_string()
    } else if summary.sig_algs.is_empty() {
        sha256_trunc12(ext_str.as_bytes())
    } else {
        // FoxIO joins the extension list and the sig-alg list with `_`
        // before hashing.
        let combined = format!("{ext_str}_{sig_str}");
        sha256_trunc12(combined.as_bytes())
    };

    format!("{a}_{b}_{c}")
}

/// Convenience: parse raw ClientHello body bytes and compute JA4. Returns
/// `None` if the bytes don't parse as a ClientHello.
pub fn ja4_from_client_hello(bytes: &[u8], transport: Ja4Transport) -> Option<String> {
    parse_client_hello(bytes).map(|s| ja4(&s, transport))
}

/// First-ALPN 2-char code per JA4: first byte + last byte of the first
/// ALPN protocol id, ASCII. `00` when ALPN is absent. Non-alphanumeric
/// bytes are mapped to their low-nibble hex digit to keep the 2-char
/// width (good enough for h2 / http/1.1, the only ALPNs tlsd sees).
fn first_alpn_chars(summary: &ClientHelloSummary) -> String {
    match summary.alpn.first() {
        None => "00".to_string(),
        Some(p) if p.is_empty() => "00".to_string(),
        Some(p) => {
            let first = p[0];
            let last = p[p.len() - 1];
            let mut s = String::new();
            push_alpn_char(&mut s, first);
            push_alpn_char(&mut s, last);
            s
        }
    }
}

fn push_alpn_char(out: &mut String, b: u8) {
    if b.is_ascii_alphanumeric() {
        out.push(b as char);
    } else {
        out.push(char::from_digit((b & 0x0f) as u32, 16).unwrap_or('0'));
    }
}

fn sha256_trunc12(data: &[u8]) -> String {
    let digest = Sha256::digest(data);
    // First 6 bytes -> 12 lowercase hex chars.
    hex_lower(&digest[..6])
}

fn hex_lower(bytes: &[u8]) -> String {
    let mut s = String::with_capacity(bytes.len() * 2);
    for b in bytes {
        s.push(char::from_digit((b >> 4) as u32, 16).unwrap());
        s.push(char::from_digit((b & 0x0f) as u32, 16).unwrap());
    }
    s
}

#[cfg(test)]
mod tests {
    use super::*;
    use crate::handshake_shim::ja3_from_client_hello;

    /// A minimal but well-formed TLS 1.3 ClientHello *body* (starting at
    /// `legacy_version`) built by hand so we control every field. Used
    /// to assert JA4 field-shape invariants. This is NOT an
    /// authoritative captured-Chrome vector — see the note below.
    fn synthetic_hello() -> Vec<u8> {
        let mut out = Vec::new();
        // legacy_version = 0x0303 (TLS 1.2 on the record, real version
        // in supported_versions).
        out.extend_from_slice(&[0x03, 0x03]);
        out.extend_from_slice(&[0u8; 32]); // random
        out.push(0); // session id len = 0
        // cipher suites: GREASE, TLS_AES_128_GCM_SHA256 (0x1301),
        // TLS_AES_256_GCM_SHA384 (0x1302).
        let ciphers: [u16; 3] = [0x0a0a, 0x1301, 0x1302];
        out.extend_from_slice(&((ciphers.len() * 2) as u16).to_be_bytes());
        for c in ciphers {
            out.extend_from_slice(&c.to_be_bytes());
        }
        out.push(1); // compression methods len
        out.push(0); // null compression

        // Extensions.
        let mut ext = Vec::new();
        // server_name (0): one host "a".
        {
            let host = b"a";
            let mut body = Vec::new();
            let sni_entry_len = 3 + host.len();
            body.extend_from_slice(&(sni_entry_len as u16).to_be_bytes());
            body.push(0); // name_type host_name
            body.extend_from_slice(&(host.len() as u16).to_be_bytes());
            body.extend_from_slice(host);
            push_ext(&mut ext, 0, &body);
        }
        // supported_groups (10): GREASE + X25519 (0x001d).
        {
            let groups: [u16; 2] = [0x0a0a, 0x001d];
            let mut body = Vec::new();
            body.extend_from_slice(&((groups.len() * 2) as u16).to_be_bytes());
            for g in groups {
                body.extend_from_slice(&g.to_be_bytes());
            }
            push_ext(&mut ext, 10, &body);
        }
        // signature_algorithms (13): ecdsa_secp256r1_sha256 (0x0403),
        // rsa_pss_rsae_sha256 (0x0804).
        {
            let algs: [u16; 2] = [0x0403, 0x0804];
            let mut body = Vec::new();
            body.extend_from_slice(&((algs.len() * 2) as u16).to_be_bytes());
            for a in algs {
                body.extend_from_slice(&a.to_be_bytes());
            }
            push_ext(&mut ext, 13, &body);
        }
        // ALPN (16): "h2", "http/1.1".
        {
            let protos: [&[u8]; 2] = [b"h2", b"http/1.1"];
            let mut list = Vec::new();
            for p in protos {
                list.push(p.len() as u8);
                list.extend_from_slice(p);
            }
            let mut body = Vec::new();
            body.extend_from_slice(&(list.len() as u16).to_be_bytes());
            body.extend_from_slice(&list);
            push_ext(&mut ext, 16, &body);
        }
        // supported_versions (43): GREASE + TLS 1.3 (0x0304).
        {
            let vers: [u16; 2] = [0x0a0a, 0x0304];
            let mut body = Vec::new();
            body.push((vers.len() * 2) as u8);
            for v in vers {
                body.extend_from_slice(&v.to_be_bytes());
            }
            push_ext(&mut ext, 43, &body);
        }

        out.extend_from_slice(&(ext.len() as u16).to_be_bytes());
        out.extend_from_slice(&ext);
        out
    }

    fn push_ext(out: &mut Vec<u8>, etype: u16, body: &[u8]) {
        out.extend_from_slice(&etype.to_be_bytes());
        out.extend_from_slice(&(body.len() as u16).to_be_bytes());
        out.extend_from_slice(body);
    }

    #[test]
    fn ja3_hash_is_md5_of_string() {
        let s = "771,4865-4866,0-10,29,0";
        let h = ja3_hash(s);
        assert_eq!(h.len(), 32, "JA3 hash is 32 hex chars (MD5)");
        assert!(h.chars().all(|c| c.is_ascii_hexdigit() && !c.is_ascii_uppercase()));
        // Recompute independently.
        let expect = {
            let d = Md5::digest(s.as_bytes());
            super::hex_lower(&d)
        };
        assert_eq!(h, expect);
    }

    #[test]
    fn ja3_string_roundtrips_through_parser() {
        let body = synthetic_hello();
        let ja3 = ja3_from_client_hello(&body).expect("ja3 parse");
        // version 771, ciphers 4865-4866 (GREASE 0x0a0a stripped),
        // extensions 0-10-13-16-43 (no GREASE ext here), curves 29,
        // formats empty.
        assert_eq!(ja3, "771,4865-4866,0-10-13-16-43,29,");
    }

    #[test]
    fn ja4_field_shape_invariants() {
        let body = synthetic_hello();
        let s = parse_client_hello(&body).expect("parse");
        let j = ja4(&s, Ja4Transport::Tcp);
        // Overall shape: a_b_c with b and c each 12 hex chars.
        let parts: Vec<&str> = j.split('_').collect();
        assert_eq!(parts.len(), 3, "JA4 has three underscore-joined parts: {j}");
        let (a, b, c) = (parts[0], parts[1], parts[2]);

        // a: t (TCP) + 13 (TLS1.3 from supported_versions) + d (SNI) +
        // 02 (2 ciphers after GREASE) + 05 (5 exts after GREASE) +
        // "h2" (first ALPN first+last char = 'h','2').
        assert_eq!(a, "t13d0205h2", "JA4_a unexpected: {a}");

        assert_eq!(b.len(), 12, "JA4_b is 12 hex chars: {b}");
        assert_eq!(c.len(), 12, "JA4_c is 12 hex chars: {c}");
        assert!(b.chars().all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase()));
        assert!(c.chars().all(|ch| ch.is_ascii_hexdigit() && !ch.is_ascii_uppercase()));

        // b is deterministic: sha256("1301,1302")[..6] hex.
        let expect_b = sha256_trunc12(b"1301,1302");
        assert_eq!(b, expect_b);

        // c is deterministic: extensions after dropping GREASE, SNI(0),
        // ALPN(16): 10,13,43 sorted -> 000a,000d,002b; sig algs in wire
        // order: 0403,0804. Joined with `_`.
        let expect_c = sha256_trunc12(b"000a,000d,002b_0403,0804");
        assert_eq!(c, expect_c);
    }

    #[test]
    fn ja4_no_alpn_no_sni() {
        // A hello with no SNI, no ALPN, no extensions.
        let mut out = Vec::new();
        out.extend_from_slice(&[0x03, 0x03]);
        out.extend_from_slice(&[0u8; 32]);
        out.push(0);
        let ciphers: [u16; 1] = [0x1301];
        out.extend_from_slice(&((ciphers.len() * 2) as u16).to_be_bytes());
        for ci in ciphers {
            out.extend_from_slice(&ci.to_be_bytes());
        }
        out.push(1);
        out.push(0);
        out.extend_from_slice(&0u16.to_be_bytes()); // no extensions
        let s = parse_client_hello(&out).expect("parse");
        let j = ja4(&s, Ja4Transport::Tcp);
        // t + 12 (legacy version, no supported_versions) + i (no SNI) +
        // 01 cipher + 00 exts + 00 alpn.
        assert!(j.starts_with("t12i0100"), "unexpected: {j}");
        // c is all-zero (no exts, no sig algs).
        let parts: Vec<&str> = j.split('_').collect();
        assert_eq!(parts[2], "000000000000");
    }
}
