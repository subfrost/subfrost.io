//! TLS connection wrapper around a [`Socket`].
//!
//! Drives a `rustls::ClientConnection` to completion against the
//! caller's socket, then exposes plain byte-level read/write over the
//! encrypted channel.
//!
//! For `http://` URLs we also expose a [`PlainConnection`] that
//! implements the same [`HttpStream`] trait as [`TlsConnection`] but
//! shuttles bytes straight through the underlying socket with no
//! TLS layer. The HTTP/1.1 codec in [`crate::http1`] is generic over
//! `HttpStream` so the same code paths handle both.

use std::collections::VecDeque;
use std::io::Read;
use std::sync::Arc;

use rustls::client::danger::{HandshakeSignatureValid, ServerCertVerified, ServerCertVerifier};
use rustls::client::ClientHelloMutator;
use rustls::pki_types::{CertificateDer, ServerName, UnixTime};
use rustls::{ClientConfig, ClientConnection, RootCertStore, SignatureScheme};

use crate::error::TlsFetchError;
use crate::fingerprint::Fingerprint;
use crate::handshake_shim::{build_client_hello, ClientHelloInputs};
use crate::socket::Socket;

/// Stream abstraction the [`crate::http1`] codec speaks against.
/// Implemented by both [`TlsConnection`] (encrypted) and
/// [`PlainConnection`] (raw bytes for `http://` URLs).
pub trait HttpStream {
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, TlsFetchError>;
    fn write_all(&mut self, data: &[u8]) -> Result<(), TlsFetchError>;
    /// Best-effort close — sends close_notify on TLS, shuts down the
    /// socket on plain.
    fn close(&mut self) -> Result<(), TlsFetchError>;
}

/// Plain TCP wrapper for `http://` URLs. No encryption, just maps
/// the [`HttpStream`] trait onto a raw [`Socket`].
pub struct PlainConnection<S: Socket> {
    socket: S,
}

impl<S: Socket> PlainConnection<S> {
    pub fn new(socket: S) -> Self {
        Self { socket }
    }

    /// Convenience: serialize and send an HTTP request, then parse the
    /// response — same shape as [`TlsConnection::write_request`].
    pub fn write_request(
        &mut self,
        req: &crate::http1::HttpRequest,
    ) -> Result<(), TlsFetchError> {
        <Self as HttpStream>::write_all(self, &req.encode())
    }

    pub fn read_response(&mut self) -> Result<crate::http1::HttpResponse, TlsFetchError> {
        crate::http1::HttpResponse::read_from(self)
    }
}

impl<S: Socket> HttpStream for PlainConnection<S> {
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, TlsFetchError> {
        self.socket
            .read(buf)
            .map_err(|e| TlsFetchError::Io(e.to_string()))
    }
    fn write_all(&mut self, data: &[u8]) -> Result<(), TlsFetchError> {
        let mut written = 0;
        while written < data.len() {
            match self.socket.write(&data[written..]) {
                Ok(0) => {
                    return Err(TlsFetchError::ConnectionClosed("plain_write"))
                }
                Ok(n) => written += n,
                Err(e) => return Err(TlsFetchError::Io(e.to_string())),
            }
        }
        self.socket
            .flush()
            .map_err(|e| TlsFetchError::Io(e.to_string()))?;
        Ok(())
    }
    fn close(&mut self) -> Result<(), TlsFetchError> {
        self.socket
            .close()
            .map_err(|e| TlsFetchError::Io(e.to_string()))
    }
}

/// Knobs for the TLS connection.
#[derive(Clone)]
pub struct TlsConfig {
    /// Server name for SNI + cert verification.
    pub sni: Option<String>,
    /// Skip server certificate verification (testing / self-signed).
    pub insecure_skip_verify: bool,
    /// Application layer protocol negotiation candidates, in order.
    pub alpn: Vec<Vec<u8>>,
    /// Optional client-hello fingerprint to apply on top of rustls's
    /// default handshake. Currently a no-op placeholder — see
    /// [`Fingerprint`] for the planned customization story.
    pub fingerprint: Option<Fingerprint>,
}

