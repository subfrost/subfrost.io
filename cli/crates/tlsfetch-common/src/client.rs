//! `HttpClient<F: SocketFactory>` — the generic HTTPS client.
//!
//! Picks a [`Protocol`] (currently always HTTP/1.1; HTTP/2 + HTTP/3 in
//! Phase 2/3), opens a fresh socket via the configured factory, runs
//! a TLS handshake against the host, sends the request, parses the
//! response.
//!
//! The client is fully generic over the [`SocketFactory`] type so that
//! native (`tlsfetch-sys`) and wasm (`tlsfetch-web-sys`) consumers
//! share the same orchestration code.

use std::time::Duration;

use crate::error::TlsFetchError;
use crate::http1::{HttpRequest, HttpResponse};
use crate::protocol::Protocol;
use crate::socket::{Socket, SocketFactory};
use crate::tls::{TlsConfig, TlsConnection};
use crate::Fingerprint;

/// Per-request knobs.
#[derive(Debug, Clone, Default)]
pub struct RequestOptions {
    /// Force a particular HTTP version. `None` = let ALPN decide
    /// (currently always Http1).
    pub force_protocol: Option<Protocol>,
    /// Skip TLS server certificate verification.
    pub insecure: bool,
    /// Connect-only timeout.
    pub connect_timeout: Option<Duration>,
    /// SNI override (defaults to URL host).
    pub sni: Option<String>,
    /// Override TCP destination ("--resolve host:port:addr"). When set,
    /// the factory dials this address but TLS still uses `sni` (or the
    /// URL host) for the handshake.
    pub resolve_to: Option<(String, u16)>,
    /// Optional ClientHello fingerprint (Phase 2).
    pub fingerprint: Option<Fingerprint>,
    /// ALPN candidates in preference order. Defaults to `["http/1.1"]`.
    pub alpn: Option<Vec<Vec<u8>>>,
    /// NTLM credentials for connection-bound auth. When `Some`, the
    /// HTTP/1.1 path runs the Type1/Type2/Type3 handshake on a single
    /// TCP connection before handing the response back. Requires the
    /// `ntlm` feature.
    #[cfg(feature = "ntlm")]
    pub ntlm: Option<crate::ntlm::NtlmCredentials>,
    /// Skip the TLS layer entirely and speak plain HTTP/1.1 over the
    /// raw socket. Used for `http://` URLs. The TLS-impersonation
    /// machinery (fingerprint, ALPN, insecure-skip-verify) is ignored
    /// when this is set.
    pub plaintext: bool,
}

/// The HTTPS client. Carries a `SocketFactory` so it knows how to dial
/// new TCP connections.
pub struct HttpClient<F: SocketFactory> {
    factory: F,
}

impl<F: SocketFactory> HttpClient<F> {
    pub fn new(factory: F) -> Self {
        Self { factory }
    }

    pub fn factory(&self) -> &F {
        &self.factory
    }

