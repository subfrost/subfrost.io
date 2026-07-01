//! TLS ClientHello fingerprint customization layer.
//!
//! ## What this gives you
//!
//! - **Cipher suite list + ordering**: configurable via a custom rustls
//!   `CryptoProvider`. This is the part of JA3 we can fully control with
//!   pure Rust today.
//! - **ALPN protocol list + ordering**: configurable via `ClientConfig`.
//! - **TLS version pinning**: configurable via the protocol version list.
//! - **Pre-canned profiles** for OkHttp 5, Chrome 120, Firefox 120,
//!   Safari iOS 17.
//!
//! ## What this also gives you (Phase 2b â May 2026)
//!
//! - **Parsed JA3 extension / curves / point-formats lists** on
//!   [`Fingerprint`]. The JA3 string is split into all five fields at
//!   construction (or on-demand via [`Fingerprint::parse_ja3`]) so
//!   downstream code can build a ClientHello with extensions in the
//!   persona's exact wire order.
//! - **Chrome-canonical extension data** via
//!   [`Fingerprint::chrome_signature_algorithms`],
//!   [`Fingerprint::chrome_supported_versions`], and
//!   [`Fingerprint::chrome_grease_value`]. These are the static lists
//!   real Chrome 120-144 emits (the algorithm/version ordering inside
//!   each extension is stable across this version range; the *outer*
//!   extension list is what's randomized).
//! - **A ClientHello byte-encoder** in [`crate::handshake_shim`] that
//!   produces a complete Chrome-shaped ClientHello â GREASE-injected,
//!   extensions in persona order, sig_algs/key_share/supported_versions
//!   each Chrome-shaped. The shim is used by the regression test
//!   (`tests/clienthello_bytes.rs`) to prove our wire bytes hash to the
//!   persona's stored JA3.
//!
//! ## What this does NOT give you (yet)
//!
//! - **Live injection into rustls's state machine**. rustls 0.23
//!   computes its own ClientHello hash and threads it into the Finished
//!   verification â so you cannot just intercept rustls's first write
//!   and substitute the shim bytes without also patching rustls's
//!   transcript. The shim is therefore consumed by the regression test
//!   today; live use will land alongside a vendored `rustls-tlsfetch`
//!   that accepts an externally-built ClientHello.
//!
//! See <https://github.com/refraction-networking/utls> for the Go
//! reference implementation we're modeling.

use std::sync::Arc;

use rustls::crypto::CryptoProvider;
use rustls::SupportedCipherSuite;
use serde::{Deserialize, Serialize};

/// A target TLS fingerprint to impersonate. Controls cipher suite
/// list + ordering and ALPN list + ordering (live, via
/// [`Fingerprint::build_provider`]); and surfaces the JA3-parsed
/// extension / curve / point-format ordering for the
/// [`crate::handshake_shim`] ClientHello encoder used by the
/// regression test.
#[derive(Debug, Clone, Serialize, Deserialize)]
pub struct Fingerprint {
    pub name: String,
    /// Raw JA3 string in `version,ciphers,extensions,curves,formats`
    /// format. The `ciphers` field is honored live via
    /// [`Fingerprint::build_provider`]; `extensions`, `curves` and
    /// `formats` are honored by the `handshake_shim` ClientHello
    /// encoder.
    pub ja3: Option<String>,
    /// JA4 raw fingerprint string (e.g. `t13d1516h2_8daaf6152771_â¦`).
    /// Stored for downstream JA4 scorers; not consumed inside
    /// `tlsfetch-common` directly today.
    pub ja4r: Option<String>,
    /// ALPN protocol identifiers in preference order.
    pub alpn: Vec<Vec<u8>>,
}

