//! subfrost-cdn-wasm — the wasip2 implementation of cdn.subfrost.io.
//!
//! A `wasi:http/incoming-handler` component that tlsd dispatches `cdn.subfrost.io`
//! to (via `app_id = "subfrost_cdn"`). tlsd IS the serving stack — nothing sits
//! behind it. Responsibilities:
//!
//!   * `/alkanes/<block>_<tx>` — opportunistic on-chain GetData: serve curated
//!     art, else the saved capture, else a live `simulate` (opcode 1000 or the
//!     `__meta`-declared data opcode) against `$METASHREW_URL` (/v4/subfrost),
//!     saving the image to the assets bucket on first resolve. See onchain.rs.
//!   * GCS object proxy (`/alkanes/*`, `/docs/*`, `/media/*`, `/raw/*`,
//!     `/releases/*`) — buffered GET with Workload-Identity token auth; objects
//!     over the response cap are 302'd to GCS.
//!   * subfrost-themed autoindex on directory (`.../`) paths (render.rs).
//!   * `/docs/*.md` — markdown render for browsers.
//!   * `/secure/*` — HMAC-token gate (key from env `SECURE_HMAC_KEY`).
//!   * `/snapshots/*` — 302 to storage.googleapis.com. `/health`, `/`.
//!
//! Config comes from the tlsd pod env via `wasi:cli/environment`
//! (`inherit_env`): GCS_BUCKET, CDN_BUCKET, METASHREW_URL, ALKANE_MANIFEST_OBJECT,
//! ALKANE_ONCHAIN_ENABLED, SECURE_HMAC_KEY.

wit_bindgen::generate!({
    path: "wit",
    world: "wasi:http/proxy",
    with: {
        "wasi:http/types@0.2.1": generate,
        "wasi:http/incoming-handler@0.2.1": generate,
        "wasi:http/outgoing-handler@0.2.1": generate,
        "wasi:io/poll@0.2.1": generate,
        "wasi:io/error@0.2.1": generate,
        "wasi:io/streams@0.2.1": generate,
        "wasi:clocks/monotonic-clock@0.2.1": generate,
        "wasi:clocks/wall-clock@0.2.1": generate,
        "wasi:random/random@0.2.1": generate,
        "wasi:cli/stdin@0.2.1": generate,
        "wasi:cli/stdout@0.2.1": generate,
        "wasi:cli/stderr@0.2.1": generate,
    },
});

mod alkanes;
mod gcs;
mod http;
mod manifest;
mod onchain;
mod render;

use exports::wasi::http::incoming_handler::Guest;
use wasi::http::types::{Fields, IncomingRequest, Method, OutgoingBody, OutgoingResponse, ResponseOutparam};

use alkanes::AlkaneChain;
use gcs::{Gcs, FORWARD_HEADERS};
use onchain::{Onchain, Serve};

/// Objects larger than this are 302-redirected instead of buffered — tlsd caps
/// the component's response body at 64 MiB. Alkane images / docs / manifests
/// are far smaller; this only affects large media/release binaries.
const MAX_PROXY_BYTES: u64 = 48 * 1024 * 1024;

// ---------------------------------------------------------------------
// config (from pod env via wasi:cli/environment)
// ---------------------------------------------------------------------

struct Cfg {
    assets_bucket: String,
    cdn_bucket: String,
    metashrew_url: String,
    manifest_object: String,
    onchain_enabled: bool,
    secure_hmac_key: Vec<u8>,
}

fn env_or(key: &str, fallback: &str) -> String {
    match std::env::var(key) {
        Ok(v) if !v.is_empty() => v,
        _ => fallback.to_string(),
    }
}

fn load_cfg() -> Cfg {
    Cfg {
        assets_bucket: env_or("GCS_BUCKET", "alkane-assets-bucket"),
        cdn_bucket: env_or("CDN_BUCKET", "subfrost-cdn-bucket"),
        metashrew_url: env_or("METASHREW_URL", "https://mainnet.subfrost.io/v4/subfrost"),
        manifest_object: env_or("ALKANE_MANIFEST_OBJECT", "alkanes/manifest.json"),
        onchain_enabled: std::env::var("ALKANE_ONCHAIN_ENABLED")
            .map(|v| v != "0" && !v.eq_ignore_ascii_case("false"))
            .unwrap_or(true),
        secure_hmac_key: std::env::var("SECURE_HMAC_KEY").unwrap_or_default().into_bytes(),
    }
}

