//! subfrost-cdn — Rust container port of the Go cdn-server
//! (cdn.subfrost.io). Fronts two GCS buckets behind tlsd.
//!
//! Routes (mirroring the Go `http.ServeMux`):
//!   /alkanes/*    -> assets bucket, stream
//!   /docs/*       -> cdn bucket; .md -> styled HTML for browsers (?raw=1 forces raw)
//!   /media/*      -> cdn bucket, stream inline
//!   /raw/*        -> cdn bucket, always raw (/raw/docs/x -> docs/x)
//!   /releases/*   -> cdn bucket, Content-Disposition: attachment
//!   /snapshots/*  -> 302 to storage.googleapis.com (multi-GB, range-direct)
//!   /secure/*     -> HMAC-token gated cdn-bucket object (replaces /private basic-auth)
//!   /health, /    -> JSON banners
//!
//! Every response carries CORS (`Access-Control-Allow-Origin: *`) and the
//! proxied objects get `Cache-Control: public, max-age=86400`.

use std::sync::Arc;

use axum::{
    body::Body,
    extract::{RawQuery, State},
    http::{header, HeaderMap, HeaderName, HeaderValue, Method, StatusCode, Uri},
    response::Response,
    routing::any,
    Router,
};
use tower_http::trace::TraceLayer;
use tracing_subscriber::{fmt, prelude::*, EnvFilter};

mod config;
mod gcs;
mod markdown;
mod secure;

use config::Config;
use gcs::{plain, GcsClient};

#[derive(Clone)]
struct AppState {
    cfg: Arc<Config>,
    gcs: GcsClient,
}

#[tokio::main]
async fn main() -> anyhow::Result<()> {
    tracing_subscriber::registry()
        .with(
            EnvFilter::try_from_default_env()
                .unwrap_or_else(|_| EnvFilter::new("subfrost_cdn=info,tower_http=info")),
        )
        .with(fmt::layer())
        .init();

    let cfg = Config::from_env();
    tracing::info!(
        bind = %cfg.bind,
        assets_bucket = %cfg.assets_bucket,
        cdn_bucket = %cfg.cdn_bucket,
        secure_configured = !cfg.secure_hmac_key.is_empty(),
        "subfrost-cdn starting"
    );

    let state = AppState {
        cfg: Arc::new(cfg.clone()),
        gcs: GcsClient::new()?,
    };

    // A single catch-all so we control prefix routing exactly like the Go
    // ServeMux (axum's path matcher won't express "/raw/<anything incl
    // slashes>" as cleanly).
    let app = Router::new()
        .route("/", any(dispatch))
        .route("/*rest", any(dispatch))
        .layer(TraceLayer::new_for_http())
        .with_state(state);

    let listener = tokio::net::TcpListener::bind(&cfg.bind).await?;
    tracing::info!("listening on {}", cfg.bind);
    axum::serve(listener, app)
        .with_graceful_shutdown(shutdown())
        .await?;
    Ok(())
}

async fn shutdown() {
    let _ = tokio::signal::ctrl_c().await;
    tracing::info!("shutdown signal received");
}

/// Build the three CORS headers the Go `corsMiddleware` set on every
/// response.
fn cors() -> Vec<(HeaderName, HeaderValue)> {
    vec![
        (
            header::ACCESS_CONTROL_ALLOW_ORIGIN,
            HeaderValue::from_static("*"),
        ),
        (
            header::ACCESS_CONTROL_ALLOW_METHODS,
            HeaderValue::from_static("GET, HEAD, OPTIONS"),
        ),
        (
            header::ACCESS_CONTROL_ALLOW_HEADERS,
            HeaderValue::from_static("Content-Type"),
        ),
    ]
}

const CACHE_24H: &str = "public, max-age=86400";

/// Top-level dispatch — the wasip2/Go ServeMux equivalent.
async fn dispatch(
    State(state): State<AppState>,
    method: Method,
    uri: Uri,
    RawQuery(query): RawQuery,
    headers: HeaderMap,
) -> Response {
    let path = uri.path().to_string();

    // CORS preflight (Go: OPTIONS -> 204).
    if method == Method::OPTIONS {
        return with_cors(Response::builder().status(StatusCode::NO_CONTENT))
            .body(Body::empty())
            .unwrap();
    }
    // Only GET/HEAD served (Go advertises "GET, HEAD, OPTIONS").
    if method != Method::GET && method != Method::HEAD {
        return plain(StatusCode::METHOD_NOT_ALLOWED, "method not allowed");
    }

    match route(&state, &path, query.as_deref(), &headers).await {
        Ok(resp) => resp,
        Err(resp) => resp,
    }
}