/// Result of parsing a JA3 string into its five typed fields. All
/// numeric IDs are kept in their wire (big-endian) form â no GREASE
/// is injected here, because canonical JA3 strings already have
/// GREASE values stripped (per the JA3 spec). The handshake-shim
/// re-injects GREASE at fixed positions when emitting the wire bytes.
#[derive(Debug, Clone, PartialEq, Eq)]
pub struct ParsedJa3 {
    /// TLS protocol version (e.g. `771` = TLS 1.2 record-layer, which
    /// is also what Chrome emits even for TLS 1.3 handshakes).
    pub version: u16,
    /// Cipher-suite IDs in ClientHello order.
    pub ciphers: Vec<u16>,
    /// Extension type IDs in ClientHello order.
    pub extensions: Vec<u16>,
    /// Named-group / supported-curves IDs in ClientHello order.
    pub curves: Vec<u16>,
    /// EC point-format IDs (TLS 1.2-only extension; Chrome still
    /// emits `[0]`).
    pub point_formats: Vec<u8>,
}

impl ParsedJa3 {
    /// Parse a JA3 string. Returns `None` if the string doesn't have
    /// exactly five comma-separated fields or the version field
    /// doesn't parse.
    pub fn from_str(s: &str) -> Option<Self> {
        let fields: Vec<&str> = s.split(',').collect();
        if fields.len() != 5 {
            return None;
        }
        let version: u16 = fields[0].parse().ok()?;
        let parse_u16 = |f: &str| -> Vec<u16> {
            if f.is_empty() {
                return Vec::new();
            }
            f.split('-').filter_map(|x| x.parse().ok()).collect()
        };
        let parse_u8 = |f: &str| -> Vec<u8> {
            if f.is_empty() {
                return Vec::new();
            }
            f.split('-').filter_map(|x| x.parse().ok()).collect()
        };
        Some(ParsedJa3 {
            version,
            ciphers: parse_u16(fields[1]),
            extensions: parse_u16(fields[2]),
            curves: parse_u16(fields[3]),
            point_formats: parse_u8(fields[4]),
        })
    }
}

/// Pre-canned fingerprints for common Android / iOS / browser builds.
#[derive(Debug, Clone, Copy, PartialEq, Eq, Serialize, Deserialize)]
pub enum KnownFingerprint {
    /// OkHttp 5 (used by most modern Android apps).
    OkHttp5,
    /// Chrome 120 desktop.
    Chrome120,
    /// Chrome 144 desktop (Linux X11). Cipher list is identical to
    /// Chrome120 â Chrome's TLS 1.3 cipher set is stable across 120-144
    /// â but the extension list adds `17613` (encrypted-client-hello)
    /// and `65037` (ECH GREASE) and the JA4r is filled in. See the
    /// chrome144_linux.divergences.md fixture for capture details.
    Chrome144,
    /// Chrome 147 on Android 10 mobile. Real-device capture. Cipher
    /// list matches Chrome 120/144 desktop verbatim. Extension list
    /// is reordered relative to desktop (51-45-0-27-16-â¦ leads,
    /// with extension 41 (pre_shared_key) at the tail), and the
    /// supported_groups list carries the post-quantum hybrid group
    /// X25519MLKEM768 (`0x11EC = 4588`) at the head â Chrome enables
    /// the hybrid by default on Android since Chrome 144+.
    Chrome147Android,
    /// Firefox 120 desktop.
    Firefox120,
    /// Safari on iOS 17.
    SafariIOS17,
    /// Python httpx 0.27 (OpenSSL DEFAULT_CIPHERS) — the "vanilla
    /// unsophisticated client" tier. Cipher list mirrors what CPython’s `ssl` module
    /// negotiates by default; ALPN is http/1.1 only because httpx
    /// doesn't enable h2 unless explicitly asked.
    PythonHttpx,
}