struct Component;

impl Guest for Component {
    fn handle(request: IncomingRequest, response_out: ResponseOutparam) {
        let method = request.method();
        let path_with_query = request.path_with_query().unwrap_or_else(|| "/".to_string());
        let path = path_with_query.split('?').next().unwrap_or("/").to_string();

        if matches!(method, Method::Options) {
            respond(response_out, 204, cors_headers(), b"");
            return;
        }
        if !matches!(method, Method::Get | Method::Head) {
            respond(response_out, 405, cors_headers(), b"method not allowed");
            return;
        }

        let cfg = load_cfg();
        route(&cfg, &path, &request, response_out);
    }
}

fn route(cfg: &Cfg, path: &str, request: &IncomingRequest, out: ResponseOutparam) {
    match () {
        _ if path == "/health" => {
            let mut h = json_headers();
            respond_h(out, 200, &mut h, br#"{"status":"ok"}"#);
        }
        _ if path == "/" => {
            let mut h = json_headers();
            respond_h(out, 200, &mut h, br#"{"service":"subfrost-cdn","routes":["/alkanes/*","/docs/*","/media/*","/raw/*","/releases/*","/snapshots/*","/secure/*","/health"]}"#);
        }

        _ if path.starts_with("/alkanes/") => handle_alkanes(cfg, path, request, out),
        _ if path.starts_with("/docs/") => handle_docs(cfg, trim_leading_slash(path), request, out),
        _ if path.starts_with("/media/") => {
            proxy_or_index(cfg, &cfg.cdn_bucket, trim_leading_slash(path), request, out)
        }
        _ if path.starts_with("/releases/") => {
            proxy_or_index(cfg, &cfg.cdn_bucket, trim_leading_slash(path), request, out)
        }
        _ if path.starts_with("/raw/") => {
            // /raw/docs/foo.md -> docs/foo.md in CDN_BUCKET, always raw.
            proxy(cfg, &cfg.cdn_bucket, path.trim_start_matches("/raw/"), request, out)
        }
        _ if path.starts_with("/snapshots/") => {
            handle_snapshots(&cfg.cdn_bucket, trim_leading_slash(path), out)
        }
        _ if path.starts_with("/secure/") => handle_secure(cfg, path, request, out),

        _ => respond(out, 404, cors_headers(), b"not found"),
    }
}

// ---------------------------------------------------------------------
// /alkanes
// ---------------------------------------------------------------------

fn handle_alkanes(cfg: &Cfg, path: &str, request: &IncomingRequest, out: ResponseOutparam) {
    let rest = &path["/alkanes/".len()..];

    // Ordiscan-compat icon form: /alkanes/<block>_<tx> (digits, one underscore).
    if let Some((block, tx)) = parse_block_tx(rest) {
        let legacy = format!("alkanes/mainnet/{block}-{tx}.png");
        if cfg.onchain_enabled {
            match AlkaneChain::new(&cfg.metashrew_url).and_then(|chain| {
                Gcs::new().map(|g| {
                    Onchain::new(chain, g, cfg.assets_bucket.clone(), cfg.manifest_object.clone())
                })
            }) {
                Ok(oc) => match oc.serve(block, tx) {
                    Serve::Stored(obj) => proxy(cfg, &cfg.assets_bucket, &obj, request, out),
                    Serve::Bytes { data, mime } => emit_image(out, &data, &mime, 300),
                    Serve::Fallthrough => proxy(cfg, &cfg.assets_bucket, &legacy, request, out),
                },
                // Chain/GCS setup failed — degrade to legacy (curated file or 404).
                Err(_) => proxy(cfg, &cfg.assets_bucket, &legacy, request, out),
            }
            return;
        }
        proxy(cfg, &cfg.assets_bucket, &legacy, request, out);
        return;
    }

    // Non-icon path: directory listing for `.../`, else a literal object.
    proxy_or_index(cfg, &cfg.assets_bucket, rest, request, out);
}

/// Parse the `<block>_<tx>` icon form: digits, exactly one underscore, no
/// extension. Equivalent to the Worker regex `^/alkanes/(\d+)_(\d+)$`.
fn parse_block_tx(rest: &str) -> Option<(u128, u128)> {
    let (b, t) = rest.split_once('_')?;
    if b.is_empty()
        || t.is_empty()
        || !b.bytes().all(|c| c.is_ascii_digit())
        || !t.bytes().all(|c| c.is_ascii_digit())
    {
        return None;
    }
    Some((b.parse().ok()?, t.parse().ok()?))
}

// ---------------------------------------------------------------------
// /docs, /snapshots, /secure
// ---------------------------------------------------------------------

fn handle_docs(cfg: &Cfg, object: &str, request: &IncomingRequest, out: ResponseOutparam) {
    if object.is_empty() || object.ends_with('/') {
        autoindex(&cfg.cdn_bucket, object, out);
        return;
    }
    let pq = request.path_with_query().unwrap_or_default();
    let wants_raw = pq.contains("raw=1");
    let is_md = object.to_ascii_lowercase().ends_with(".md");
    let wants_html = request_accepts_html(request);

    if is_md && wants_html && !wants_raw {
        let gcs = match Gcs::new() {
            Ok(g) => g,
            Err(_) => return respond(out, 503, cors_headers(), b"auth unavailable"),
        };
        match gcs.fetch_bytes(&cfg.cdn_bucket, object) {
            Ok(Some(bytes)) => {
                let md = String::from_utf8_lossy(&bytes);
                let raw_url = format!("/raw/{object}");
                let html = render::markdown(&md, object, &raw_url, object);
                let mut h = html_headers();
                respond_h(out, 200, &mut h, html.as_bytes());
            }
            Ok(None) => respond(out, 404, cors_headers(), b"not found"),
            Err(_) => respond(out, 502, cors_headers(), b"upstream error"),
        }
        return;
    }
    proxy(cfg, &cfg.cdn_bucket, object, request, out);
}

fn handle_snapshots(bucket: &str, object: &str, out: ResponseOutparam) {
    let target = format!("https://storage.googleapis.com/{bucket}/{object}");
    redirect(out, &target);
}

fn handle_secure(cfg: &Cfg, path: &str, request: &IncomingRequest, out: ResponseOutparam) {
    let object = path.trim_start_matches("/secure/");
    let token = secure_token_from_request(request);
    match verify_secure_token(object, token.as_deref(), &cfg.secure_hmac_key) {
        Ok(()) => proxy(cfg, &cfg.cdn_bucket, object, request, out),
        Err(reason) => {
            let mut h = cors_headers();
            respond_h(out, 401, &mut h, reason.as_bytes());
        }
    }
}

// ---------------------------------------------------------------------
// GCS proxy + autoindex
// ---------------------------------------------------------------------

/// If the path is a directory (`.../` or empty), list it; else proxy the object.
fn proxy_or_index(
    cfg: &Cfg,
    bucket: &str,
    object: &str,
    request: &IncomingRequest,
    out: ResponseOutparam,
) {
    if object.is_empty() || object.ends_with('/') {
        autoindex(bucket, object, out);
    } else {
        proxy(cfg, bucket, object, request, out);
    }
}

/// Buffered GCS object proxy. Forwards Range / conditional headers, relays
/// GCS's status + content headers, adds CORS + cache. Objects over
/// `MAX_PROXY_BYTES` are 302'd to GCS rather than buffered.
fn proxy(_cfg: &Cfg, bucket: &str, object: &str, request: &IncomingRequest, out: ResponseOutparam) {
    if object.is_empty() {
        return respond(out, 400, cors_headers(), b"missing object path");
    }
    let gcs = match Gcs::new() {
        Ok(g) => g,
        Err(_) => return respond(out, 503, cors_headers(), b"auth unavailable"),
    };

    // Guard the buffered-response cap: large objects redirect to GCS.
    if let Ok(Some(sz)) = gcs.object_size(bucket, object) {
        if sz > MAX_PROXY_BYTES {
            return redirect(out, &format!("https://storage.googleapis.com/{bucket}/{object}"));
        }
    }

    // Forward the client's conditional / range headers to GCS.
    let headers = request.headers();
    let mut owned: Vec<(&str, Vec<u8>)> = Vec::new();
    for name in ["range", "if-none-match", "if-modified-since"] {
        if let Some(v) = headers.get(&name.to_string()).into_iter().next() {
            owned.push((name, v));
        }
    }
    let fwd: Vec<(&str, &[u8])> = owned.iter().map(|(k, v)| (*k, v.as_slice())).collect();

    let resp = match gcs.get_object(bucket, object, &fwd) {
        Ok(r) => r,
        Err(_) => return respond(out, 502, cors_headers(), b"upstream error"),
    };
    if resp.status == 404 {
        return respond(out, 404, cors_headers(), b"not found");
    }
    if resp.status >= 500 {
        return respond(out, 502, cors_headers(), b"upstream error");
    }

    // Relay content headers + CORS + cache.
    let h = Fields::new();
    for (k, v) in &resp.headers {
        if FORWARD_HEADERS.contains(&k.to_ascii_lowercase().as_str()) {
            let _ = h.append(&k.to_ascii_lowercase(), v);
        }
    }
    let _ = h.append(&"cache-control".into(), &b"public, max-age=86400".to_vec());
    apply_cors(&h);
    emit(out, resp.status, h, &resp.body);
}

fn autoindex(bucket: &str, prefix: &str, out: ResponseOutparam) {
    let gcs = match Gcs::new() {
        Ok(g) => g,
        Err(_) => return respond(out, 503, cors_headers(), b"auth unavailable"),
    };
    match gcs.list(bucket, prefix) {
        Ok(listing) => {
            let html = render::autoindex(prefix, &listing);
            let mut h = html_headers();
            respond_h(out, 200, &mut h, html.as_bytes());
        }
        Err(_) => respond(out, 502, cors_headers(), b"upstream error"),
    }
}

/// Emit raw image bytes with a chosen cache lifetime (seconds).
fn emit_image(out: ResponseOutparam, data: &[u8], mime: &str, max_age: u32) {
    let h = Fields::new();
    let _ = h.append(&"content-type".into(), &mime.as_bytes().to_vec());
    let _ = h.append(&"cache-control".into(), &format!("public, max-age={max_age}").into_bytes());
    let _ = h.append(&"accept-ranges".into(), &b"bytes".to_vec());
    apply_cors(&h);
    emit(out, 200, h, data);
}

fn redirect(out: ResponseOutparam, target: &str) {
    let h = Fields::new();
    let _ = h.append(&"location".into(), &target.as_bytes().to_vec());
    let _ = h.append(&"cache-control".into(), &b"public, max-age=86400".to_vec());
    apply_cors(&h);
    emit(out, 302, h, b"");
}

// ---------------------------------------------------------------------
// /secure token verification (HMAC-SHA256, key from env)
// ---------------------------------------------------------------------

fn secure_token_from_request(request: &IncomingRequest) -> Option<String> {
    // Prefer ?sig=... in the query, else Authorization: Bearer.
    let pq = request.path_with_query().unwrap_or_default();
    if let Some(q) = pq.split('?').nth(1) {
        for pair in q.split('&') {
            if let Some(v) = pair.strip_prefix("sig=") {
                return Some(v.to_string());
            }
        }
    }
    let headers = request.headers();
    let raw = headers.get(&"authorization".to_string()).into_iter().next()?;
    let value = String::from_utf8(raw).ok()?;
    Some(value.strip_prefix("Bearer ").unwrap_or(&value).to_string())
}

/// Verify the HMAC token for `object`. Token = base64url(payload) "."
/// base64url(hmac_sha256(key, payload)); payload = "<object>:<unix_expiry>".
fn verify_secure_token(object: &str, token: Option<&str>, key: &[u8]) -> Result<(), &'static str> {
    use base64::Engine;
    use hmac::{Mac, SimpleHmac};
    use sha2::Sha256;

    if key.is_empty() {
        return Err("secure auth not configured");
    }
    let token = token.ok_or("missing token")?;
    let (payload_b64, sig_b64) = token.split_once('.').ok_or("malformed token")?;
    let b64 = base64::engine::general_purpose::URL_SAFE_NO_PAD;
    let payload = b64.decode(payload_b64).map_err(|_| "bad token payload")?;
    let sig = b64.decode(sig_b64).map_err(|_| "bad token signature")?;

    let mut mac = SimpleHmac::<Sha256>::new_from_slice(key).map_err(|_| "bad key")?;
    mac.update(&payload);
    mac.verify_slice(&sig).map_err(|_| "signature mismatch")?;

    let payload = std::str::from_utf8(&payload).map_err(|_| "bad payload utf8")?;
    let (obj, exp) = payload.rsplit_once(':').ok_or("bad payload shape")?;
    if obj != object {
        return Err("token path mismatch");
    }
    let exp: u64 = exp.parse().map_err(|_| "bad expiry")?;
    let now = std::time::SystemTime::now()
        .duration_since(std::time::UNIX_EPOCH)
        .map(|d| d.as_secs())
        .unwrap_or(0);
    if now > exp {
        return Err("token expired");
    }
    Ok(())
}

// ---------------------------------------------------------------------
// header / response helpers
// ---------------------------------------------------------------------

fn cors_headers() -> Fields {
    let h = Fields::new();
    apply_cors(&h);
    h
}

fn json_headers() -> Fields {
    let h = cors_headers();
    let _ = h.append(&"content-type".into(), &b"application/json".to_vec());
    h
}

fn html_headers() -> Fields {
    let h = cors_headers();
    let _ = h.append(&"content-type".into(), &b"text/html; charset=utf-8".to_vec());
    let _ = h.append(&"cache-control".into(), &b"public, max-age=300".to_vec());
    h
}

fn apply_cors(h: &Fields) {
    let _ = h.append(&"access-control-allow-origin".into(), &b"*".to_vec());
    let _ = h.append(&"access-control-allow-methods".into(), &b"GET, HEAD, OPTIONS".to_vec());
    let _ = h.append(&"access-control-allow-headers".into(), &b"Content-Type".to_vec());
}

fn request_accepts_html(request: &IncomingRequest) -> bool {
    let headers = request.headers();
    for raw in headers.get(&"accept".to_string()) {
        if let Ok(v) = String::from_utf8(raw) {
            if v.contains("text/html") {
                return true;
            }
        }
    }
    false
}

fn trim_leading_slash(path: &str) -> &str {
    path.trim_start_matches('/')
}

fn respond(out: ResponseOutparam, status: u16, headers: Fields, body: &[u8]) {
    emit(out, status, headers, body);
}

fn respond_h(out: ResponseOutparam, status: u16, headers: &mut Fields, body: &[u8]) {
    let cloned = headers.clone();
    emit(out, status, cloned, body);
}

/// Lower status + headers + buffered body into an OutgoingResponse.
fn emit(out: ResponseOutparam, status: u16, headers: Fields, body: &[u8]) {
    let response = OutgoingResponse::new(headers);
    let _ = response.set_status_code(status);

    // Take the body handle, then hand the response to the host BEFORE writing.
    // SET-FIRST streaming: the host drains the outgoing body stream concurrently
    // as we write it. Write-then-set deadlocks on any body larger than the
    // outgoing buffer — the host only drains after set(), so the guest blocks on
    // a full buffer and never reaches set(). (See tlsd-wasm-host large_body.rs.)
    let out_body: OutgoingBody = response.body().expect("take outgoing body");
    ResponseOutparam::set(out, Ok(response));

    if !body.is_empty() {
        let stream = out_body.write().expect("body write stream");
        for chunk in body.chunks(4096) {
            stream.blocking_write_and_flush(chunk).expect("write chunk");
        }
        drop(stream);
    }
    OutgoingBody::finish(out_body, None).expect("finish body");
}

export!(Component);
