//! GCS object proxy + GKE metadata-server access-token auth.
//!
//! Auth model (Workload Identity, no SA key material in the container):
//!   1. GET http://metadata.google.internal/computeMetadata/v1/instance/
//!         service-accounts/default/token   (Metadata-Flavor: Google)
//!      -> { access_token, expires_in, token_type }
//!   2. GET https://storage.googleapis.com/storage/v1/b/<bucket>/o/
//!         <urlencoded-object>?alt=media     (Authorization: Bearer <token>)
//!   The token is cached in-process until ~60s before it expires.
//!
//! The object body is STREAMED back (reqwest `stream` feature -> axum
//! `Body::from_stream`), so multi-GB media flows through without being
//! buffered in memory. The client `Range:` header is forwarded verbatim
//! and GCS's `206 Partial Content` + `Content-Range` are relayed back —
//! simpler and more correct than re-parsing ranges ourselves.

use std::sync::Arc;
use std::time::{Duration, Instant};

use axum::body::Body;
use axum::http::{HeaderMap, HeaderName, HeaderValue, StatusCode};
use axum::response::Response;
use serde::Deserialize;
use tokio::sync::RwLock;

const METADATA_TOKEN_URL: &str = "http://metadata.google.internal/computeMetadata/v1/instance/service-accounts/default/token";
const STORAGE_API: &str = "https://storage.googleapis.com/storage/v1/b";

/// Response headers we copy through from GCS so downstream caches /
/// Cloudflare behave the same as they did against the Go server.
const FORWARD_HEADERS: &[&str] = &[
    "content-type",
    "content-length",
    "content-range",
    "etag",
    "last-modified",
    "accept-ranges",
];

#[derive(Clone)]
pub struct GcsClient {
    http: reqwest::Client,
    token: Arc<RwLock<Option<CachedToken>>>,
}

#[derive(Clone)]
struct CachedToken {
    value: String,
    /// Instant after which we must refresh (expiry minus a 60s skew).
    refresh_after: Instant,
}

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
    expires_in: u64,
}

impl GcsClient {
    pub fn new() -> anyhow::Result<Self> {
        let http = reqwest::Client::builder()
            .connect_timeout(Duration::from_secs(5))
            // No global request timeout: large media streams can run long;
            // the upstream connect/read still bounds setup.
            .build()?;
        Ok(Self {
            http,
            token: Arc::new(RwLock::new(None)),
        })
    }

    /// Fetch (and cache) an OAuth access token from the GKE metadata
    /// server. Cached until ~60s before `expires_in`.
    async fn access_token(&self) -> anyhow::Result<String> {
        {
            let guard = self.token.read().await;
            if let Some(tok) = guard.as_ref() {
                if Instant::now() < tok.refresh_after {
                    return Ok(tok.value.clone());
                }
            }
        }

        let resp = self
            .http
            .get(METADATA_TOKEN_URL)
            .header("Metadata-Flavor", "Google")
            .timeout(Duration::from_secs(10))
            .send()
            .await?
            .error_for_status()?;
        let body: TokenResponse = resp.json().await?;

        // Refresh 60s before the real expiry (clamp tiny TTLs to 0).
        let lead = body.expires_in.saturating_sub(60);
        let cached = CachedToken {
            value: body.access_token.clone(),
            refresh_after: Instant::now() + Duration::from_secs(lead),
        };
        *self.token.write().await = Some(cached);
        Ok(body.access_token)
    }