impl Default for TlsConfig {
    fn default() -> Self {
        Self {
            sni: None,
            insecure_skip_verify: false,
            alpn: vec![b"http/1.1".to_vec()],
            fingerprint: None,
        }
    }
}

/// A TLS-wrapped socket. Mirrors a subset of `std::io::Read+Write`.
pub struct TlsConnection<S: Socket> {
    socket: S,
    conn: ClientConnection,
    /// Leftover TLS record bytes from a previous socket read that
    /// couldn't be fully consumed by `read_tls` in one pass.
    tls_leftover: Vec<u8>,
    /// Plaintext that's been decrypted by rustls but not yet returned
    /// to the caller via `read()`. We drain rustls's internal buffer
    /// into here aggressively (after each `process_new_packets`) so a
    /// burst of TLS records never trips its 16K plaintext cap with
    /// "received plaintext buffer full".
    plaintext: VecDeque<u8>,
}

/// Install the persona's [`crate::fingerprint::Fingerprint`] onto an
/// already-built [`ClientConfig`].
///
/// Three things happen when `fp` is `Some`:
///
/// - **ALPN allow-list** is forced to the persona's so rustls's
///   `process_alpn_protocol` accepts the server's selection
///   (otherwise the persona-emitted wire ALPN would be rejected as
///   `SelectedUnofferedApplicationProtocol`).
/// - **`client_hello_mutator`** is set to the [`FingerprintMutator`]
///   below, which substitutes the bytes `handshake_shim` produces
///   (extension ordering, GREASE injection, sig_algs / key_share /
///   supported_versions in persona shape) for rustls's stock
///   ClientHello. The mutator preserves rustls's `random`,
///   `session_id`, and X25519 key_share public key, so the TLS 1.3
///   key schedule still agrees with what the peer derives.
///
/// This is split from [`build_client_config`] so the H3 path —
/// which is forced to use the `ring` provider for quinn
/// compatibility — can also install the mutator without inheriting
/// the rustls-rustcrypto cipher provider [`build_client_config`]
/// chooses.
pub fn install_fingerprint(config: &mut ClientConfig, fp: Option<&Fingerprint>, sni: &str) {
    if let Some(fp) = fp {
        config.alpn_protocols = fp.alpn.clone();
        // Operator-side escape hatch: when the byte-shim's emitted
        // ClientHello trips a peer's TLS parser (`DecodeError` /
        // `IllegalParameter` etc.), set
        // `TLSFETCH_DISABLE_CH_MUTATOR=1` for the calling process
        // to skip the mutator install. The cipher list + ALPN
        // override still apply, so the persona's JA3 cipher field
        // matches; only the extension order falls back to rustls's
        // canonical shape.
        if std::env::var("TLSFETCH_DISABLE_CH_MUTATOR").as_deref() == Ok("1") {
            return;
        }
        config.client_hello_mutator = Some(Arc::new(FingerprintMutator {
            fingerprint: fp.clone(),
            sni: sni.to_string(),
        }));
    }
}

/// Build a [`ClientConfig`] from the persona-driven knobs in
/// [`TlsConfig`].
///
/// Used by the H1 path (here) and the H2 path (`http2.rs`); both
/// can ride the `rustls-rustcrypto` cipher provider. The H3 path
/// can't (quinn needs ring), so it builds its own ClientConfig and
/// applies just the persona's mutator via [`install_fingerprint`].
pub fn build_client_config(cfg: &TlsConfig, sni: &str) -> Result<ClientConfig, TlsFetchError> {
    let mut root_store = RootCertStore::empty();
    root_store.extend(webpki_roots::TLS_SERVER_ROOTS.iter().cloned());

    let provider = match cfg.fingerprint.as_ref() {
        Some(fp) => fp.build_provider(),
        None => std::sync::Arc::new(rustls_rustcrypto::provider()),
    };
    let mut config = ClientConfig::builder_with_provider(provider)
        .with_safe_default_protocol_versions()
        .map_err(|e| TlsFetchError::HandshakeFailed(e.to_string()))?
        .with_root_certificates(root_store)
        .with_no_client_auth();

    if cfg.insecure_skip_verify {
        config
            .dangerous()
            .set_certificate_verifier(Arc::new(NoVerify));
    }
    config.alpn_protocols = cfg.alpn.clone();

    install_fingerprint(&mut config, cfg.fingerprint.as_ref(), sni);

    Ok(config)
}

