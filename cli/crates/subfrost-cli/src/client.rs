//! `ApiClient` — a thin wrapper over tlsfetch's blocking `HttpClient` that
//! talks to subfrost.io's `/api/v1` REST surface and the `x-admin-secret`
//! bootstrap routes.
//!
//! Every request presents a Chrome 144 TLS fingerprint + `h2`/`http-1.1`
//! ALPN (so the origin sees a real browser handshake) and carries auth from
//! [`Config`] — `Authorization: Bearer <key>` when an api_key is set,
//! otherwise the shared `x-admin-secret` header. JSON helpers (`get_json` /
//! `post_json` / `patch_json` / `delete_json`) handle (de)serialization and
//! surface non-2xx responses as `anyhow` errors with the server's body text
//! attached. Query strings are passed by appending them to the `path`.

use anyhow::{anyhow, Context, Result};
use serde::Serialize;
use serde_json::Value;

use tlsfetch_common::{HttpClient, HttpRequest, KnownFingerprint, RequestOptions};
use tlsfetch_sys::TcpSocketFactory;

use crate::config::Config;

pub struct ApiClient {
    inner: HttpClient<TcpSocketFactory>,
    config: Config,
}

impl ApiClient {
    pub fn new(config: Config) -> Self {
        Self {
            inner: HttpClient::new(TcpSocketFactory::new()),
            config,
        }
    }

    /// Per-request options: Chrome 144 ClientHello, and (for `http://` base
    /// URLs, e.g. a local dev server) the plaintext path.
    ///
    /// ALPN offers `http/1.1` only. The subfrost.io ingress (tlsd) is
    /// HTTP/1.1-only on purpose (it forwards the inbound TLS fingerprint on the
    /// H1 path), so offering `h2` makes the client error with an ALPN mismatch
    /// when the server picks `http/1.1`. H1 is plenty for a CLI.
    fn request_opts(&self) -> RequestOptions {
        let mut opts = RequestOptions::default();
        if self.config.https {
            opts.fingerprint = Some(KnownFingerprint::Chrome144.into_fingerprint());
            opts.alpn = Some(vec![b"http/1.1".to_vec()]);
        } else {
            opts.plaintext = true;
        }
        opts
    }

    /// Attach the standard browser-ish + auth headers shared by every call.
    ///
    /// Auth: prefer a Bearer API key (`/api/v1` surface); fall back to the
    /// shared `x-admin-secret` header (bootstrap routes) when no key is set.
    fn decorate(&self, req: HttpRequest) -> HttpRequest {
        let req = match (&self.config.api_key, &self.config.admin_secret) {
            (Some(key), _) => req.header("authorization", &format!("Bearer {key}")),
            (None, Some(secret)) => req.header("x-admin-secret", secret),
            (None, None) => req,
        };
        req.header("accept", "application/json")
    }

    /// GET `path` and parse the JSON body. Errors on non-2xx.
    pub fn get_json(&self, path: &str) -> Result<Value> {
        let req = self.decorate(HttpRequest::get(&self.config.host, path));
        self.send_and_parse(path, req)
    }

    /// GET `path` and return the raw response body as a string (no JSON
    /// parsing). Errors on non-2xx. For routes that return non-JSON payloads
    /// such as `ledger.csv`.
    pub fn get_text(&self, path: &str) -> Result<String> {
        let req = self.decorate(HttpRequest::get(&self.config.host, path));
        let opts = self.request_opts();
        let resp = self
            .inner
            .send(&self.config.host, self.config.port, &req, &opts)
            .map_err(|e| anyhow!("HTTP request to {} failed: {e}", path))?;

        let body_text = String::from_utf8_lossy(&resp.body).to_string();

        if !(200..300).contains(&resp.status) {
            return Err(anyhow!(
                "{} returned HTTP {}: {}",
                path,
                resp.status,
                body_text.trim()
            ));
        }

        Ok(body_text)
    }

    /// POST `body` (serialized to JSON) to `path` and parse the JSON
    /// response. Errors on non-2xx.
    pub fn post_json<B: Serialize>(&self, path: &str, body: &B) -> Result<Value> {
        self.send_with_body("POST", path, Some(body))
    }

    /// PATCH `body` (serialized to JSON) to `path` and parse the JSON
    /// response. Errors on non-2xx.
    pub fn patch_json<B: Serialize>(&self, path: &str, body: &B) -> Result<Value> {
        self.send_with_body("PATCH", path, Some(body))
    }

    /// DELETE `path`, optionally with a JSON body, and parse the JSON
    /// response. Errors on non-2xx.
    pub fn delete_json<B: Serialize>(&self, path: &str, body: Option<&B>) -> Result<Value> {
        self.send_with_body("DELETE", path, body)
    }

