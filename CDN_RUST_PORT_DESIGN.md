# Porting cdn.subfrost.io from Go to a Rust wasip2 / tlsd application

**Status:** design + compiling scaffold. No deploy, nothing destructive.
**Scaffold crate:** `rust/crates/subfrost-cdn-wasm` (builds to a
`wasi:http/incoming-handler` component).
**Target runtime:** `tlsd` (our existing ingress) loading the component as a
Tier-2 `app_module`.

---

## 1. What the current Go CDN does

Source: `/home/ubuntu/subfrost-cdn/cdn-server/main.go` (572 lines). It is a
single `net/http` server fronting two GCS buckets:

| Bucket | Default name | Routes |
|---|---|---|
| assets | `alkane-assets-bucket` | `/alkanes/*` |
| cdn | `subfrost-cdn-bucket` | `/docs/*` `/media/*` `/raw/*` `/releases/*` `/snapshots/*` `/private/*` |

### Routes (`main()` mux)

```go
mux.HandleFunc("/alkanes/",   handleAlkanes)   // assets bucket, stream
mux.HandleFunc("/docs/",      handleDocs)      // cdn bucket; .md → HTML for browsers
mux.HandleFunc("/media/",     handleMedia)     // cdn bucket, stream inline
mux.HandleFunc("/raw/",       handleRaw)       // cdn bucket, always raw
mux.HandleFunc("/releases/",  handleReleases)  // cdn bucket, Content-Disposition: attachment
mux.HandleFunc("/snapshots/", handleSnapshots) // 302 → storage.googleapis.com
mux.HandleFunc("/private/",   handlePrivate)   // HTTP Basic Auth → cdn bucket
mux.HandleFunc("/health",     handleHealth)    // {"status":"ok"}
mux.HandleFunc("/",           handleRoot)       // service banner JSON
```

Everything is wrapped in `telemetryMW(corsMiddleware(mux))`.

### Key handlers (quoted)

**`streamGCSObject`** — the workhorse. Opens the object via the GCS Go SDK,
mints content-type, advertises ranges, parses `Range:`, returns 206, and caps
each response slice (Cloud Run gen1 body ceiling):

```go
func streamGCSObject(w http.ResponseWriter, r *http.Request, bucketName, object string) {
    obj := gcsClient.Bucket(bucketName).Object(object)
    attrs, err := obj.Attrs(ctx)            // 404 on ErrObjectNotExist
    ...
    w.Header().Set("Accept-Ranges", "bytes")
    w.Header().Set("Content-Type", contentType)
    w.Header().Set("Cache-Control", "public, max-age=86400")
    // Last-Modified + ETag from attrs
    const maxResponseBytes int64 = 30 * 1024 * 1024
    start, length, ok := parseRangeHeader(rangeHeader, attrs.Size)
    ...
    reader, err := obj.NewRangeReader(ctx, start, length)
    // 206 Partial Content with Content-Range when slicing; else 200
    io.Copy(w, reader)
}
```

**`handlePrivate`** — HTTP Basic Auth gate (the thing `/secure` replaces):

```go
func handlePrivate(w http.ResponseWriter, r *http.Request) {
    wantUser := envOrDefault("PRIVATE_AUTH_USER", "ghost")
    wantPass := envOrDefault("PRIVATE_AUTH_PASS", "StressinItNaught")
    gotUser, gotPass, ok := r.BasicAuth()
    if !ok || subtleEq(gotUser, wantUser) != 1 || subtleEq(gotPass, wantPass) != 1 {
        w.Header().Set("WWW-Authenticate", `Basic realm="subfrost-cdn private", ...`)
        http.Error(w, "unauthorized", http.StatusUnauthorized); return
    }
    // stream private/<path> from CDN_BUCKET, Content-Disposition: attachment
}
```

**`renderMarkdown`** — fetch `.md` from the cdn bucket, run goldmark (GFM +
Typographer), inject into an embedded `markdown.html` template, serve
`text/html; max-age=3600`. `wantsBrowser()` = `Accept:` contains `text/html`.

**`handleSnapshots`** — no streaming; 302 to public GCS so the client follows
with its `Range:` intact (multi-GB tarballs):

```go
target := fmt.Sprintf("https://storage.googleapis.com/%s/%s", cdnBucket, objectPath)
w.Header().Set("Cache-Control", "public, max-age=86400")
http.Redirect(w, r, target, http.StatusFound)
```