impl<S: Socket> TlsConnection<S> {
    /// Drive a TLS handshake over `socket` against `host`.
    pub fn handshake(socket: S, host: &str, mut cfg: TlsConfig) -> Result<Self, TlsFetchError> {
        if cfg.sni.is_none() {
            cfg.sni = Some(host.to_string());
        }
        let sni_str = cfg.sni.clone().unwrap();
        let server_name = ServerName::try_from(sni_str.clone())
            .map_err(|e| TlsFetchError::InvalidDnsName(format!("{}: {}", sni_str, e)))?;

        let config = build_client_config(&cfg, &sni_str)?;
        let conn = ClientConnection::new(Arc::new(config), server_name)
            .map_err(|e| TlsFetchError::HandshakeFailed(e.to_string()))?;

        let mut tls_conn = TlsConnection {
            socket,
            conn,
            tls_leftover: Vec::new(),
            plaintext: VecDeque::new(),
        };
        tls_conn.complete_handshake()?;
        Ok(tls_conn)
    }

    /// Pump bytes between rustls and the underlying socket until the
    /// handshake completes (`is_handshaking() == false`). This is the
    /// IO loop that makes rustls work over an arbitrary byte stream.
    fn complete_handshake(&mut self) -> Result<(), TlsFetchError> {
        let mut buf = [0u8; 16 * 1024];
        loop {
            // Push outgoing handshake bytes to the socket.
            while self.conn.wants_write() {
                let mut tmp = Vec::with_capacity(4096);
                let n = self.conn.write_tls(&mut tmp)?;
                if n == 0 {
                    break;
                }
                let mut written = 0;
                while written < n {
                    let w = self.socket.write(&tmp[written..n])?;
                    if w == 0 {
                        return Err(TlsFetchError::ConnectionClosed("handshake_write"));
                    }
                    written += w;
                }
                self.socket.flush()?;
            }

            if !self.conn.is_handshaking() {
                return Ok(());
            }

            if self.conn.wants_read() {
                let n = self.socket.read(&mut buf)?;
                if n == 0 {
                    return Err(TlsFetchError::ConnectionClosed("handshake_read"));
                }
                // The socket read may return bytes spanning multiple
                // TLS records. `read_tls` only consumes one record at
                // a time, so we must loop until the cursor is drained
                // — same pattern as the `read()` data path.
                let mut cursor: &[u8] = &buf[..n];
                while !cursor.is_empty() {
                    let consumed = self
                        .conn
                        .read_tls(&mut cursor)
                        .map_err(|e| TlsFetchError::Io(e.to_string()))?;
                    self.conn
                        .process_new_packets()
                        .map_err(|e| TlsFetchError::Tls(e.to_string()))?;
                    if consumed == 0 {
                        break;
                    }
                }
            }
        }
    }

    /// Read up to `out.len()` plaintext bytes. Returns `Ok(0)` only on
    /// clean shutdown.
    pub fn read(&mut self, out: &mut [u8]) -> Result<usize, TlsFetchError> {
        loop {
            // Serve from our local plaintext buffer first.
            if !self.plaintext.is_empty() {
                let n = out.len().min(self.plaintext.len());
                for slot in out.iter_mut().take(n) {
                    *slot = self.plaintext.pop_front().unwrap();
                }
                return Ok(n);
            }
            // Pump more from the socket — first drain any pending TLS
            // writes that owe acks.
            self.flush_writes()?;

            // Process any leftover bytes from the previous socket read
            // before pulling more off the wire.
            if !self.tls_leftover.is_empty() {
                let leftover = std::mem::take(&mut self.tls_leftover);
                self.feed_tls_records(&leftover)?;
                if !self.plaintext.is_empty() {
                    continue;
                }
            }

            let mut buf = [0u8; 16 * 1024];
            let n = self.socket.read(&mut buf)?;
            if n == 0 {
                return Ok(0);
            }
            self.feed_tls_records(&buf[..n])?;
        }
    }