impl KnownFingerprint {
    /// Look up a fingerprint by lowercase name. Used by the CLI's
    /// `--fingerprint <NAME>` flag.
    pub fn from_name(name: &str) -> Option<Self> {
        match name.to_ascii_lowercase().as_str() {
            "okhttp5" | "okhttp-5" | "okhttp_5" => Some(Self::OkHttp5),
            "chrome120" | "chrome-120" | "chrome_120" => Some(Self::Chrome120),
            "chrome144" | "chrome-144" | "chrome_144" => Some(Self::Chrome144),
            "chrome147_android" | "chrome147-android" | "chrome147android" => {
                Some(Self::Chrome147Android)
            }
            "firefox120" | "firefox-120" | "firefox_120" => Some(Self::Firefox120),
            "safari_ios17" | "safari-ios-17" | "safari_ios_17" | "ios17" => {
                Some(Self::SafariIOS17)
            }
            "python_httpx" | "python-httpx" | "httpx" | "pythonhttpx" => {
                Some(Self::PythonHttpx)
            }
        _ => None,
        }
    }

    pub fn into_fingerprint(self) -> Fingerprint {
        match self {
            KnownFingerprint::OkHttp5 => Fingerprint {
                name: "okhttp5".to_string(),
                ja3: Some("771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27,29-23-24,0".to_string()),
                ja4r: None,
                alpn: vec![b"http/1.1".to_vec()],
            },
            KnownFingerprint::Chrome120 => Fingerprint {
                name: "chrome120".to_string(),
                ja3: Some("771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-13-18-51-45-43-27-17513,29-23-24,0".to_string()),
                // JA4r for Chrome 120-144 desktop. Captured from real
                // Chrome's ClientHello via fluxzy + lwthiker's JA4
                // calculator. JA4 sort-canonicalization makes
                // Chromium 120-144 indistinguishable on this surface.
                ja4r: Some(
                    "t13d1516h2_8daaf6152771_b0da82dd1658"
                        .to_string(),
                ),
                alpn: vec![b"h2".to_vec(), b"http/1.1".to_vec()],
            },
            // Chrome 144 desktop (Linux X11). JA3 string is the
            // canonical wire-order, GREASE-stripped form from a live
            // pcap capture (computed by tshark on the real
            // ClientHello); the fixture lives in
            // `tlsfetch-emulation/tests/fixtures/personas/chrome144_linux.json`.
            //
            // The previous JA3 here had extensions sorted ascending
            // and listed `17513` (ALPS). That sorted order is what
            // fingerprint *parsers* canonicalize to â not what Chrome
            // actually emits on the wire. Strict CDN TLS edges
            // alerted `decode_error` on the byte-shim's output because
            // the extension wire order didn't match a real Chrome
            // client. The corrected wire order is
            // `51, 18, 27, 13, 23, 0, 5, 10, 65037, 11, 16, 45, 17613,
            // 35, 65281, 43`; ALPS is NOT in real Chrome 144 (only in
            // Chromium dev builds with a flag set).
            //
            // Supported_groups now also includes `4588` (X25519MLKEM768).
            // Real Chrome 144 advertises it; the shim still emits only
            // an X25519 key_share entry â 1216 bytes of ML-KEM payload
            // would need a real keypair the shim doesn't carry. Chrome
            // accepts a HelloRetryRequest if the server insists.
            KnownFingerprint::Chrome144 => Fingerprint {
                name: "chrome144".to_string(),
                // supported_groups now advertises X25519MLKEM768
                // (4588). The encoder's key_share entry is populated
                // by a real ML-KEM 768 + X25519 hybrid keypair
                // generated through the
                // [`crate::x25519_mlkem768::X25519MLKEM768`]
                // SupportedKxGroup that `build_provider()` registers
                // â so a server that picks 4588 can complete the
                // handshake. Sucuri-class WAFs require this group
                // in the advertisement; without it they alert
                // `illegal_parameter` (TLS alert 47).
                ja3: Some("771,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,51-18-27-13-23-0-5-10-65037-11-16-45-17613-35-65281-43,4588-29-23-24,0".to_string()),
                ja4r: Some(
                    "t13d1516h2_8daaf6152771_d8a2da3f94cd"
                        .to_string(),
                ),
                alpn: vec![b"h2".to_vec(), b"http/1.1".to_vec()],
            },
            // Chrome 147 on Android 10 mobile â real-device capture.
            // Cipher list matches Chrome 120/144 desktop verbatim.
            // Extension list is reordered relative to desktop
            // (51-45-0-27-16-â¦ leads, 41 (pre_shared_key) at the
            // tail). supported_groups carries the post-quantum
            // hybrid group X25519MLKEM768 (`0x11EC = 4588`) at the
            // head â Chrome enables the hybrid by default on
            // Android since 144+. point_formats is empty (the
            // TLS-1.2-only extension is dropped on Android Chrome's
            // TLS-1.3-first handshakes).
            //
            // Version field is `772` rather than `771` â Android
            // Chrome reports the negotiated TLS 1.3 version in the
            // JA3 record version field instead of the legacy TLS
            // 1.2 value desktop Chrome uses. The handshake_shim
            // honors this for hash-fidelity, even though the actual
            // wire `legacy_version` byte stays 0x0303 (spec
            // requirement).
            KnownFingerprint::Chrome147Android => Fingerprint {
                name: "chrome147_android".to_string(),
                ja3: Some(
                    "772,4865-4866-4867-49195-49199-49196-49200-52393-52392-49171-49172-156-157-47-53,51-45-0-27-16-13-23-43-35-5-11-10-18-65281-41,4588-29-23-24,".to_string()
                ),
                // JA4r not in the capture source. Downstream JA4
                // scorers fall back to JA3 when this is None.
                ja4r: None,
                alpn: vec![b"h2".to_vec(), b"http/1.1".to_vec()],
            },
            KnownFingerprint::Firefox120 => Fingerprint {
                name: "firefox120".to_string(),
                ja3: Some("771,4865-4867-4866-49195-49199-52393-52392-49196-49200-49162-49161-49171-49172-156-157-47-53,0-23-65281-10-11-35-16-5-34-51-43-13-45-28-65037,29-23-24-25-256-257,0".to_string()),
                ja4r: None,
                alpn: vec![b"h2".to_vec(), b"http/1.1".to_vec()],
            },
            KnownFingerprint::SafariIOS17 => Fingerprint {
                name: "safari_ios17".to_string(),
                ja3: Some("771,4865-4866-4867-49196-49195-52393-49200-49199-52392-49162-49161-49172-49171-157-156-53-47,0-23-65281-10-11-16-5-13-18-51-45-43-27,29-23-24-25,0".to_string()),
                ja4r: None,
                alpn: vec![b"h2".to_vec(), b"http/1.1".to_vec()],
            },
            // CPython `ssl.create_default_context()` with OpenSSL's
            // SECLEVEL=2 DEFAULT cipher list. Order matters: TLS 1.3
            // suites first, then ECDHE-ECDSA-AES256, ECDHE-RSA-AES256,
            // CHACHA20 variants, ECDHE-AES128, fallback non-ECDHE.
            // ALPN is http/1.1 only â httpx defaults to H1 unless
            // `httpx.Client(http2=True)`.
            KnownFingerprint::PythonHttpx => Fingerprint {
                name: "python_httpx".to_string(),
                ja3: Some("771,4866-4865-4867-49200-49196-159-52393-52392-49199-49195-158-49188-49187-49162-49161-107-103-57-51-157-156-61-60-53-47,0-23-65281-10-11-35-16-22-23-13-43-45-51,29-23-24,0".to_string()),
                ja4r: None,
                alpn: vec![b"http/1.1".to_vec()],
            },
        }
    }
}

