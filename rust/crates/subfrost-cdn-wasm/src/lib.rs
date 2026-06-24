//! subfrost-cdn-wasm — the wasip2 port of cdn.subfrost.io.
//!
//! A `wasi:http/incoming-handler` component that tlsd dispatches to
//! (via `app_id = "subfrost_cdn"`). It replicates the Go CDN:
//!
//!   * GCS object proxy (`/alkanes/*`, `/docs/*`, `/media/*`,
//!     `/raw/*`, `/releases/*`) — fetch `gs://bucket/object` over
//!     OUTBOUND HTTP (`wasi:http/outgoing-handler`) against the GCS
//!     JSON/XML API, stream it back with CORS + cache + range headers.
//!   * `/snapshots/*` — 302 redirect to storage.googleapis.com (multi-GB
//!     tarballs; let GCS serve the Range directly).
//!   * markdown render (`/docs/*.md` for browsers) — fetch + render.
//!   * `/secure/*` — replaces the Go server's HTTP Basic Auth with a
//!     short-lived HMAC-signed token minted by the subfrost.io app and
//!     verified here with a shared secret.
//!   * `/health`, `/`.
//!
//! Status: SCAFFOLD. Route dispatch + response plumbing are wired and
//! compile to a real component; the GCS-fetch and HMAC-key plumbing are
//! stubbed (see the `TODO(scaffold)` markers) pending the host wiring
//! described in CDN_RUST_PORT_DESIGN.md.