    /// Pull any decrypted plaintext rustls is holding internally into
    /// `self.plaintext`. Called after every `process_new_packets` so
    /// the rustls buffer stays well below its 16 KiB cap regardless of
    /// how many TLS records back-to-back we receive.
    fn drain_plaintext(&mut self) {
        let mut tmp = [0u8; 16 * 1024];
        loop {
            match self.conn.reader().read(&mut tmp) {
                Ok(0) => break,
                Ok(n) => self.plaintext.extend(&tmp[..n]),
                Err(_) => break,
            }
        }
    }

    /// Feed raw TLS bytes into rustls, processing records one at a time.
    /// Any bytes that can't be consumed are saved in `tls_leftover` for
    /// the next call. Between records, we drain available plaintext into
    /// `self.plaintext` to prevent rustls's 16K internal buffer filling
    /// up ("received plaintext buffer full") when many records arrive
    /// in one socket read — common on long-lived HTTP/2 streams.
    fn feed_tls_records(&mut self, data: &[u8]) -> Result<(), TlsFetchError> {
        let mut cursor: &[u8] = data;
        while !cursor.is_empty() {
            let consumed = self
                .conn
                .read_tls(&mut cursor)
                .map_err(|e| TlsFetchError::Io(e.to_string()))?;
            if consumed == 0 {
                // rustls can't consume more — save remainder for next call
                self.tls_leftover = cursor.to_vec();
                break;
            }
            self.conn
                .process_new_packets()
                .map_err(|e| TlsFetchError::Tls(e.to_string()))?;
            self.drain_plaintext();
        }
        Ok(())
    }

    /// Write `data` as plaintext through the encrypted channel.
    /// Chunks the write into 16KB pieces with intermediate flushes
    /// to avoid filling rustls's internal buffer on large payloads.
    pub fn write_all(&mut self, data: &[u8]) -> Result<(), TlsFetchError> {
        const CHUNK: usize = 16384; // TLS max record size
        let mut offset = 0;
        while offset < data.len() {
            let end = (offset + CHUNK).min(data.len());
            let chunk = &data[offset..end];
            std::io::Write::write_all(&mut self.conn.writer(), chunk)
                .map_err(|e| TlsFetchError::Io(e.to_string()))?;
            self.flush_writes()?;
            offset = end;
        }
        Ok(())
    }

    /// Drain any pending TLS write bytes to the underlying socket.
    fn flush_writes(&mut self) -> Result<(), TlsFetchError> {
        while self.conn.wants_write() {
            let mut tmp = Vec::with_capacity(4096);
            let n = self.conn.write_tls(&mut tmp)?;
            if n == 0 {
                break;
            }
            let mut written = 0;
            while written < n {
                let w = self.socket.write(&tmp[written..n])?;
                if w == 0 {
                    return Err(TlsFetchError::ConnectionClosed("write"));
                }
                written += w;
            }
            self.socket.flush()?;
        }
        Ok(())
    }

    /// Convenience: serialize and send an HTTP request, then parse the
    /// response. See [`crate::http1::HttpRequest`].
    pub fn write_request(&mut self, req: &crate::http1::HttpRequest) -> Result<(), TlsFetchError> {
        let bytes = req.encode();
        <Self as HttpStream>::write_all(self, &bytes)
    }

    pub fn read_response(&mut self) -> Result<crate::http1::HttpResponse, TlsFetchError> {
        crate::http1::HttpResponse::read_from(self)
    }

    /// Send a TLS close_notify and shut down the underlying socket.
    pub fn close(&mut self) -> Result<(), TlsFetchError> {
        self.conn.send_close_notify();
        let _ = self.flush_writes();
        let _ = self.socket.close();
        Ok(())
    }