    /// Send `request` to `host:port` over TLS and return the parsed
    /// response. The path/method/body are taken from `request`.
    pub fn send(
        &self,
        host: &str,
        port: u16,
        request: &HttpRequest,
        opts: &RequestOptions,
    ) -> Result<HttpResponse, TlsFetchError>
    where
        F::Socket: Socket,
        // Always required so the H2 dispatch arm can call `send_http2`
        // unconditionally. Wasm builds simply don't have any `Socket`
        // impl matching the bound, so they couldn't construct an
        // `HttpClient<F>` that compiles a call to `send` anyway — fine.
        F::Socket: crate::socket::IntoStdTcpStream,
    {
        // Pick the protocol. Preference order:
        //   1. `force_protocol` if set (explicit caller override).
        //   2. The first ALPN candidate that maps to a protocol we
        //      implement. Personas set `opts.alpn = ["h2", "http/1.1"]`
        //      (Chrome) or `["h3", "h2", "http/1.1"]` (Alt-Svc cached);
        //      we honor that here. The TLS handshake on the H1 path
        //      will still fail-loud if the server doesn't agree, but
        //      for H2/H3 the dedicated send_* paths run their own
        //      handshake with their own ALPN and will fall through
        //      if the server picks something else.
        //   3. Plaintext path: Http1.
        let proto = opts
            .force_protocol
            .unwrap_or_else(|| select_protocol_from_alpn(opts.alpn.as_deref(), opts.plaintext));
        match proto {
            Protocol::Http1 => self.send_http1(host, port, request, opts),
            #[cfg(feature = "http2")]
            Protocol::Http2 => self.send_http2(host, port, request, opts),
            #[cfg(not(feature = "http2"))]
            Protocol::Http2 => Err(crate::http2::not_implemented()),
            #[cfg(feature = "http3")]
            Protocol::Http3 => self.send_http3(host, port, request, opts),
            #[cfg(not(feature = "http3"))]
            Protocol::Http3 => Err(crate::http3::not_implemented()),
        }
    }

    #[cfg(feature = "http3")]
    fn send_http3(
        &self,
        host: &str,
        port: u16,
        request: &HttpRequest,
        opts: &RequestOptions,
    ) -> Result<HttpResponse, TlsFetchError> {
        use http::header::{HeaderName, HeaderValue};

        let method = http::Method::from_bytes(request.method.as_bytes())
            .map_err(|e| TlsFetchError::Other(format!("invalid method: {}", e)))?;
        // h3 follows the same RFC 7540 §8.1.2.2 forbidden-header rule
        // as HTTP/2 — :authority replaces Host, hop-by-hop headers
        // are illegal.
        let h3_forbidden = [
            "host",
            "connection",
            "keep-alive",
            "proxy-connection",
            "transfer-encoding",
            "upgrade",
        ];
        let mut headers = http::HeaderMap::new();
        for (k, v) in &request.headers {
            if h3_forbidden.iter().any(|f| k.eq_ignore_ascii_case(f)) {
                continue;
            }
            let name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| TlsFetchError::Other(format!("bad header name: {}", e)))?;
            let value = HeaderValue::from_bytes(v.as_bytes())
                .map_err(|e| TlsFetchError::Other(format!("bad header value: {}", e)))?;
            headers.append(name, value);
        }