wit_bindgen::generate!({
    path: "wit",
    world: "wasi:http/proxy",
    // Generate bindings for the proxy world's transitive interfaces.
    // `outgoing-handler` is what lets this component make the OUTBOUND
    // GCS request — the crux of the port. `generate_all` would also
    // pull in unrelated wasi:cli interfaces the host linker for
    // wasi:http/proxy does not provide, so we enumerate explicitly.
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

use exports::wasi::http::incoming_handler::Guest;
use wasi::http::types::{
    Fields, IncomingRequest, Method, OutgoingBody, OutgoingResponse, ResponseOutparam,
};

/// Bucket the public asset routes (`/alkanes/*`) read from. Mirrors the
/// Go server's `alkane-assets-bucket` default.
const ASSETS_BUCKET: &str = "alkane-assets-bucket";
/// Bucket the docs/media/raw/releases/snapshots/secure routes read from.
/// Mirrors the Go server's `subfrost-cdn-bucket` default.
const CDN_BUCKET: &str = "subfrost-cdn-bucket";

struct Component;

impl Guest for Component {
    fn handle(request: IncomingRequest, response_out: ResponseOutparam) {
        let method = request.method();
        let path_with_query = request.path_with_query().unwrap_or_else(|| "/".to_string());
        let path = path_with_query
            .split('?')
            .next()
            .unwrap_or("/")
            .to_string();

        // CORS preflight short-circuit (Go corsMiddleware: OPTIONS → 204).
        if matches!(method, Method::Options) {
            respond(response_out, 204, cors_headers(), b"");
            return;
        }
        // Only GET/HEAD are served (Go advertises "GET, HEAD, OPTIONS").
        if !matches!(method, Method::Get | Method::Head) {
            respond(response_out, 405, cors_headers(), b"method not allowed");
            return;
        }

        route(&path, &request, response_out);
    }
}

/// Top-level route dispatch — the wasip2 equivalent of the Go
/// `http.ServeMux` registrations in `main()`.
fn route(path: &str, request: &IncomingRequest, out: ResponseOutparam) {
    match () {
        _ if path == "/health" => handle_health(out),
        _ if path == "/" => handle_root(out),

        _ if path.starts_with("/alkanes/") => {
            handle_gcs_proxy(ASSETS_BUCKET, trim_leading_slash(path), request, out)
        }
        _ if path.starts_with("/docs/") => handle_docs(trim_leading_slash(path), request, out),
        _ if path.starts_with("/media/") => {
            handle_gcs_proxy(CDN_BUCKET, trim_leading_slash(path), request, out)
        }
        _ if path.starts_with("/releases/") => {
            handle_gcs_proxy(CDN_BUCKET, trim_leading_slash(path), request, out)
        }
        _ if path.starts_with("/raw/") => {
            // /raw/docs/foo.md -> docs/foo.md in CDN_BUCKET
            handle_gcs_proxy(CDN_BUCKET, path.trim_start_matches("/raw/"), request, out)
        }
        _ if path.starts_with("/snapshots/") => {
            handle_snapshots(trim_leading_slash(path), out)
        }
        // /secure/* replaces /private/* + HTTP Basic Auth with an
        // HMAC-token gate (see verify_secure_token + the design doc).
        _ if path.starts_with("/secure/") => handle_secure(path, request, out),

        _ => respond(out, 404, cors_headers(), b"not found"),
    }
}

/// `{"status":"ok"}` — health probe (Go handleHealth).
fn handle_health(out: ResponseOutparam) {
    let mut h = json_headers();
    respond_h(out, 200, &mut h, br#"{"status":"ok"}"#);
}

/// Service banner (Go handleRoot).
fn handle_root(out: ResponseOutparam) {
    let mut h = json_headers();
    respond_h(
        out,
        200,
        &mut h,
        br#"{"service":"subfrost-cdn","routes":["/alkanes/*","/docs/*","/media/*","/raw/*","/releases/*","/snapshots/*","/secure/*","/health"]}"#,
    );
}

/// `/docs/*` — markdown render for browsers, raw stream otherwise
/// (Go handleDocs). `?raw=1` forces raw.
fn handle_docs(object: &str, request: &IncomingRequest, out: ResponseOutparam) {
    let pq = request.path_with_query().unwrap_or_default();
    let wants_raw = pq.contains("raw=1");
    let is_md = object.to_ascii_lowercase().ends_with(".md");
    let wants_html = request_accepts_html(request);

    if is_md && wants_html && !wants_raw {
        // TODO(scaffold): fetch object from CDN_BUCKET, render markdown
        // → styled HTML, return text/html. Needs the outbound GCS fetch
        // + a markdown renderer (pulldown-cmark) wired in.
        let mut h = html_headers();
        respond_h(
            out,
            200,
            &mut h,
            b"<!-- TODO(scaffold): markdown render of docs object -->",
        );
        return;
    }
    handle_gcs_proxy(CDN_BUCKET, object, request, out);
}

/// `/snapshots/*` — 302 redirect to storage.googleapis.com so GCS
/// serves the (multi-GB, range-heavy) tarball directly (Go
/// handleSnapshots).
fn handle_snapshots(object: &str, out: ResponseOutparam) {
    let target = format!("https://storage.googleapis.com/{CDN_BUCKET}/{object}");
    let headers = Fields::new();
    let _ = headers.append(&"location".into(), &target.into_bytes());
    let _ = headers.append(&"cache-control".into(), &b"public, max-age=86400".to_vec());
    apply_cors(&headers);
    emit(out, 302, headers, b"");
}

/// `/secure/*` — token-gated object proxy. Replaces the Go server's
/// `/private/*` HTTP Basic Auth. The subfrost.io app mints a
/// short-lived HMAC token over the object path; this verifies it with
/// the shared secret before proxying from CDN_BUCKET.
fn handle_secure(path: &str, request: &IncomingRequest, out: ResponseOutparam) {
    // Object path = everything after "/secure/".
    let object = path.trim_start_matches("/secure/");
    let token = secure_token_from_request(request);

    match verify_secure_token(object, token.as_deref()) {
        Ok(()) => handle_gcs_proxy(CDN_BUCKET, object, request, out),
        Err(reason) => {
            let mut h = cors_headers();
            // No WWW-Authenticate (we're token-based, not Basic) — just 401.
            respond_h(out, 401, &mut h, reason.as_bytes());
        }
    }
}

/// Core GCS object proxy: fetch `gs://bucket/object` over OUTBOUND HTTP
/// and stream it back with the Go server's CORS / cache / range
/// headers. The Go `streamGCSObject`.
fn handle_gcs_proxy(
    bucket: &str,
    object: &str,
    _request: &IncomingRequest,
    out: ResponseOutparam,
) {
    if object.is_empty() {
        respond(out, 400, cors_headers(), b"missing object path");
        return;
    }

    // TODO(scaffold): the real outbound fetch. Shape:
    //   1. obtain a GCS access token (GKE metadata server access token
    //      via wasi:http/outgoing-handler, OR a host-injected header —
    //      see CDN_RUST_PORT_DESIGN.md "GCS auth from wasm").
    //   2. build an OutgoingRequest GET to
    //      https://storage.googleapis.com/storage/v1/b/{bucket}/o/
    //      {urlencoded(object)}?alt=media  with Authorization: Bearer.
    //      Forward the client's Range header for 206 support.
    //   3. wasi::http::outgoing_handler::handle(req, None) -> future,
    //      subscribe/await, read the IncomingResponse body stream and
    //      pump it into this response's OutgoingBody stream.
    // For now: a deterministic stub so the component instantiates and
    // round-trips through tlsd's AppRegistry.
    let body = format!(
        "{{\"stub\":\"gcs-proxy\",\"bucket\":\"{bucket}\",\"object\":\"{object}\"}}"
    );
    let headers = Fields::new();
    let _ = headers.append(&"content-type".into(), &b"application/json".to_vec());
    let _ = headers.append(&"accept-ranges".into(), &b"bytes".to_vec());
    let _ = headers.append(&"cache-control".into(), &b"public, max-age=86400".to_vec());
    apply_cors(&headers);
    emit(out, 200, headers, body.as_bytes());
}

// ---------------------------------------------------------------------
// /secure token verification
// ---------------------------------------------------------------------

/// Pull the token out of the request: `?sig=...&exp=...` query params
/// or an `Authorization: Bearer <token>` header. Scaffold reads the
/// `authorization` header; full impl parses query too.
fn secure_token_from_request(request: &IncomingRequest) -> Option<String> {
    let headers = request.headers();
    let entries = headers.get(&"authorization".to_string());
    let raw = entries.into_iter().next()?;
    let value = String::from_utf8(raw).ok()?;
    value
        .strip_prefix("Bearer ")
        .map(|s| s.to_string())
        .or(Some(value))
}

/// Verify the HMAC token for `object`. Token format (see design doc):
///   token   = base64url(payload) "." base64url(hmac_sha256(key, payload))
///   payload = "<object_path>:<unix_expiry>"
/// Verification: recompute the HMAC over the payload with the shared
/// secret, constant-time compare, check expiry, check the path binds to
/// the requested object.
///
/// TODO(scaffold): wire the actual shared secret (`SECURE_HMAC_KEY`) —
/// the wasip2 host (tlsd AppRegistry) does NOT currently expose env or
/// FS to the guest, so the key must arrive via a host-injected request
/// header or a baked build-time constant. See the design doc's "GCS
/// auth from wasm" / secrets section. Until then this denies all.
fn verify_secure_token(_object: &str, token: Option<&str>) -> Result<(), &'static str> {
    let _token = token.ok_or("missing token")?;

    // Compile-in the constant-time + HMAC machinery so the dependency
    // is exercised and the real impl is a drop-in. Demonstrates the
    // verification primitives compile to wasip2.
    use hmac::{Mac, SimpleHmac};
    use sha2::Sha256;
    let key: &[u8] = secure_hmac_key();
    if key.is_empty() {
        return Err("secure auth not configured");
    }
    let mut mac =
        SimpleHmac::<Sha256>::new_from_slice(key).map_err(|_| "bad key")?;
    mac.update(b"placeholder-payload");
    let _expected = mac.finalize().into_bytes();

    // Scaffold: deny until the real token parse + secret wiring lands.
    Err("token verification not yet implemented")
}

/// The shared HMAC secret. SCAFFOLD returns empty (deny). Real impl
/// sources this from a host-injected header or build-time constant —
/// see the design doc.
fn secure_hmac_key() -> &'static [u8] {
    // TODO(scaffold): replace with host-provided secret.
    b""
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
    let _ = h.append(&"cache-control".into(), &b"public, max-age=3600".to_vec());
    h
}

/// Apply the Go `corsMiddleware` headers.
fn apply_cors(h: &Fields) {
    let _ = h.append(&"access-control-allow-origin".into(), &b"*".to_vec());
    let _ = h.append(
        &"access-control-allow-methods".into(),
        &b"GET, HEAD, OPTIONS".to_vec(),
    );
    let _ = h.append(
        &"access-control-allow-headers".into(),
        &b"Content-Type".to_vec(),
    );
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

/// Build + emit a response from a fresh Fields (caller didn't pre-build).
fn respond(out: ResponseOutparam, status: u16, headers: Fields, body: &[u8]) {
    emit(out, status, headers, body);
}

/// Same, taking a `&mut Fields` the caller already populated.
fn respond_h(out: ResponseOutparam, status: u16, headers: &mut Fields, body: &[u8]) {
    // Fields is move-only into OutgoingResponse; clone the entries.
    let cloned = headers.clone();
    emit(out, status, cloned, body);
}

/// Lower a status + headers + buffered body into a wasi:http
/// OutgoingResponse and hand it to the host's response-outparam. The
/// buffered-body path mirrors tlsd's AppRegistry (which collects the
/// full body); a streaming body for large objects is the follow-up
/// noted in the design doc.
fn emit(out: ResponseOutparam, status: u16, headers: Fields, body: &[u8]) {
    let response = OutgoingResponse::new(headers);
    let _ = response.set_status_code(status);

    let out_body: OutgoingBody = response.body().expect("take outgoing body");
    if !body.is_empty() {
        let stream = out_body.write().expect("body write stream");
        // wasi:io streams cap a single write at 4 KiB-ish; chunk it.
        for chunk in body.chunks(4096) {
            stream.blocking_write_and_flush(chunk).expect("write chunk");
        }
        // Drop the stream before finishing the body (wasi:io contract).
        drop(stream);
    }
    OutgoingBody::finish(out_body, None).expect("finish body");

    ResponseOutparam::set(out, Ok(response));
}

export!(Component);