**`handleRaw`** — `/raw/docs/foo.md` → `docs/foo.md` raw from cdn bucket.

**`corsMiddleware`** — `Access-Control-Allow-Origin: *`,
`Methods: GET, HEAD, OPTIONS`, `Headers: Content-Type`; `OPTIONS` → 204.

(`telemetry` — async JA3/JA4 + header capture to RabbitMQ. Out of scope for the
port; tlsd already does inbound JA4 capture at the ingress layer.)

---

## 2. tlsd's wasip2 application model (how a component plugs in)

Studied in `/home/ubuntu/tlsfetch/crates/tlsd-wasm-host`.

tlsd has **two** wasm tiers:

- **Tier-1 filters** (`FilterRegistry`, sync engine, `tlsd:filter/*` WIT, <10µs):
  pure-compute allow/deny. *Not* what we want.
- **Tier-2 app handlers** (`AppRegistry`, **async** engine,
  `wasi:http/proxy` world): a guest exporting `wasi:http/incoming-handler` is
  handed a real request and produces a full response. **This is the CDN's tier.**

### The WIT a component implements

The world is **`wasi:http/proxy@0.2.x`**. The guest exports
`wasi:http/incoming-handler` and may import `wasi:http/outgoing-handler`
(+ `wasi:io`, `wasi:clocks`, `wasi:random`, `wasi:cli/std*`). The reference
guest is `crates/tlsd-wasm-host/fixtures/noop-app/src/lib.rs`:

```rust
wit_bindgen::generate!({ path: "wit", world: "wasi:http/proxy", with: { ... } });
use exports::wasi::http::incoming_handler::Guest;
impl Guest for Component {
    fn handle(_request: IncomingRequest, response_out: ResponseOutparam) {
        let headers = Fields::new();
        headers.append(&"content-type".to_string(), &b"application/json".to_vec()).unwrap();
        let response = OutgoingResponse::new(headers);
        response.set_status_code(200).unwrap();
        let body = response.body().unwrap();
        let stream = body.write().unwrap();
        stream.blocking_write_and_flush(br#"{"ok":true}"#).unwrap();
        OutgoingBody::finish(body, None).unwrap();
        ResponseOutparam::set(response_out, Ok(response));
    }
}
export!(Component);
```

### How it's built

`cargo build --target wasm32-wasip2 --release`, `crate-type = ["cdylib"]`,
`wit-bindgen = "0.36"`. **No external adapter needed** — `wasm32-wasip2`
produces a component directly (the wasip1→p2 `wasi_snapshot_preview1.relocatable`
adapter is only needed for the older `wasm32-wasip1` target). Output is a single
`.wasm` component (~84 KB for our scaffold). `noop-app`'s Cargo.toml documents
exactly this.

### How the host dispatches into it

`AppRegistry` (`crates/tlsd-wasm-host/src/app_registry.rs`):

```rust
let mut linker: Linker<AppHostCtx> = Linker::new(self.engine.inner());
wasmtime_wasi::add_to_linker_async(&mut linker)?;                 // wasi:io/clocks/cli/random
wasmtime_wasi_http::add_only_http_to_linker_async(&mut linker)?;  // wasi:http in + OUT
let instance_pre = linker.instantiate_pre(component.inner())?;
let proxy_pre = ProxyPre::new(instance_pre)?;
// per request: fresh Store, new_incoming_request(Https, req),
// proxy.wasi_http_incoming_handler().call_handle(store, incoming, outparam)
```

Config wiring (`crates/tlsd/src/config.rs`, `proxy.rs`, and the live
`subkube/apps/tlsd-ingress/_base/configmap-tlsd.yaml`):

```toml
[server.app_modules]
subfrost_cdn = "/var/lib/tlsd/wasm/subfrost_cdn/subfrost_cdn.wasm"

[[route]]
host = "cdn.subfrost.io"
path = "/"            # tlsd matches by host+path-prefix
backends = ["127.0.0.1:1"]   # sentinel; ignored when app_id is set
app_id = "subfrost_cdn"
```

At startup `proxy.rs` reads each `app_modules` `.wasm` off disk and
`AppRegistry::register`s it; a route with `app_id` (or legacy `app_handler`)
short-circuits in `request_filter` into `AppRegistry::serve`.

### THE CRUX — can the component make outbound HTTP to GCS? **YES.**