        crate::http3::send_request_blocking(
            host,
            port,
            method,
            &request.path,
            headers,
            request.body.clone(),
            opts.insecure,
            opts.connect_timeout,
            opts.fingerprint.clone(),
        )
    }

    #[cfg(feature = "http2")]
    fn send_http2(
        &self,
        host: &str,
        port: u16,
        request: &HttpRequest,
        opts: &RequestOptions,
    ) -> Result<HttpResponse, TlsFetchError>
    where
        F::Socket: crate::socket::IntoStdTcpStream,
    {
        use http::header::{HeaderName, HeaderValue};

        let method = http::Method::from_bytes(request.method.as_bytes())
            .map_err(|e| TlsFetchError::Other(format!("invalid method: {}", e)))?;
        let mut headers = http::HeaderMap::new();
        // RFC 7540 §8.1.2.2: HTTP/2 forbids these connection-specific
        // headers. h2 enforces with "malformed headers".
        let h2_forbidden = [
            "host",
            "connection",
            "keep-alive",
            "proxy-connection",
            "transfer-encoding",
            "upgrade",
        ];
        for (k, v) in &request.headers {
            if h2_forbidden.iter().any(|f| k.eq_ignore_ascii_case(f)) {
                continue;
            }
            let name = HeaderName::from_bytes(k.as_bytes())
                .map_err(|e| TlsFetchError::Other(format!("bad header name: {}", e)))?;
            let value = HeaderValue::from_bytes(v.as_bytes())
                .map_err(|e| TlsFetchError::Other(format!("bad header value: {}", e)))?;
            headers.append(name, value);
        }

        crate::http2::send_request_blocking(
            &self.factory,
            host,
            port,
            method,
            &request.path,
            headers,
            request.body.clone(),
            opts.insecure,
            opts.connect_timeout,
            opts.fingerprint.clone(),
        )
    }

    fn send_http1(
        &self,
        host: &str,
        port: u16,
        request: &HttpRequest,
        opts: &RequestOptions,
    ) -> Result<HttpResponse, TlsFetchError> {
        let (dial_host, dial_port) = opts
            .resolve_to
            .clone()
            .unwrap_or_else(|| (host.to_string(), port));

        let socket = self
            .factory
            .connect(&dial_host, dial_port, opts.connect_timeout)
            .map_err(|e| TlsFetchError::Io(format!("connect {}:{}: {}", dial_host, dial_port, e)))?;

        // `http://` URLs skip TLS entirely. The TLS-impersonation
        // knobs (fingerprint, ALPN, SNI override, insecure_skip_verify)
        // are silently ignored on this path.
        if opts.plaintext {
            let mut conn = crate::tls::PlainConnection::new(socket);
            conn.write_request(request)?;
            let resp = conn.read_response()?;
            let _ = crate::tls::HttpStream::close(&mut conn);
            return Ok(resp);
        }

        let tls_cfg = TlsConfig {
            sni: Some(opts.sni.clone().unwrap_or_else(|| host.to_string())),
            insecure_skip_verify: opts.insecure,
            alpn: opts.alpn.clone().unwrap_or_else(|| vec![b"http/1.1".to_vec()]),
            fingerprint: opts.fingerprint.clone(),
        };

        let sni_str = tls_cfg.sni.clone().unwrap_or_else(|| host.to_string());
        let mut conn = TlsConnection::handshake(socket, &sni_str, tls_cfg)?;

        #[cfg(feature = "ntlm")]
        if let Some(creds) = &opts.ntlm {
            return self.send_http1_ntlm(&mut conn, request, creds);
        }

        conn.write_request(request)?;
        let resp = conn.read_response()?;
        let _ = conn.close();
        Ok(resp)
    }

    /// NTLM-authenticated HTTP/1.1 request: runs the Type1/Type2/Type3
    /// handshake on a single TLS connection. Both requests use
    /// `Connection: Keep-Alive` so the server doesn't drop after the
    /// 401 challenge.
    #[cfg(feature = "ntlm")]
    fn send_http1_ntlm<S>(
        &self,
        conn: &mut TlsConnection<S>,
        request: &HttpRequest,
        creds: &crate::ntlm::NtlmCredentials,
    ) -> Result<HttpResponse, TlsFetchError>
    where
        S: crate::Socket,
    {
        // 1. Build the Type1 negotiate request: clone the user's
        //    request, add Authorization: NTLM <Type1>, force
        //    Connection: Keep-Alive.
        let type1 = crate::ntlm::build_type1(creds)?;
        let mut req1 = request.clone();
        ntlm_set_header(&mut req1, "Authorization", &format!("NTLM {type1}"));
        ntlm_set_header(&mut req1, "Connection", "Keep-Alive");
        // The Type1/Type2 exchange is a no-op as far as the
        // application is concerned, so we send an empty body for the
        // first round-trip even if the original request had one. The
        // real body goes with the Type3.
        req1.body.clear();
        ntlm_set_header(&mut req1, "Content-Length", "0");

        conn.write_request(&req1)?;
        let resp1 = conn.read_response()?;
        if resp1.status != 401 {
            // Either the server doesn't require auth (lucky), or it
            // rejected us before the challenge. Pass the response
            // through unchanged either way.
            let _ = conn.close();
            return Ok(resp1);
        }
        let challenge_header = resp1
            .headers
            .get("www-authenticate")
            .ok_or_else(|| {
                TlsFetchError::Other("ntlm: 401 missing Www-Authenticate header".into())
            })?;
        let challenge_b64 = crate::ntlm::parse_challenge_header(challenge_header).ok_or_else(
            || TlsFetchError::Other(format!("ntlm: bad challenge: {challenge_header:?}")),
        )?;

        // 2. Build the Type3 authenticate request with the original
        //    body restored.
        let type3 = crate::ntlm::build_type3(creds, challenge_b64)?;
        let mut req2 = request.clone();
        ntlm_set_header(&mut req2, "Authorization", &format!("NTLM {type3}"));
        ntlm_set_header(&mut req2, "Connection", "Close");
        if !req2.body.is_empty() {
            let len = req2.body.len().to_string();
            ntlm_set_header(&mut req2, "Content-Length", &len);
        }

        conn.write_request(&req2)?;
        let resp2 = conn.read_response()?;
        let _ = conn.close();
        Ok(resp2)
    }
}

