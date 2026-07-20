//! GCS object access over `wasi:http/outgoing-handler`, authenticated with a
//! GKE metadata-server token (Workload Identity — no SA-key JSON, which the
//! wasm sandbox couldn't read anyway: it has no filesystem).
//!
//! Ported from the axum `rust/services/cdn/src/gcs.rs` — same URLs and verbs,
//! but synchronous and buffered (no reqwest/tokio, no streaming). The token is
//! fetched once per `Gcs` (i.e. once per request, since tlsd instantiates the
//! component fresh per request) and reused across the several GCS calls a
//! single `/alkanes` resolve makes.

use serde::Deserialize;

use crate::http::{request, Resp};
use crate::wasi::http::types::{Method, Scheme};

const METADATA_HOST: &str = "metadata.google.internal";
const METADATA_TOKEN_PATH: &str =
    "/computeMetadata/v1/instance/service-accounts/default/token";
const STORAGE_HOST: &str = "storage.googleapis.com";

/// Response headers copied through when proxying an object, so downstream
/// caches behave as they did against the Go/axum server.
pub const FORWARD_HEADERS: &[&str] = &[
    "content-type",
    "content-length",
    "content-range",
    "etag",
    "last-modified",
    "accept-ranges",
];

#[derive(Deserialize)]
struct TokenResponse {
    access_token: String,
}

/// One object in a GCS bucket `objects.list` response.
#[derive(Deserialize, Default)]
pub struct ListItem {
    pub name: String,
    #[serde(default)]
    pub size: String,
    #[serde(default)]
    pub updated: String,
}

#[derive(Deserialize, Default)]
struct ListResponse {
    #[serde(default)]
    items: Vec<ListItem>,
    #[serde(default)]
    prefixes: Vec<String>,
}

/// Result of a delimiter list: `prefixes` are subdirectories, `items` are files.
pub struct Listing {
    pub prefixes: Vec<String>,
    pub items: Vec<ListItem>,
}

pub struct Gcs {
    token: String,
}

impl Gcs {
    /// Fetch a fresh access token from the metadata server.
    pub fn new() -> Result<Self, String> {
        let resp = request(
            Method::Get,
            Scheme::Http,
            METADATA_HOST,
            METADATA_TOKEN_PATH,
            &[("metadata-flavor", b"Google")],
            None,
        )?;
        if resp.status != 200 {
            return Err(format!("metadata token status {}", resp.status));
        }
        let tok: TokenResponse =
            serde_json::from_slice(&resp.body).map_err(|e| format!("token json: {e}"))?;
        Ok(Self {
            token: tok.access_token,
        })
    }

    fn bearer(&self) -> String {
        format!("Bearer {}", self.token)
    }

    /// GET a media object, forwarding the caller's conditional/range headers.
    /// The returned `Resp` is relayed verbatim by the proxy handler.
    pub fn get_object(&self, bucket: &str, object: &str, fwd: &[(&str, &[u8])]) -> Result<Resp, String> {
        let path = format!(
            "/storage/v1/b/{}/o/{}?alt=media",
            urlencode(bucket),
            urlencode(object)
        );
        let auth = self.bearer();
        let mut headers: Vec<(&str, &[u8])> = vec![("authorization", auth.as_bytes())];
        headers.extend_from_slice(fwd);
        request(Method::Get, Scheme::Https, STORAGE_HOST, &path, &headers, None)
    }

    /// Fetch a whole object into memory. `None` on 404.
    pub fn fetch_bytes(&self, bucket: &str, object: &str) -> Result<Option<Vec<u8>>, String> {
        let resp = self.get_object(bucket, object, &[])?;
        match resp.status {
            404 => Ok(None),
            200 => Ok(Some(resp.body)),
            s => Err(format!("gcs get {object} status {s}")),
        }
    }

    /// Fetch object + its GCS `generation` (from `x-goog-generation`), for the
    /// manifest read-modify-write. `None` on 404.
    pub fn fetch_with_generation(
        &self,
        bucket: &str,
        object: &str,
    ) -> Result<Option<(Vec<u8>, i64)>, String> {
        let resp = self.get_object(bucket, object, &[])?;
        match resp.status {
            404 => Ok(None),
            200 => {
                let gen = resp
                    .header("x-goog-generation")
                    .and_then(|v| v.parse::<i64>().ok())
                    .unwrap_or(0);
                Ok(Some((resp.body, gen)))
            }
            s => Err(format!("gcs get {object} status {s}")),
        }
    }