/// Inherent helpers â JA3 parsing, Chrome-canonical extension data,
/// and the rustls `CryptoProvider` builder.
impl Fingerprint {
    /// Parse `self.ja3` into a typed [`ParsedJa3`]. Returns `None` if
    /// the JA3 string is absent or malformed.
    pub fn parse_ja3(&self) -> Option<ParsedJa3> {
        ParsedJa3::from_str(self.ja3.as_deref()?)
    }

    /// The signature_algorithms (extension 13) list real Chrome
    /// 120-144 emits, in wire order. Stable across this version range.
    /// Encoded as IANA SignatureScheme codepoints (the same `u16`
    /// values used in TLS 1.3's `signature_algorithms` extension and
    /// in JA4's signature-algorithms hash input).
    pub fn chrome_signature_algorithms() -> &'static [u16] {
        &[
            0x0403, // ecdsa_secp256r1_sha256
            0x0804, // rsa_pss_rsae_sha256
            0x0401, // rsa_pkcs1_sha256
            0x0503, // ecdsa_secp384r1_sha384
            0x0805, // rsa_pss_rsae_sha384
            0x0501, // rsa_pkcs1_sha384
            0x0806, // rsa_pss_rsae_sha512
            0x0601, // rsa_pkcs1_sha512
        ]
    }

    /// The supported_versions (extension 43) list real Chrome 120-144
    /// emits. Head is a GREASE value (see
    /// [`Fingerprint::chrome_grease_supported_versions`]) followed by
    /// TLS 1.3 then TLS 1.2.
    pub fn chrome_supported_versions() -> &'static [u16] {
        &[
            0x0304, // TLS 1.3
            0x0303, // TLS 1.2
        ]
    }

    /// The single GREASE value Chrome interleaves at the head of the
    /// cipher list, extension list, supported_groups list and
    /// key_share list on a given connection. Chrome picks one of 16
    /// GREASE values per connection (`0x0A0A, 0x1A1A, â¦ 0xFAFA`); we
    /// emit `0xBABA` deterministically so JA3 hashes are reproducible
    /// in tests. (Real Chrome picks at random; the wire value the
    /// scorer sees is GREASE-class regardless.)
    pub fn chrome_grease_value() -> u16 {
        0xBABA
    }

    /// Convenience: parsed extension list, or empty if the JA3 is
    /// missing/malformed. Same data as `parse_ja3().extensions`.
    pub fn extensions(&self) -> Vec<u16> {
        self.parse_ja3().map(|p| p.extensions).unwrap_or_default()
    }

    /// Convenience: parsed curves / named-groups list, or empty.
    pub fn curves(&self) -> Vec<u16> {
        self.parse_ja3().map(|p| p.curves).unwrap_or_default()
    }

    /// Convenience: parsed EC point-formats list (TLS 1.2 extension
    /// 11). Empty for fingerprints whose JA3 elides the field.
    pub fn point_formats(&self) -> Vec<u8> {
        self.parse_ja3().map(|p| p.point_formats).unwrap_or_default()
    }

    /// Build a rustls `CryptoProvider` whose cipher suite list matches
    /// the target JA3's `ciphers` field, in order. Falls back to the
    /// default rustcrypto provider if the JA3 is missing or no
    /// matching suites are available.
    ///
    /// The `kx_groups` list is augmented with the X25519MLKEM768
    /// hybrid (RFC draft `draft-ietf-tls-ecdhe-mlkem`) at the head,
    /// so Chrome-shaped personas advertise the PQ-hybrid in their
    /// `supported_groups` extension and can actually complete the
    /// handshake when a server picks it. See
    /// [`crate::x25519_mlkem768`] for the impl.
    pub fn build_provider(&self) -> Arc<CryptoProvider> {
        let base = rustls_rustcrypto::provider();
        let kx_groups_with_hybrid = {
            let mut groups: Vec<&'static dyn rustls::crypto::SupportedKxGroup> = Vec::new();
            groups.push(crate::x25519_mlkem768::X25519MLKEM768);
            groups.extend_from_slice(&base.kx_groups);
            groups
        };
        let Some(ja3) = &self.ja3 else {
            return Arc::new(CryptoProvider {
                kx_groups: kx_groups_with_hybrid,
                ..base
            });
        };
        let Some(ciphers_field) = ja3.split(',').nth(1) else {
            return Arc::new(CryptoProvider {
                kx_groups: kx_groups_with_hybrid,
                ..base
            });
        };
        let ids: Vec<u16> = ciphers_field
            .split('-')
            .filter_map(|s| s.parse().ok())
            .collect();
        if ids.is_empty() {
            return Arc::new(CryptoProvider {
                kx_groups: kx_groups_with_hybrid,
                ..base
            });
        }
        let ordered: Vec<SupportedCipherSuite> = ids
            .iter()
            .filter_map(|id| lookup_suite(*id))
            .collect();
        if ordered.is_empty() {
            return Arc::new(CryptoProvider {
                kx_groups: kx_groups_with_hybrid,
                ..base
            });
        }
        Arc::new(CryptoProvider {
            cipher_suites: ordered,
            kx_groups: kx_groups_with_hybrid,
            ..base
        })
    }
}