    /// The ALPN protocol the server selected during the handshake, if
    /// any. Returns the raw ALPN ID bytes (e.g. `b"h2"` or
    /// `b"http/1.1"`). `None` if the server didn't pick one or the
    /// handshake hasn't completed.
    pub fn alpn_protocol(&self) -> Option<&[u8]> {
        self.conn.alpn_protocol()
    }
}

impl<S: Socket> HttpStream for TlsConnection<S> {
    fn read(&mut self, buf: &mut [u8]) -> Result<usize, TlsFetchError> {
        TlsConnection::read(self, buf)
    }
    fn write_all(&mut self, data: &[u8]) -> Result<(), TlsFetchError> {
        TlsConnection::write_all(self, data)
    }
    fn close(&mut self) -> Result<(), TlsFetchError> {
        TlsConnection::close(self)
    }
}

/// `dangerous`: skip server certificate verification. Used for tests
/// and development against self-signed certs only.
#[derive(Debug)]
struct NoVerify;

impl ServerCertVerifier for NoVerify {
    fn verify_server_cert(
        &self,
        _end_entity: &CertificateDer<'_>,
        _intermediates: &[CertificateDer<'_>],
        _server_name: &ServerName<'_>,
        _ocsp_response: &[u8],
        _now: UnixTime,
    ) -> Result<ServerCertVerified, rustls::Error> {
        Ok(ServerCertVerified::assertion())
    }

    fn verify_tls12_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn verify_tls13_signature(
        &self,
        _message: &[u8],
        _cert: &CertificateDer<'_>,
        _dss: &rustls::DigitallySignedStruct,
    ) -> Result<HandshakeSignatureValid, rustls::Error> {
        Ok(HandshakeSignatureValid::assertion())
    }

    fn supported_verify_schemes(&self) -> Vec<SignatureScheme> {
        vec![
            SignatureScheme::RSA_PKCS1_SHA256,
            SignatureScheme::RSA_PKCS1_SHA384,
            SignatureScheme::RSA_PKCS1_SHA512,
            SignatureScheme::RSA_PSS_SHA256,
            SignatureScheme::RSA_PSS_SHA384,
            SignatureScheme::RSA_PSS_SHA512,
            SignatureScheme::ECDSA_NISTP256_SHA256,
            SignatureScheme::ECDSA_NISTP384_SHA384,
            SignatureScheme::ECDSA_NISTP521_SHA512,
            SignatureScheme::ED25519,
        ]
    }
}

/// Bridge between rustls's [`ClientHelloMutator`] hook (in our
/// vendored `rustls-tlsfetch` fork) and tlsfetch-common's
/// [`crate::handshake_shim::build_client_hello`].
///
/// When installed, this mutator:
///
/// 1. Receives the bytes rustls would have emitted as the
///    ClientHello (the full handshake-layer message, starting at the
///    `0x01 ClientHello` type byte).
/// 2. Parses out the three values rustls committed to before the
///    hook was reached: the 32-byte `random`, the
///    `legacy_session_id`, and the X25519 `key_share` public key.
/// 3. Hands those values to `build_client_hello` together with the
///    persona's [`Fingerprint`], producing a Chrome-shaped
///    ClientHello body in JA3 / GREASE / extension-order.
/// 4. Wraps the body in `[type:u8=0x01 | length:u24 | body]` and
///    returns it as the replacement for both the wire write AND the
///    transcript hash (`emit_client_hello_for_retry` in our fork
///    splices the bytes into the `MessagePayload::Handshake.encoded`
///    field before either operation runs).
///
/// If parsing `ours` fails for any reason (truncated, missing
/// key_share, …), the mutator returns the original bytes unchanged
/// rather than panicking — the handshake then proceeds with rustls's
/// stock CH shape, surfacing as a fingerprint mismatch downstream
/// but not a hard failure.
#[derive(Debug)]
struct FingerprintMutator {
    fingerprint: Fingerprint,
    sni: String,
}

impl ClientHelloMutator for FingerprintMutator {
    fn mutate_client_hello(&self, ours: &[u8]) -> Vec<u8> {
        let mutated = match try_build_replacement(&self.fingerprint, &self.sni, ours) {
            Some(replacement) => replacement,
            None => ours.to_vec(),
        };
        maybe_dump_client_hello(&self.sni, ours, &mutated);
        mutated
    }
}

/// Operator debug hook. When `TLSFETCH_DUMP_CH=<dir>` is set, write
/// the rustls-pre-mutation bytes and our shim-post-mutation bytes to
/// `<dir>/<sni>.<unix_ts>.pre.bin` and `<dir>/<sni>.<unix_ts>.post.bin`.
/// Lets the operator diff the two against a real Chrome ClientHello
/// capture (e.g. via Wireshark "Export Selected Packet Bytes") to
/// chase down which extension is encoded wrong when a peer alerts
/// with `DecodeError` / `IllegalParameter`.
///
/// No-op when the env var is unset, so this is safe to leave in
/// release builds.
fn maybe_dump_client_hello(sni: &str, pre: &[u8], post: &[u8]) {
    let dir = match std::env::var("TLSFETCH_DUMP_CH") {
        Ok(d) if !d.is_empty() => d,
        _ => return,
    };
    let ts = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_nanos())
        .unwrap_or(0);
    let safe_sni: String = sni
        .chars()
        .map(|c| if c.is_ascii_alphanumeric() || c == '.' || c == '-' || c == '_' { c } else { '_' })
        .collect();
    let _ = std::fs::create_dir_all(&dir);
    let pre_path = format!("{dir}/{safe_sni}.{ts}.pre.bin");
    let post_path = format!("{dir}/{safe_sni}.{ts}.post.bin");
    let _ = std::fs::write(&pre_path, pre);
    let _ = std::fs::write(&post_path, post);
    eprintln!(
        "! tlsfetch dump-ch: sni={sni} pre={pre_path} ({} B) post={post_path} ({} B)",
        pre.len(),
        post.len()
    );
}