    /// Shared builder for verbs that carry a method + optional JSON body.
    /// tlsfetch's `HttpRequest` exposes a public `method` field, so we build a
    /// POST then override the method rather than depend on dedicated
    /// constructors that don't exist upstream.
    fn send_with_body<B: Serialize>(
        &self,
        method: &str,
        path: &str,
        body: Option<&B>,
    ) -> Result<Value> {
        let payload = match body {
            Some(b) => serde_json::to_vec(b).context("serializing request body")?,
            None => Vec::new(),
        };
        let has_body = !payload.is_empty();
        let mut req = HttpRequest::post(&self.config.host, path, payload);
        req.method = method.to_string();
        let mut req = self.decorate(req);
        if has_body {
            req = req.header("content-type", "application/json");
        }
        self.send_and_parse(path, req)
    }

    /// POST raw bytes to `path` with an explicit `content-type` and any
    /// `extra_headers` (e.g. `X-File-Name`, `X-Folder-Id`). The body is sent
    /// verbatim — no JSON (de)serialization on the way in. The JSON response is
    /// parsed and returned. Mirrors `send_with_body` but takes raw bytes.
    pub fn post_bytes(
        &self,
        path: &str,
        content_type: &str,
        body: &[u8],
        extra_headers: &[(&str, &str)],
    ) -> Result<Value> {
        let mut req = HttpRequest::post(&self.config.host, path, body.to_vec());
        req.method = "POST".to_string();
        let mut req = self.decorate(req);
        req = req.header("content-type", content_type);
        for (k, v) in extra_headers {
            req = req.header(k, v);
        }
        self.send_and_parse(path, req)
    }

    /// GET an arbitrary absolute `https://`/`http://` URL and return the raw
    /// response bytes. Used to follow a short-lived signed GCS URL handed back
    /// by the `/files/:id` route. Reuses the same fingerprint/ALPN options as
    /// the API calls; the host/port are parsed out of the URL itself.
    pub fn get_url_bytes(&self, absolute_url: &str) -> Result<Vec<u8>> {
        let (scheme, rest) = absolute_url
            .split_once("://")
            .ok_or_else(|| anyhow!("URL must include a scheme: {absolute_url}"))?;
        let https = match scheme {
            "https" => true,
            "http" => false,
            other => return Err(anyhow!("unsupported scheme in URL: {other}")),
        };
        // Split authority from the path+query.
        let (authority, path_and_query) = match rest.find('/') {
            Some(idx) => (&rest[..idx], &rest[idx..]),
            None => (rest, "/"),
        };
        let (host, port) = match authority.rsplit_once(':') {
            Some((h, p)) => {
                let port: u16 = p
                    .parse()
                    .with_context(|| format!("invalid port in URL: {p}"))?;
                (h.to_string(), port)
            }
            None => (authority.to_string(), if https { 443 } else { 80 }),
        };

        // GCS signed URLs are virtual-hosted: set Host explicitly to the URL's
        // host (not the API host).
        let req = HttpRequest::get(&host, path_and_query).header("host", &host);

        // Plain TLS for external signed-URL fetches (e.g. storage.googleapis.com):
        // NO browser fingerprint — GCS's TLS stack rejects the Chrome ClientHello
        // (PQ key-share / extension set) with an UnexpectedMessage alert, and a
        // machine fetch of a pre-signed URL needs no bot-detection emulation.
        let mut opts = RequestOptions::default();
        if https {
            opts.alpn = Some(vec![b"http/1.1".to_vec()]);
        } else {
            opts.plaintext = true;
        }

        let resp = self
            .inner
            .send(&host, port, &req, &opts)
            .map_err(|e| anyhow!("HTTP request to {} failed: {e}", absolute_url))?;

        if !(200..300).contains(&resp.status) {
            let body_text = String::from_utf8_lossy(&resp.body);
            return Err(anyhow!(
                "{} returned HTTP {}: {}",
                absolute_url,
                resp.status,
                body_text.trim()
            ));
        }

        Ok(resp.body)
    }

    fn send_and_parse(&self, path: &str, req: HttpRequest) -> Result<Value> {
        let opts = self.request_opts();
        let resp = self
            .inner
            .send(&self.config.host, self.config.port, &req, &opts)
            .map_err(|e| anyhow!("HTTP request to {} failed: {e}", path))?;

        let body_text = String::from_utf8_lossy(&resp.body).to_string();

        if !(200..300).contains(&resp.status) {
            // Bubble up the server's error JSON/text — the admin routes
            // return `{"error": "..."}` with a meaningful status.
            return Err(anyhow!(
                "{} returned HTTP {}: {}",
                path,
                resp.status,
                body_text.trim()
            ));
        }

        if body_text.trim().is_empty() {
            return Ok(Value::Null);
        }

        serde_json::from_str(&body_text)
            .with_context(|| format!("parsing JSON response from {path}: {body_text}"))
    }
}