- `tlsd-wasm-host/Cargo.toml` depends on `wasmtime-wasi-http = "26"`.
- `AppRegistry::register` calls `wasmtime_wasi_http::add_only_http_to_linker_async`,
  which wires **both** `wasi:http/incoming-handler` (the export) **and**
  `wasi:http/outgoing-handler` (the import the guest uses to make calls).
- `AppHostCtx` implements `WasiHttpView` and builds `WasiHttpCtx::new()`.
  wasmtime-wasi-http's default `send_request` permits outbound requests
  (no deny override is installed in the host). The module-doc comment is
  explicit: *"Components may make outbound calls via
  `wasi:http/outgoing-handler` (the LB / reverse-proxy primitive) … all wired by
  `add_to_linker_async`."*

So a Rust wasip2 component **can** reach `storage.googleapis.com` and the GKE
metadata server over outbound HTTP. This is the single fact the whole port hinges
on, and it holds.

### How a component reads config / secrets — **the one real gap**

`AppRegistry::new_store()` builds the guest's WASI context with a bare
`WasiCtxBuilder::new().build()` — **no `inherit_env()`, no `envs(...)`, no
`preopened_dir(...)`, no args.** Therefore a component today gets **no
environment variables and no filesystem**. `wasi:cli/environment` is linked but
returns empty. Secrets cannot arrive via env or a mounted file the way the Go
server reads `PRIVATE_AUTH_USER` / GCS SA from the environment.

Options to deliver the GCS token + the `/secure` HMAC key (see §5).

---

## 3. Replicating each CDN behaviour in the component

| Go behaviour | wasip2 component |
|---|---|
| route mux | `match` on `request.path_with_query()` prefix (see scaffold `route()`) |
| `corsMiddleware` | append CORS headers on every response; `OPTIONS` → 204 |
| `streamGCSObject` | outbound GET to GCS XML/JSON API `…?alt=media`, forward `Range:`, copy GCS's 200/206 + headers back. Stream body chunk-by-chunk into the `OutgoingBody` write stream |
| range / 206 | **forward the client `Range:` to GCS and relay GCS's `Content-Range`/206 verbatim** — simpler and more correct than re-parsing. (Keep a `parseRangeHeader` port only if we ever synthesize ranges.) |
| content-type / ETag / Last-Modified | copy from the GCS response headers |
| `/snapshots/*` 302 | identical: `Location: https://storage.googleapis.com/<bucket>/<obj>` + `Cache-Control` |
| `renderMarkdown` | fetch the `.md` via the same outbound path, render with `pulldown-cmark` (pure-Rust, wasm-clean), wrap in the HTML template (inline `const` string), serve `text/html` |
| `/releases/*` | proxy + `Content-Disposition: attachment; filename=…` |
| `/private/*` Basic Auth | **replaced by `/secure/*`** (see §4) |
| `/health`, `/` | static JSON |
| telemetry | drop — tlsd does inbound JA4 + request logging at the ingress already |

**Body streaming caveat.** tlsd's current `AppRegistry::serve` **buffers** the
full response body (`collect_response`) before handing it back — fine for docs /
media / small assets, but it would hold a multi-GB tarball in memory. That is
exactly why `/snapshots/*` 302-redirects to GCS and must keep doing so. A
streaming `serve` path is noted as a follow-up in the host code; until it lands,
keep large objects on the 302 path and let GCS serve the bytes.

---

## 4. The new `/secure/*` auth scheme (replaces HTTP Basic Auth)

The subfrost.io app mints a **short-lived HMAC-signed token** over the object
path; the CDN component verifies it with a shared secret. No interactive
credential prompt, no long-lived password in the CDN.

### Token format

```
GET https://cdn.subfrost.io/secure/<object-path>?exp=<unix>&sig=<b64url>
        (or)  Authorization: Bearer <token>
```

```
payload   = "<object-path>\n<exp-unix-seconds>"        # \n-joined, exact path
signature = HMAC_SHA256(SECURE_HMAC_KEY, payload)
sig       = base64url_nopad(signature)
```

The app issues these only to authenticated/authorized users for the specific
object, with a short TTL (e.g. 300 s). Path is bound into the MAC so a token for
`secure/asilos.ovpn` cannot be replayed against another object.

### Verification in the component