/// Map an IANA cipher-suite ID (the numeric value used in JA3 strings)
/// to a rustls-rustcrypto `SupportedCipherSuite`. Only the suites
/// rustls-rustcrypto actually implements are mappable. The rest fall
/// out of the resulting cipher list, which still gets us closer to
/// the target than the rustls default ordering.
fn lookup_suite(id: u16) -> Option<SupportedCipherSuite> {
    use rustls_rustcrypto as rc;
    match id {
        // TLS 1.3
        0x1301 => Some(rc::TLS13_AES_128_GCM_SHA256),
        0x1302 => Some(rc::TLS13_AES_256_GCM_SHA384),
        0x1303 => Some(rc::TLS13_CHACHA20_POLY1305_SHA256),
        // TLS 1.2 ECDHE-ECDSA
        0xC02B => Some(rc::TLS_ECDHE_ECDSA_WITH_AES_128_GCM_SHA256),
        0xC02C => Some(rc::TLS_ECDHE_ECDSA_WITH_AES_256_GCM_SHA384),
        0xCCA9 => Some(rc::TLS_ECDHE_ECDSA_WITH_CHACHA20_POLY1305_SHA256),
        // TLS 1.2 ECDHE-RSA
        0xC02F => Some(rc::TLS_ECDHE_RSA_WITH_AES_128_GCM_SHA256),
        0xC030 => Some(rc::TLS_ECDHE_RSA_WITH_AES_256_GCM_SHA384),
        0xCCA8 => Some(rc::TLS_ECDHE_RSA_WITH_CHACHA20_POLY1305_SHA256),
        _ => None,
    }
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn known_fingerprints_resolve() {
        assert_eq!(
            KnownFingerprint::from_name("okhttp5"),
            Some(KnownFingerprint::OkHttp5)
        );
        assert_eq!(
            KnownFingerprint::from_name("CHROME120"),
            Some(KnownFingerprint::Chrome120)
        );
        assert_eq!(KnownFingerprint::from_name("nonsense"), None);
    }

    #[test]
    fn okhttp5_provider_has_at_least_one_suite() {
        let fp = KnownFingerprint::OkHttp5.into_fingerprint();
        let provider = fp.build_provider();
        assert!(
            !provider.cipher_suites.is_empty(),
            "okhttp5 provider should pick at least one cipher suite"
        );
    }

    #[test]
    fn chrome120_alpn_lists_h2_first() {
        let fp = KnownFingerprint::Chrome120.into_fingerprint();
        assert_eq!(fp.alpn[0], b"h2");
        assert_eq!(fp.alpn[1], b"http/1.1");
    }

    #[test]
    fn ja3_cipher_field_parses() {
        let fp = KnownFingerprint::OkHttp5.into_fingerprint();
        let provider = fp.build_provider();
        // OkHttp5 advertises TLS13_AES_128_GCM_SHA256 first.
        let first = provider.cipher_suites[0];
        assert_eq!(
            first.suite(),
            rustls::CipherSuite::TLS13_AES_128_GCM_SHA256
        );
    }
}