/// Parse the random / session_id / x25519 key_share fields out of
/// `ours` (rustls's stock ClientHello bytes) and use them to build a
/// Chrome-shaped replacement via [`build_client_hello`]. Returns
/// `None` if anything about `ours` looks wrong — caller falls back
/// to the stock bytes.
fn try_build_replacement(
    fp: &Fingerprint,
    sni: &str,
    ours: &[u8],
) -> Option<Vec<u8>> {
    // Handshake header: type(u8=1) + length(u24).
    if ours.len() < 4 || ours[0] != 0x01 {
        return None;
    }
    let hs_len = ((ours[1] as usize) << 16) | ((ours[2] as usize) << 8) | (ours[3] as usize);
    if 4 + hs_len > ours.len() {
        return None;
    }
    let body = &ours[4..4 + hs_len];

    // ClientHello body layout per RFC 8446 §4.1.2:
    //   legacy_version:2 | random:32 | session_id<0..=32> |
    //   cipher_suites<2..2^16-2> | legacy_compression_methods<1..255> |
    //   extensions<0..2^16-1>.
    let mut p = 0;
    if body.len() < p + 2 + 32 + 1 {
        return None;
    }
    // skip legacy_version
    p += 2;
    let random: [u8; 32] = body[p..p + 32].try_into().ok()?;
    p += 32;
    let sid_len = body[p] as usize;
    p += 1;
    if body.len() < p + sid_len {
        return None;
    }
    let session_id_bytes = &body[p..p + sid_len];
    p += sid_len;

    // We need a fixed-width 32-byte session_id for the shim; pad with
    // zeros (right-side) when rustls emits a shorter ID (e.g. empty
    // for non-compatibility-mode TLS 1.3). Conversely, truncate if
    // it's longer — but TLS spec caps it at 32 so we should never
    // hit that path.
    let mut session_id = [0u8; 32];
    let n = sid_len.min(32);
    session_id[..n].copy_from_slice(&session_id_bytes[..n]);

    // Walk past cipher_suites + compression_methods to the extensions
    // block. We don't care about the cipher list content here — our
    // shim emits its own JA3-ordered list — but we need to advance
    // the cursor to reach the key_share extension.
    if body.len() < p + 2 {
        return None;
    }
    let cipher_len = u16::from_be_bytes([body[p], body[p + 1]]) as usize;
    p += 2 + cipher_len;
    if body.len() < p + 1 {
        return None;
    }
    let comp_len = body[p] as usize;
    p += 1 + comp_len;
    if body.len() < p + 2 {
        return None;
    }
    let ext_total = u16::from_be_bytes([body[p], body[p + 1]]) as usize;
    p += 2;
    if body.len() < p + ext_total {
        return None;
    }
    let exts = &body[p..p + ext_total];

    // Scan extensions for key_share (type 51). Inside, pull:
    //  * the X25519 entry (group 0x001D, 32-byte pubkey) — every CH
    //    has one.
    //  * the X25519MLKEM768 entry (group 0x11EC, 1216-byte hybrid
    //    pubkey) — present when the persona's `supported_groups`
    //    advertised the hybrid AND rustls's CryptoProvider was
    //    built by [`Fingerprint::build_provider`] (which registers
    //    [`crate::x25519_mlkem768::X25519MLKEM768`]).
    //
    // The captured bytes are passed through to `build_client_hello`
    // so the shim's emitted CH ships the *same* public keys rustls
    // itself holds the secrets for — when the server replies, rustls
    // computes the shared secret against the matching private key.
    let mut x25519_public = [0u8; 32];
    let mut x25519_found = false;
    let mut mlkem_hybrid: Option<Vec<u8>> = None;
    let mut q = 0;
    while q + 4 <= exts.len() {
        let etype = u16::from_be_bytes([exts[q], exts[q + 1]]);
        let elen = u16::from_be_bytes([exts[q + 2], exts[q + 3]]) as usize;
        if q + 4 + elen > exts.len() {
            return None;
        }
        let ebody = &exts[q + 4..q + 4 + elen];
        if etype == 51 && ebody.len() >= 2 {
            let inner_len = u16::from_be_bytes([ebody[0], ebody[1]]) as usize;
            if 2 + inner_len <= ebody.len() {
                let mut r = 2;
                while r + 4 <= 2 + inner_len {
                    let group = u16::from_be_bytes([ebody[r], ebody[r + 1]]);
                    let kx_len =
                        u16::from_be_bytes([ebody[r + 2], ebody[r + 3]]) as usize;
                    if r + 4 + kx_len > ebody.len() {
                        return None;
                    }
                    if group == 0x001D && kx_len == 32 {
                        x25519_public.copy_from_slice(&ebody[r + 4..r + 4 + 32]);
                        x25519_found = true;
                    } else if group == 0x11EC && kx_len == 1216 {
                        mlkem_hybrid = Some(ebody[r + 4..r + 4 + 1216].to_vec());
                    }
                    r += 4 + kx_len;
                }
            }
        }
        q += 4 + elen;
    }
    if !x25519_found {
        return None;
    }

    let shim_body = build_client_hello(&ClientHelloInputs {
        fingerprint: fp,
        sni,
        random,
        session_id,
        x25519_public,
        mlkem_hybrid_pubkey: mlkem_hybrid.as_deref(),
    });

    // Wrap the shim body in the handshake-layer header
    // (type:u8=0x01 ClientHello + length:u24). The total length is
    // the body length; rustls's outer record header is added later
    // by `cx.common.send_msg` (it doesn't read from us).
    let body_len = shim_body.len();
    if body_len > 0xFF_FFFF {
        return None;
    }
    let mut out = Vec::with_capacity(4 + body_len);
    out.push(0x01); // HandshakeType::ClientHello
    out.push(((body_len >> 16) & 0xFF) as u8);
    out.push(((body_len >> 8) & 0xFF) as u8);
    out.push((body_len & 0xFF) as u8);
    out.extend_from_slice(&shim_body);
    Some(out)
}