1. Extract `object` (path after `/secure/`), `exp`, `sig`.
2. Reject if `exp` absent or `now > exp`. (Clock: `wasi:clocks/wall-clock`,
   which the proxy world provides.)
3. Recompute `HMAC_SHA256(key, "<object>\n<exp>")` (the `hmac`+`sha2` crates,
   already wired in the scaffold and confirmed wasm-clean).
4. **Constant-time** compare against `sig` (`subtle::ConstantTimeEq`) — mirrors
   the Go server's `crypto/subtle.ConstantTimeCompare`.
5. On success → proxy `CDN_BUCKET/<object>`; on failure → `401` (plain, no
   `WWW-Authenticate` — this is token-based, not Basic).

JWT (HS256) is an acceptable alternative (`jsonwebtoken` builds for wasm), but a
bare HMAC-over-path is smaller, has no header/alg-confusion surface, and is
trivial to mint in the Next.js app with `crypto.createHmac`. **Recommend the
bare HMAC token.**

---

## 5. GCS auth from wasm — recommendation

Three candidate mechanisms:

**(A) GKE metadata-server access token (recommended).**
The tlsd pod runs in GKE with a Kubernetes SA bound (Workload Identity) to a
Google SA that has `objectViewer` on both buckets. The component fetches an
OAuth token over outbound HTTP:

```
GET http://169.254.169.254/computeMetadata/v1/instance/service-accounts/default/token
Metadata-Flavor: Google
→ { "access_token": "...", "expires_in": 3599, "token_type": "Bearer" }
```

then `Authorization: Bearer <token>` on the GCS request. Pure outbound HTTP — no
SA key material in the component, automatic rotation, no extra secret to manage.
The component caches the token in module state until ~60 s before `expires_in`.
This is the cleanest fit and uses only the outbound-HTTP capability we already
confirmed works.

**(B) Signed URL minted by the app.** The Next.js app holds the SA key, mints a
V4 signed GCS URL per request, and the component just relays/redirects to it.
Moves all GCS auth out of wasm but couples every CDN read to an app round-trip —
heavier, and defeats the point of a standalone CDN. Use only for `/secure` if we
want the app fully in the loop.

**(C) Public-read objects + plain GET.** What `/snapshots/*` already relies on.
Zero auth, but only acceptable for already-public assets.

**Recommendation:** **(A)** for all proxied reads; keep **(C)** for
`/snapshots/*` (already public, 302-redirected); the `/secure/*` *gate* is
independent of GCS auth — it controls *who may ask*, and the component still uses
(A) to actually fetch the object.

### Delivering the `SECURE_HMAC_KEY` to the component

Because the host exposes **no env and no FS** to the guest (§2), the shared HMAC
secret needs one of:

1. **Host-injected request header (recommended, small host change).** tlsd
   injects `x-subfrost-secure-key: <key>` (sourced from a mounted k8s Secret /
   ESO) on requests routed to the CDN app, stripped from any client-supplied
   value first. The component reads it from `IncomingRequest` headers. The
   metadata-token path (A) needs *no* secret at all, so this header is the only
   secret the component needs.
2. **Teach `AppRegistry` to pass env/secrets** (`WasiCtxBuilder::envs(...)` from
   a per-`app_module` config map). Cleaner long-term; a host-side change in
   `tlsd-wasm-host`. Recommended as the durable fix.
3. **Build-time `const`** baked into the `.wasm`. Simplest, worst hygiene
   (secret in an artifact / ConfigMap). Avoid.

Until (1) or (2) lands, `/secure/*` denies all (the scaffold does exactly this).

---

## 6. Deployment shape

tlsd already fronts `wss-1.subfrost.io` in `subkube/apps/tlsd-ingress`. Add
`cdn.subfrost.io` to the same (or a sibling) tlsd deployment:

1. **Build** `subfrost-cdn-wasm` → `subfrost_cdn.wasm` (rcargo / CI), base64 it
   into a `ConfigMap` exactly like `configmap-wasm-push-proxy.yaml`
   (`tlsd-wasm-subfrost-cdn`).
2. **Mount** it at `/var/lib/tlsd/wasm/subfrost_cdn/subfrost_cdn.wasm` (volume +
   `volumeMount`, mirroring the push_proxy volume in `deployment.yaml`).