    /// Cheap existence check (metadata GET, no media). 404 => false.
    pub fn object_exists(&self, bucket: &str, object: &str) -> Result<bool, String> {
        let path = format!(
            "/storage/v1/b/{}/o/{}?fields=name",
            urlencode(bucket),
            urlencode(object)
        );
        let auth = self.bearer();
        let resp = request(
            Method::Get,
            Scheme::Https,
            STORAGE_HOST,
            &path,
            &[("authorization", auth.as_bytes())],
            None,
        )?;
        match resp.status {
            404 => Ok(false),
            200 => Ok(true),
            s => Err(format!("gcs exists {object} status {s}")),
        }
    }

    /// Object size in bytes via a metadata GET (`fields=size`). `None` on 404.
    /// Used to 302-redirect objects over the component's buffered-response cap
    /// instead of trying (and failing) to buffer them.
    pub fn object_size(&self, bucket: &str, object: &str) -> Result<Option<u64>, String> {
        let path = format!(
            "/storage/v1/b/{}/o/{}?fields=size",
            urlencode(bucket),
            urlencode(object)
        );
        let auth = self.bearer();
        let resp = request(
            Method::Get,
            Scheme::Https,
            STORAGE_HOST,
            &path,
            &[("authorization", auth.as_bytes())],
            None,
        )?;
        match resp.status {
            404 => Ok(None),
            200 => {
                let v: serde_json::Value =
                    serde_json::from_slice(&resp.body).map_err(|e| format!("size json: {e}"))?;
                let sz = v
                    .get("size")
                    .and_then(|s| s.as_str())
                    .and_then(|s| s.parse::<u64>().ok())
                    .unwrap_or(0);
                Ok(Some(sz))
            }
            s => Err(format!("gcs size {object} status {s}")),
        }
    }

    /// Upload (create/replace) via the simple-media endpoint.
    /// `if_generation_match`: Some(0)=only-if-absent, Some(n)=atomic RMW,
    /// None=unconditional. Returns Ok(false) on 412 (precondition failed).
    pub fn upload(
        &self,
        bucket: &str,
        object: &str,
        body: Vec<u8>,
        content_type: &str,
        if_generation_match: Option<i64>,
    ) -> Result<bool, String> {
        let mut path = format!(
            "/upload/storage/v1/b/{}/o?uploadType=media&name={}",
            urlencode(bucket),
            urlencode(object)
        );
        if let Some(g) = if_generation_match {
            path.push_str(&format!("&ifGenerationMatch={g}"));
        }
        let auth = self.bearer();
        let resp = request(
            Method::Post,
            Scheme::Https,
            STORAGE_HOST,
            &path,
            &[
                ("authorization", auth.as_bytes()),
                ("content-type", content_type.as_bytes()),
            ],
            Some(&body),
        )?;
        match resp.status {
            412 => Ok(false),
            s if (200..300).contains(&s) => Ok(true),
            s => Err(format!("gcs upload {object} status {s}")),
        }
    }

    /// List objects under `prefix` with `/` delimiter → (subdir prefixes, files).
    pub fn list(&self, bucket: &str, prefix: &str) -> Result<Listing, String> {
        let path = format!(
            "/storage/v1/b/{}/o?delimiter=%2F&prefix={}",
            urlencode(bucket),
            urlencode(prefix)
        );
        let auth = self.bearer();
        let resp = request(
            Method::Get,
            Scheme::Https,
            STORAGE_HOST,
            &path,
            &[("authorization", auth.as_bytes())],
            None,
        )?;
        if resp.status != 200 {
            return Err(format!("gcs list {prefix} status {}", resp.status));
        }
        let parsed: ListResponse =
            serde_json::from_slice(&resp.body).map_err(|e| format!("list json: {e}"))?;
        Ok(Listing {
            prefixes: parsed.prefixes,
            items: parsed.items,
        })
    }
}

/// Percent-encode a path segment so slashes become `%2F` (the GCS JSON API
/// object id is a single fully-encoded segment). Matches the axum server.
pub fn urlencode(s: &str) -> String {
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