    /// Proxy `gs://<bucket>/<object>` back to the client. Forwards the
    /// client `Range:` header; relays GCS's status + selected headers and
    /// streams the body. `extra` headers (CORS, cache, content-disposition)
    /// are appended last so they always win.
    pub async fn proxy_object(
        &self,
        bucket: &str,
        object: &str,
        req_headers: &HeaderMap,
        extra: Vec<(HeaderName, HeaderValue)>,
    ) -> Response {
        let token = match self.access_token().await {
            Ok(t) => t,
            Err(e) => {
                tracing::error!(error = %e, "metadata token fetch failed");
                return plain(StatusCode::SERVICE_UNAVAILABLE, "auth unavailable");
            }
        };

        let url = format!(
            "{STORAGE_API}/{}/o/{}?alt=media",
            urlencode(bucket),
            urlencode(object),
        );

        let mut builder = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .timeout(Duration::from_secs(60));
        // Forward the client's Range so GCS returns 206 + Content-Range.
        if let Some(range) = req_headers.get(axum::http::header::RANGE) {
            builder = builder.header(axum::http::header::RANGE, range);
        }
        if let Some(inm) = req_headers.get(axum::http::header::IF_NONE_MATCH) {
            builder = builder.header(axum::http::header::IF_NONE_MATCH, inm);
        }
        if let Some(ims) = req_headers.get(axum::http::header::IF_MODIFIED_SINCE) {
            builder = builder.header(axum::http::header::IF_MODIFIED_SINCE, ims);
        }

        let upstream = match builder.send().await {
            Ok(r) => r,
            Err(e) => {
                tracing::error!(error = %e, bucket, object, "gcs request failed");
                return plain(StatusCode::BAD_GATEWAY, "upstream error");
            }
        };

        let status = upstream.status();
        if status == StatusCode::NOT_FOUND {
            return plain(StatusCode::NOT_FOUND, "not found");
        }
        // 304/206/200/416 all relay through. Anything 5xx from GCS -> 502.
        if status.is_server_error() {
            tracing::error!(%status, bucket, object, "gcs upstream 5xx");
            return plain(StatusCode::BAD_GATEWAY, "upstream error");
        }

        let mut builder = Response::builder().status(status);
        let resp_headers = builder.headers_mut().unwrap();

        // Copy through the content/cache-relevant headers from GCS.
        for name in FORWARD_HEADERS {
            if let Some(v) = upstream.headers().get(*name) {
                if let Ok(hn) = HeaderName::from_bytes(name.as_bytes()) {
                    resp_headers.insert(hn, v.clone());
                }
            }
        }
        // Append caller-supplied headers last (they override).
        for (k, v) in extra {
            resp_headers.insert(k, v);
        }

        let stream = upstream.bytes_stream();
        builder
            .body(Body::from_stream(stream))
            .unwrap_or_else(|_| plain(StatusCode::INTERNAL_SERVER_ERROR, "internal error"))
    }

    /// Fetch a whole object into memory (for markdown render of small .md
    /// files). Returns None on 404, Err on other failures.
    pub async fn fetch_bytes(
        &self,
        bucket: &str,
        object: &str,
    ) -> anyhow::Result<Option<bytes::Bytes>> {
        let token = self.access_token().await?;
        let url = format!(
            "{STORAGE_API}/{}/o/{}?alt=media",
            urlencode(bucket),
            urlencode(object),
        );
        let resp = self
            .http
            .get(&url)
            .bearer_auth(&token)
            .timeout(Duration::from_secs(30))
            .send()
            .await?;
        if resp.status() == StatusCode::NOT_FOUND {
            return Ok(None);
        }
        let resp = resp.error_for_status()?;
        Ok(Some(resp.bytes().await?))
    }
}

/// Percent-encode an object path so slashes become `%2F` (the GCS JSON
/// API object id is a single, fully-encoded path segment).
fn urlencode(s: &str) -> String {
    let mut out = String::with_capacity(s.len() * 3);
    for b in s.bytes() {
        match b {
            b'A'..=b'Z' | b'a'..=b'z' | b'0'..=b'9' | b'-' | b'_' | b'.' | b'~' => {
                out.push(b as char)
            }
            _ => out.push_str(&format!("%{b:02X}")),
        }
    }
    out
}

pub fn plain(status: StatusCode, msg: &str) -> Response {
    Response::builder()
        .status(status)
        .header(axum::http::header::CONTENT_TYPE, "text/plain; charset=utf-8")
        .header(axum::http::header::ACCESS_CONTROL_ALLOW_ORIGIN, "*")
        .body(Body::from(msg.to_string()))
        .unwrap()
}