3. **Register** in `configmap-tlsd.yaml`:
   ```toml
   [server.app_modules]
   subfrost_cdn = "/var/lib/tlsd/wasm/subfrost_cdn/subfrost_cdn.wasm"
   [[route]]
   host = "cdn.subfrost.io"
   path = "/"
   backends = ["127.0.0.1:1"]
   app_id = "subfrost_cdn"
   ```
4. **Workload Identity**: bind the tlsd KSA to a GSA with `objectViewer` on
   `alkane-assets-bucket` + `subfrost-cdn-bucket` (enables metadata-token auth).
5. **`SECURE_HMAC_KEY`**: k8s Secret (ESO from GCP SM, same pattern as
   `resend-api-key`), surfaced to the component per §5.
6. **TLS / DNS**: real cert for `cdn.subfrost.io` on the tlsd listener; point DNS
   at the tlsd LB (replacing the current Cloud Run + CF-Worker front).
7. Managed from `~/subfrost.io` via Flux against the subkube repo, same as every
   other app under `subkube/apps/`.

The Go Cloud Run service stays up until the tlsd path is validated, then DNS
cuts over.

---

## 7. Gaps / risks / open questions

1. **Secret delivery to the guest (biggest gap).** Host exposes no env/FS today.
   Needs the host-injected header (§5.1) or an `AppRegistry` env feature (§5.2).
   GCS auth via metadata (A) needs no secret, so only `/secure` is blocked on
   this.
2. **Buffered response body.** `AppRegistry::serve` collects the whole body in
   memory. Fine for docs/media/assets; **not** for snapshots → keep the 302.
   A streaming `serve` is a tlsd follow-up if we want large objects through the
   component.
3. **Per-write stream cap.** `blocking_write_and_flush` should be chunked
   (scaffold chunks at 4 KiB) — true for relaying GCS bodies too.
4. **WASI version skew.** wit-bindgen emitted `wasi:http/types@0.2.4` /
   `…@0.2.6` imports against a host on `wasmtime 26` (≈0.2.1/0.2.2). Component
   model does semver-compatible matching across 0.2.x, and tlsd's own fixtures
   build the same way, but **must smoke-test instantiation against the live
   tlsd** before cutover.
5. **Metadata-token caching & failure modes.** Cache token to ~60 s before
   expiry; handle metadata 5xx; decide behaviour on token-fetch failure
   (503 vs retry).
6. **CORS / cache parity.** Mirror Go headers exactly (incl. `ETag`,
   `Last-Modified` from the GCS response) so downstream caches/CF behave the same.
7. **Markdown renderer size.** `pulldown-cmark` is pure-Rust and wasm-clean;
   confirm the rendered HTML matches goldmark's GFM output closely enough for the
   existing docs + template.
8. **Telemetry.** The Go RabbitMQ JA3/JA4 pipeline is dropped; confirm tlsd's
   inbound JA4 capture is an acceptable replacement for the CDN's needs.
9. **Multi-replica.** Token-cache is per-pod (fine, stateless). Unlike
   push_proxy/pair_bridge the CDN holds no per-pod session state, so it can scale
   horizontally freely.

---

## 8. Scaffold

`rust/crates/subfrost-cdn-wasm` — a standalone crate (`[workspace]` opt-out, like
`noop-app`) that:

- `wit_bindgen::generate!` over the vendored `wasi:http/proxy` WIT (copied from
  the tlsd noop-app fixture).
- exports `wasi:http/incoming-handler` (`impl Guest for Component`).
- dispatches all routes (`/health`, `/`, `/alkanes`, `/docs`, `/media`, `/raw`,
  `/releases`, `/snapshots` 302, `/secure`) with CORS + cache headers.
- stubs the GCS outbound fetch and the `/secure` HMAC verification (the latter
  exercises `hmac`/`sha2`/`subtle` so the crypto path is proven to compile to
  wasip2), with `TODO(scaffold)` markers where the host wiring from §5 plugs in.

**Build:**
```
cd rust/crates/subfrost-cdn-wasm
cargo build --target wasm32-wasip2 --release
# → target/wasm32-wasip2/release/subfrost_cdn_wasm.wasm  (~84 KB component)
```

**Verified:** compiles clean; `wasm-tools component wit` confirms
`export wasi:http/incoming-handler@0.2.1`. (Toolchain note: `wasm32-wasip2`'s
rust-std was registered-but-missing on this box and had to be reinstalled with
`rustup target add wasm32-wasip2 --toolchain 1.91.0`.)