#[cfg(feature = "ntlm")]
fn ntlm_set_header(req: &mut HttpRequest, name: &str, value: &str) {
    req.headers
        .retain(|(k, _)| !k.eq_ignore_ascii_case(name));
    req.headers.push((name.to_string(), value.to_string()));
}

/// ALPN-driven protocol selection. The persona system sets
/// `opts.alpn` to its preferred ordering (Chrome: `["h2", "http/1.1"]`,
/// or `["h3", "h2", "http/1.1"]` if Alt-Svc cached H3 for this origin).
/// We pick the first candidate we implement. Plaintext (`http://` URL)
/// always means HTTP/1.1.
///
/// This replaces the always-`Http1` default that lived at the top of
/// `HttpClient::send`. The H2/H3 paths still drive their own TLS
/// handshake with their own ALPN list — so if the server doesn't
/// agree, those paths surface an error rather than silently falling
/// back. Callers that want a soft fallback should retry with
/// `force_protocol = Some(Http1)`.
pub(crate) fn select_protocol_from_alpn(alpn: Option<&[Vec<u8>]>, plaintext: bool) -> Protocol {
    if plaintext {
        return Protocol::Http1;
    }
    let alpn = alpn.unwrap_or(&[]);
    for cand in alpn {
        match cand.as_slice() {
            b"h3" => return Protocol::Http3,
            b"h2" => return Protocol::Http2,
            b"http/1.1" => return Protocol::Http1,
            _ => {}
        }
    }
    Protocol::Http1
}

#[cfg(test)]
mod alpn_select_tests {
    use super::*;

    #[test]
    fn plaintext_always_http1() {
        assert_eq!(
            select_protocol_from_alpn(Some(&[b"h2".to_vec()]), true),
            Protocol::Http1
        );
    }

    #[test]
    fn h2_when_alpn_lists_h2_first() {
        let alpn = vec![b"h2".to_vec(), b"http/1.1".to_vec()];
        assert_eq!(
            select_protocol_from_alpn(Some(&alpn), false),
            Protocol::Http2
        );
    }

    #[test]
    fn h3_when_alpn_lists_h3_first() {
        let alpn = vec![b"h3".to_vec(), b"h2".to_vec(), b"http/1.1".to_vec()];
        assert_eq!(
            select_protocol_from_alpn(Some(&alpn), false),
            Protocol::Http3
        );
    }

    #[test]
    fn http1_when_only_http11() {
        let alpn = vec![b"http/1.1".to_vec()];
        assert_eq!(
            select_protocol_from_alpn(Some(&alpn), false),
            Protocol::Http1
        );
    }

    #[test]
    fn unknown_alpn_falls_through_to_http1() {
        let alpn = vec![b"spdy/3.1".to_vec()];
        assert_eq!(
            select_protocol_from_alpn(Some(&alpn), false),
            Protocol::Http1
        );
    }

    #[test]
    fn empty_alpn_defaults_http1() {
        assert_eq!(select_protocol_from_alpn(None, false), Protocol::Http1);
    }
}