async fn route(
    state: &AppState,
    path: &str,
    query: Option<&str>,
    headers: &HeaderMap,
) -> Result<Response, Response> {
    let cfg = &state.cfg;

    if path == "/health" {
        return Ok(json(StatusCode::OK, r#"{"status":"ok"}"#));
    }
    if path == "/" {
        return Ok(json(
            StatusCode::OK,
            r#"{"service":"subfrost-cdn","routes":["/alkanes/*","/docs/*","/media/*","/raw/*","/releases/*","/snapshots/*","/secure/*","/health"]}"#,
        ));
    }

    // Object key = full URL path minus the leading '/', matching the Go
    // cdn-server (objectPath := TrimPrefix(r.URL.Path, "/")): the
    // /alkanes|docs|media|releases|snapshots/* routes KEEP their first
    // segment as the GCS object key (e.g. /alkanes/mainnet/0-0.png ->
    // object "alkanes/mainnet/0-0.png"). Only /raw/ and /secure/ strip
    // their prefix. `strip(..).is_some()` is reused purely to detect a
    // non-empty remainder after the prefix; the object passed is `full`.
    let full = &path[1..]; // path always begins with '/' here

    if strip(path, "/alkanes/").is_some() {
        return Ok(proxy(state, &cfg.assets_bucket, full, headers, base_headers()).await);
    }
    if strip(path, "/docs/").is_some() {
        return Ok(handle_docs(state, full, query, headers).await);
    }
    if strip(path, "/media/").is_some() {
        return Ok(proxy(state, &cfg.cdn_bucket, full, headers, base_headers()).await);
    }
    if strip(path, "/releases/").is_some() {
        // Force a download with a filename matching the last segment.
        let mut extra = base_headers();
        if let Some(name) = full.rsplit('/').next().filter(|s| !s.is_empty()) {
            if let Ok(v) =
                HeaderValue::from_str(&format!("attachment; filename=\"{name}\""))
            {
                extra.push((header::CONTENT_DISPOSITION, v));
            }
        }
        return Ok(proxy(state, &cfg.cdn_bucket, full, headers, extra).await);
    }
    if let Some(obj) = strip(path, "/raw/") {
        // /raw/docs/foo.md -> docs/foo.md, always raw.
        return Ok(proxy(state, &cfg.cdn_bucket, obj, headers, base_headers()).await);
    }
    if strip(path, "/snapshots/").is_some() {
        return Ok(handle_snapshots(&cfg.cdn_bucket, full));
    }
    if let Some(obj) = strip(path, "/secure/") {
        return Ok(handle_secure(state, obj, query, headers).await);
    }

    Ok(plain(StatusCode::NOT_FOUND, "not found"))
}

/// `/docs/*` — markdown render for browsers, raw stream otherwise.
async fn handle_docs(
    state: &AppState,
    object: &str,
    query: Option<&str>,
    headers: &HeaderMap,
) -> Response {
    let wants_raw = query_flag(query, "raw") == Some("1".to_string());
    let is_md = object.to_ascii_lowercase().ends_with(".md");
    let wants_html = accepts_html(headers);

    if is_md && wants_html && !wants_raw {
        match state.gcs.fetch_bytes(&state.cfg.cdn_bucket, object).await {
            Ok(Some(b)) => {
                let md = String::from_utf8_lossy(&b);
                let filename = object.rsplit('/').next().unwrap_or(object);
                let title = filename.strip_suffix(".md").unwrap_or(filename);
                let raw_url = format!("/raw/{object}");
                let dpath = format!("/{object}");
                let html = markdown::render(&md, title, &raw_url, &dpath);
                let mut b = Response::builder()
                    .status(StatusCode::OK)
                    .header(header::CONTENT_TYPE, "text/html; charset=utf-8")
                    .header(header::CACHE_CONTROL, "public, max-age=3600");
                for (k, v) in cors() {
                    b = b.header(k, v);
                }
                return b.body(Body::from(html)).unwrap();
            }
            Ok(None) => return plain(StatusCode::NOT_FOUND, "not found"),
            Err(e) => {
                tracing::error!(error = %e, object, "markdown fetch failed");
                return plain(StatusCode::INTERNAL_SERVER_ERROR, "internal error");
            }
        }
    }
    proxy(state, &state.cfg.cdn_bucket, object, headers, base_headers()).await
}

/// `/snapshots/*` — 302 to public GCS so the client follows with its
/// `Range:` intact (multi-GB tarballs).
fn handle_snapshots(bucket: &str, object: &str) -> Response {
    if object.is_empty() {
        return plain(StatusCode::BAD_REQUEST, "missing object path");
    }
    let target = format!("https://storage.googleapis.com/{bucket}/{object}");
    let mut b = Response::builder()
        .status(StatusCode::FOUND)
        .header(header::LOCATION, target)
        .header(header::CACHE_CONTROL, CACHE_24H);
    for (k, v) in cors() {
        b = b.header(k, v);
    }
    b.body(Body::empty()).unwrap()
}

/// `/secure/*` — HMAC-token gate, then proxy from the cdn bucket.
async fn handle_secure(
    state: &AppState,
    object: &str,
    query: Option<&str>,
    headers: &HeaderMap,
) -> Response {
    if object.is_empty() {
        return plain(StatusCode::BAD_REQUEST, "missing object path");
    }
    let (exp, sig) = secure_token(query, headers);
    let now = chrono::Utc::now().timestamp();

    match secure::verify(&state.cfg.secure_hmac_key, object, exp, sig.as_deref(), now) {
        Ok(()) => {
            // Suggest a download filename like the Go /private path did.
            let mut extra = base_headers();
            if let Some(name) = object.rsplit('/').next().filter(|s| !s.is_empty()) {
                if let Ok(v) =
                    HeaderValue::from_str(&format!("attachment; filename=\"{name}\""))
                {
                    extra.push((header::CONTENT_DISPOSITION, v));
                }
            }
            proxy(state, &state.cfg.cdn_bucket, object, headers, extra).await
        }
        Err(denied) => {
            // 401, no WWW-Authenticate (token-based, not Basic).
            plain(StatusCode::UNAUTHORIZED, denied.message())
        }
    }
}

/// Extract `(exp, sig)` from `?exp=&sig=` or an `Authorization: Bearer
/// <exp>.<sig>` header.
fn secure_token(query: Option<&str>, headers: &HeaderMap) -> (Option<i64>, Option<String>) {
    let exp = query_flag(query, "exp").and_then(|v| v.parse::<i64>().ok());
    let sig = query_flag(query, "sig");
    if exp.is_some() && sig.is_some() {
        return (exp, sig);
    }
    // Authorization: Bearer <exp>.<sig>
    if let Some(auth) = headers.get(header::AUTHORIZATION) {
        if let Ok(s) = auth.to_str() {
            let token = s.strip_prefix("Bearer ").unwrap_or(s);
            if let Some((e, g)) = token.split_once('.') {
                return (e.parse::<i64>().ok(), Some(g.to_string()));
            }
        }
    }
    (exp, sig)
}

/// Core proxy wrapper: validate non-empty object then stream from GCS.
async fn proxy(
    state: &AppState,
    bucket: &str,
    object: &str,
    headers: &HeaderMap,
    extra: Vec<(HeaderName, HeaderValue)>,
) -> Response {
    if object.is_empty() {
        return plain(StatusCode::BAD_REQUEST, "missing object path");
    }
    state.gcs.proxy_object(bucket, object, headers, extra).await
}

// ---- helpers ----------------------------------------------------------

/// CORS + 24h cache + accept-ranges — the header set every proxied object
/// carries.
fn base_headers() -> Vec<(HeaderName, HeaderValue)> {
    let mut h = cors();
    h.push((header::CACHE_CONTROL, HeaderValue::from_static(CACHE_24H)));
    h.push((header::ACCEPT_RANGES, HeaderValue::from_static("bytes")));
    h
}

fn with_cors(mut b: axum::http::response::Builder) -> axum::http::response::Builder {
    for (k, v) in cors() {
        b = b.header(k, v);
    }
    b
}

fn json(status: StatusCode, body: &'static str) -> Response {
    let mut b = Response::builder()
        .status(status)
        .header(header::CONTENT_TYPE, "application/json");
    for (k, v) in cors() {
        b = b.header(k, v);
    }
    b.body(Body::from(body)).unwrap()
}

/// `strip(path, "/docs/")` -> Some("file") if path starts with the prefix
/// and there's a non-empty remainder. The remainder may contain slashes.
fn strip<'a>(path: &'a str, prefix: &str) -> Option<&'a str> {
    path.strip_prefix(prefix).filter(|s| !s.is_empty())
}

fn accepts_html(headers: &HeaderMap) -> bool {
    headers
        .get(header::ACCEPT)
        .and_then(|v| v.to_str().ok())
        .map(|v| v.contains("text/html"))
        .unwrap_or(false)
}

/// Pull a single query param value (raw, undecoded — our keys/values are
/// simple unix ints / base64url sigs that need no percent-decoding).
fn query_flag(query: Option<&str>, key: &str) -> Option<String> {
    let q = query?;
    for pair in q.split('&') {
        if let Some((k, v)) = pair.split_once('=') {
            if k == key {
                return Some(v.to_string());
            }
        } else if pair == key {
            return Some(String::new());
        }
    }
    None
}
