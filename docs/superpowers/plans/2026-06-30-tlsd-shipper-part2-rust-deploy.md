# tlsd access-log shipper — Plano 2 (Rust no tlsd + build + deploy + cutover)

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Fazer o tlsd emitir, por request, um evento de access-log com fingerprint (JA3/JA4) + `kind` direto pro Elasticsearch (`_bulk`), fire-and-forget, sem nunca bloquear o proxy; depois buildar, deployar e virar a chave do dashboard pro produtor tlsd.

**Architecture:** Um módulo novo `crates/tlsd/src/access_log.rs` no `tlsd` (binário) com: funções **puras** (`classify_kind`, `build_access_event`, `bulk_body`) e um **shipper assíncrono** (`AccessLogShipper`: canal `mpsc` bounded → loop que faz `_bulk` em lote, drop-on-full). O `ConfigProxy` (`crates/tlsd/src/proxy.rs`) ganha um campo `shipper: Option<AccessLogShipper>` e emite no hook `response_filter` que já implementa (com `session.tls_fingerprint` + `response_head.status` + latência via `started: Instant` no `CTX`). O handle é criado e anexado no `crates/tlsd/src/runtime.rs` (contexto async) via builder `with_shipper`, atrás de config `[telemetry]` (off por default). O ES é HTTP puro intra-cluster (sem auth). Deploy = build via `cloudbuild-tlsd-io.yaml` → AR `night-wolves-jogging` → bump da tag no `k8s/tlsd-ingress/tlsd.yaml` (subfrost.io, Flux). Cutover = re-rodar bootstrap (campo `kind`) + flip `ANALYTICS_INSTANCE`.

**Tech Stack:** Rust (workspace `pyrosec/tlsfetch`, branch base `feat/tlsd-inbound-ja4`), tokio, serde_json, chrono; `cargo test` (unit). Deploy: Google Cloud Build + GKE + Flux/GitOps (repo `subfrost.io`).

## Global Constraints

- **A telemetria NUNCA bloqueia nem derruba o ingress.** O caller (`response_filter`) usa `try_send` **não-bloqueante**; canal cheio → **descarta** o evento e incrementa um contador. Erro de rede/ES → loga e descarta o lote. Nenhum `.await` de I/O de ES no caminho do request.
- **Desligado por default.** `[telemetry].enabled = false` é o default; build/deploy do tlsd NÃO liga o shipper até a config pedir. Sem regressão pro tráfego atual.
- **Paridade de schema com a Parte B** (`subfrost.io/lib/telemetry/access-event.ts`). O doc tem EXATAMENTE: `ts, service:"tlsd-ingress", instance, host, path, method, status, source_ip, ja3, ja3_full, ja4, latency_ms, bytes_out, headers{}, headers_truncated, kind`. Mapeamento de fingerprint: doc `ja3` = `fp.ja3_hash` (md5), doc `ja3_full` = `fp.ja3` (cleartext), doc `ja4` = `fp.ja4`. O template ES é `dynamic=strict` no topo → campo extra é rejeitado; `kind` já foi adicionado ao template no Plano 1 (PR #145).
- **`source_ip` tem que ser IP válido** (campo ES tipo `ip`, `ignore_malformed:true`). Usar o IP efetivo do cliente (lógica `forward_client_ip` + `trusted_proxies` que o tlsd já tem), não o `peer_addr` cru quando atrás de proxy confiável. Se não houver IP, **omitir o campo** (não mandar string vazia).
- **`instance` default = `"tlsd-core"`** (discriminador do cutover; a Parte B usa `"edge-middleware"`).
- **Índice diário** `subfrost-cdn-%Y.%m.%d` em UTC, derivado do `ts` do próprio evento.
- **Branch base do tlsd = `feat/tlsd-inbound-ja4`** (é o que roda em prod; tem `Session.tls_fingerprint`). NÃO partir da master. Trabalhar no clone em `C:\refs\tlsfetch`.
- **`--features wasm` obrigatório** no build do tlsd (senão `app_modules` são ignorados silenciosamente — paridade com prod).
- **ES sem auth**: `xpack.security.enabled=false`; escrever em `http://elasticsearch.telemetry.svc.cluster.local:9200` sem header de auth (igual à Parte B).
- **Decisões já fechadas (não perguntar ao flex):** branch ja4; ES sem auth; build via Cloud Build do source/prebuilt → AR night-wolves-jogging.

## Repos & paths

- **tlsfetch (Rust):** clone em `C:\refs\tlsfetch`, branch base `feat/tlsd-inbound-ja4`. Criar branch de trabalho `feat/tlsd-access-log-shipper`.
- **subfrost.io (deploy/cutover):** `C:\Alkanes Geral Dev\subfrost.io`, branch `feat/tlsd-access-log-shipper` (já existe, do Plano 1).
- ⚠️ Windows não builda o tlsd (Rust+wasm); `cargo test` das funções puras roda no Windows se o toolchain estiver lá, **mas** o workspace tem deps nativas pesadas. Se `cargo test` local falhar/demorar, rodar os testes no Cloud Build (Task 9) ou numa VM/WSL Linux. Os testes são a fonte de verdade; não pular.

---

### Task 1: `classify_kind` — classificador de tipo de request (puro)

**Files:**
- Create: `C:\refs\tlsfetch\crates\tlsd\src\access_log.rs`
- Modify: `C:\refs\tlsfetch\crates\tlsd\src\lib.rs` (declarar `mod access_log;`)

**Interfaces:**
- Consumes: nada.
- Produces: `pub enum Kind { Page, Api, Asset, Other }` com `pub fn as_str(&self) -> &'static str`; `pub fn classify_kind(method: &str, path: &str) -> Kind`.

- [ ] **Step 1: Escrever o teste que falha**

Criar `C:\refs\tlsfetch\crates\tlsd\src\access_log.rs` com:

```rust
//! Access-log shipper: emits one subfrost-cdn-* access event per request
//! (with the inbound TLS fingerprint) to Elasticsearch, fire-and-forget.
//! See subfrost.io docs/superpowers/specs/2026-06-30-tlsd-access-log-shipper-design.md.

/// Coarse request class, written as the `kind` field so the dashboard can
/// filter pageviews (`kind:page`) out of the full edge access log.
#[derive(Debug, Clone, Copy, PartialEq, Eq)]
pub enum Kind {
    Page,
    Api,
    Asset,
    Other,
}

impl Kind {
    pub fn as_str(&self) -> &'static str {
        match self {
            Kind::Page => "page",
            Kind::Api => "api",
            Kind::Asset => "asset",
            Kind::Other => "other",
        }
    }
}

/// Classify a request into a `Kind` from its method + path (no query string).
/// Mirrors the intent of subfrost.io's lib/telemetry/capture-path.ts:
/// admin/api/assets are NOT public pageviews.
pub fn classify_kind(method: &str, path: &str) -> Kind {
    // Strip query string defensively (callers pass request_head.path which may
    // include it).
    let path = path.split('?').next().unwrap_or(path);
    if path.starts_with("/api") || path.starts_with("/_next/data") {
        return Kind::Api;
    }
    const ASSET_EXTS: &[&str] = &[
        ".js", ".css", ".png", ".jpg", ".jpeg", ".gif", ".svg", ".webp", ".ico",
        ".woff", ".woff2", ".ttf", ".map", ".txt", ".xml", ".json",
    ];
    let is_asset_path = path.starts_with("/_next/static")
        || path.starts_with("/static")
        || matches!(path, "/favicon.ico" | "/robots.txt" | "/sitemap.xml" | "/feed.xml")
        || ASSET_EXTS.iter().any(|ext| path.ends_with(ext));
    if is_asset_path {
        return Kind::Asset;
    }
    let is_get = method.eq_ignore_ascii_case("GET") || method.eq_ignore_ascii_case("HEAD");
    if is_get && !path.starts_with("/admin") {
        return Kind::Page;
    }
    Kind::Other
}

#[cfg(test)]
mod tests {
    use super::*;

    #[test]
    fn classifies_kinds() {
        assert_eq!(classify_kind("GET", "/"), Kind::Page);
        assert_eq!(classify_kind("GET", "/articles/foo"), Kind::Page);
        assert_eq!(classify_kind("GET", "/articles/foo?utm_source=x"), Kind::Page);
        assert_eq!(classify_kind("POST", "/api/fp"), Kind::Api);
        assert_eq!(classify_kind("GET", "/api/anything"), Kind::Api);
        assert_eq!(classify_kind("GET", "/_next/static/chunk.js"), Kind::Asset);
        assert_eq!(classify_kind("GET", "/logo.svg"), Kind::Asset);
        assert_eq!(classify_kind("GET", "/favicon.ico"), Kind::Asset);
        assert_eq!(classify_kind("GET", "/admin/marketing"), Kind::Other);
        assert_eq!(classify_kind("POST", "/contact"), Kind::Other);
        assert_eq!(classify_kind("OPTIONS", "/"), Kind::Other);
    }

    #[test]
    fn kind_as_str() {
        assert_eq!(Kind::Page.as_str(), "page");
        assert_eq!(Kind::Asset.as_str(), "asset");
    }
}
```

E em `C:\refs\tlsfetch\crates\tlsd\src\lib.rs`, adicionar a declaração do módulo (junto às outras `pub use proxy::...` / `mod ...`):

```rust
pub mod access_log;
```

- [ ] **Step 2: Rodar e confirmar que compila + passa**

```bash
cd /c/refs/tlsfetch
cargo test -p tlsd access_log::tests:: 2>&1 | tail -20
```

Expected: `classifies_kinds` + `kind_as_str` PASS. (Se o toolchain local não buildar o workspace, ver a nota de ambiente no topo — rodar no Linux/Cloud Build.)

- [ ] **Step 3: Commit**

```bash
cd /c/refs/tlsfetch
git add crates/tlsd/src/access_log.rs crates/tlsd/src/lib.rs
git commit -m "feat(tlsd): access_log kind classifier (Peça C shipper)"
```

---

### Task 2: `TelemetryConfig` — config `[telemetry]` (serde)

**Files:**
- Modify: `C:\refs\tlsfetch\crates\tlsd\src\config.rs` (nova struct `TelemetryConfig` + campo `telemetry` em `Config` + defaults)

**Interfaces:**
- Consumes: nada.
- Produces: `pub struct TelemetryConfig { pub enabled: bool, pub es_url: String, pub index_prefix: String, pub instance: String, pub flush_max_docs: usize, pub flush_interval_ms: u64, pub channel_capacity: usize }` com `Default`; e `Config.telemetry: TelemetryConfig` (serde `[telemetry]`).

- [ ] **Step 1: Escrever o teste que falha**

Em `C:\refs\tlsfetch\crates\tlsd\src\config.rs`, adicionar no bloco `#[cfg(test)] mod tests` (ou criar um) o teste:

```rust
#[test]
fn telemetry_defaults_off() {
    let cfg: Config = toml::from_str("").unwrap();
    assert!(!cfg.telemetry.enabled);
    assert_eq!(cfg.telemetry.index_prefix, "subfrost-cdn");
    assert_eq!(cfg.telemetry.instance, "tlsd-core");
}

#[test]
fn telemetry_parses() {
    let toml_src = r#"
[telemetry]
enabled = true
es_url = "http://es.telemetry.svc:9200"
flush_max_docs = 250
"#;
    let cfg: Config = toml::from_str(toml_src).unwrap();
    assert!(cfg.telemetry.enabled);
    assert_eq!(cfg.telemetry.es_url, "http://es.telemetry.svc:9200");
    assert_eq!(cfg.telemetry.flush_max_docs, 250);
    assert_eq!(cfg.telemetry.instance, "tlsd-core"); // default kept
}
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /c/refs/tlsfetch
cargo test -p tlsd config::tests::telemetry 2>&1 | tail -20
```

Expected: FAIL de compilação — `Config` não tem campo `telemetry`.

- [ ] **Step 3: Implementar a struct + defaults**

Em `C:\refs\tlsfetch\crates\tlsd\src\config.rs`, adicionar o campo ao `Config` (logo após `pub server: ServerConfig`):

```rust
    #[serde(default)]
    pub telemetry: TelemetryConfig,
```

E adicionar a struct + defaults + `Default` (perto das outras structs de config; usar o mesmo estilo serde do arquivo):

```rust
/// `[telemetry]` — access-log shipper (Peça C). Off por default. Quando
/// `enabled`, o tlsd emite um doc `subfrost-cdn-*` por request (com fingerprint)
/// pro ES via _bulk, fire-and-forget. Ver crates/tlsd/src/access_log.rs.
#[derive(Debug, Clone, serde::Deserialize)]
#[serde(deny_unknown_fields)]
pub struct TelemetryConfig {
    #[serde(default)]
    pub enabled: bool,
    #[serde(default = "default_telemetry_es_url")]
    pub es_url: String,
    #[serde(default = "default_telemetry_index_prefix")]
    pub index_prefix: String,
    #[serde(default = "default_telemetry_instance")]
    pub instance: String,
    #[serde(default = "default_telemetry_flush_max_docs")]
    pub flush_max_docs: usize,
    #[serde(default = "default_telemetry_flush_interval_ms")]
    pub flush_interval_ms: u64,
    #[serde(default = "default_telemetry_channel_capacity")]
    pub channel_capacity: usize,
}

fn default_telemetry_es_url() -> String {
    "http://elasticsearch.telemetry.svc.cluster.local:9200".to_string()
}
fn default_telemetry_index_prefix() -> String { "subfrost-cdn".to_string() }
fn default_telemetry_instance() -> String { "tlsd-core".to_string() }
fn default_telemetry_flush_max_docs() -> usize { 500 }
fn default_telemetry_flush_interval_ms() -> u64 { 5000 }
fn default_telemetry_channel_capacity() -> usize { 10000 }

impl Default for TelemetryConfig {
    fn default() -> Self {
        TelemetryConfig {
            enabled: false,
            es_url: default_telemetry_es_url(),
            index_prefix: default_telemetry_index_prefix(),
            instance: default_telemetry_instance(),
            flush_max_docs: default_telemetry_flush_max_docs(),
            flush_interval_ms: default_telemetry_flush_interval_ms(),
            channel_capacity: default_telemetry_channel_capacity(),
        }
    }
}
```

> Nota: o `Config` precisa derivar/permitir `Default` no campo novo — `#[serde(default)]` no campo usa `TelemetryConfig::default()`, que existe acima. Não é preciso `Config: Default` inteiro.

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd /c/refs/tlsfetch
cargo test -p tlsd config::tests::telemetry 2>&1 | tail -20
```

Expected: `telemetry_defaults_off` + `telemetry_parses` PASS.

- [ ] **Step 5: Commit**

```bash
cd /c/refs/tlsfetch
git add crates/tlsd/src/config.rs
git commit -m "feat(tlsd): [telemetry] config (off by default) for access-log shipper"
```

---

### Task 3: `build_access_event` + `bulk_body` — montagem do doc (puro)

**Files:**
- Modify: `C:\refs\tlsfetch\crates\tlsd\src\access_log.rs`
- Modify: `C:\refs\tlsfetch\crates\tlsd\Cargo.toml` (adicionar `chrono`)

**Interfaces:**
- Consumes: `Kind` (Task 1); `tlsfetch_transport::TlsFingerprint`.
- Produces:
  - `pub struct AccessFields<'a> { pub fp: Option<&'a tlsfetch_transport::TlsFingerprint>, pub host: &'a str, pub path: &'a str, pub method: &'a str, pub status: u16, pub source_ip: Option<&'a str>, pub user_agent: &'a str, pub xff: &'a str, pub referer: Option<&'a str>, pub latency_ms: u64, pub bytes_out: u64, pub instance: &'a str, pub now_ms: i64 }`
  - `pub fn build_access_event(f: &AccessFields) -> serde_json::Value`
  - `pub fn daily_index(prefix: &str, now_ms: i64) -> String`
  - `pub fn bulk_body(prefix: &str, events: &[serde_json::Value]) -> String`

- [ ] **Step 1: Escrever os testes que falham**

Adicionar ao `mod tests` em `access_log.rs`:

```rust
    use serde_json::json;
    use tlsfetch_transport::TlsFingerprint;

    fn sample_fp() -> TlsFingerprint {
        TlsFingerprint {
            ja3: "771,4865-4866,0-23,29-23,0".to_string(),
            ja3_hash: "deadbeefcafebabedeadbeefcafebabe".to_string(),
            ja4: "t13d1516h2_8daaf6152771_b186095e22b6".to_string(),
        }
    }

    #[test]
    fn build_event_maps_fields() {
        let fp = sample_fp();
        let f = AccessFields {
            fp: Some(&fp),
            host: "subfrost.io",
            path: "/articles/x",
            method: "GET",
            status: 200,
            source_ip: Some("203.0.113.7"),
            user_agent: "Mozilla/5.0",
            xff: "203.0.113.7",
            referer: Some("https://t.co/abc"),
            latency_ms: 42,
            bytes_out: 1234,
            instance: "tlsd-core",
            now_ms: 1_700_000_000_000,
        };
        let v = build_access_event(&f);
        assert_eq!(v["service"], "tlsd-ingress");
        assert_eq!(v["instance"], "tlsd-core");
        assert_eq!(v["ts"], 1_700_000_000_000i64);
        assert_eq!(v["status"], 200);
        assert_eq!(v["source_ip"], "203.0.113.7");
        // fingerprint mapping: doc.ja3 = ja3_hash, doc.ja3_full = ja3
        assert_eq!(v["ja3"], "deadbeefcafebabedeadbeefcafebabe");
        assert_eq!(v["ja3_full"], "771,4865-4866,0-23,29-23,0");
        assert_eq!(v["ja4"], "t13d1516h2_8daaf6152771_b186095e22b6");
        assert_eq!(v["latency_ms"], 42);
        assert_eq!(v["bytes_out"], 1234);
        assert_eq!(v["kind"], "page");
        assert_eq!(v["headers"]["user-agent"], "Mozilla/5.0");
        assert_eq!(v["headers"]["referer"], "https://t.co/abc");
        assert_eq!(v["headers"]["sni"], "subfrost.io");
        assert_eq!(v["headers_truncated"], false);
    }

    #[test]
    fn build_event_omits_missing_source_ip_and_referer() {
        let f = AccessFields {
            fp: None, host: "subfrost.io", path: "/api/x", method: "POST",
            status: 503, source_ip: None, user_agent: "", xff: "",
            referer: None, latency_ms: 0, bytes_out: 0,
            instance: "tlsd-core", now_ms: 1_700_000_000_000,
        };
        let v = build_access_event(&f);
        assert!(v.get("source_ip").is_none(), "source_ip must be omitted when None (ES ip field)");
        assert_eq!(v["ja3"], "");
        assert_eq!(v["kind"], "api");
        assert!(v["headers"].get("referer").is_none());
    }

    #[test]
    fn daily_index_formats_utc() {
        // 1_700_000_000_000 ms = 2023-11-14T22:13:20Z
        assert_eq!(daily_index("subfrost-cdn", 1_700_000_000_000), "subfrost-cdn-2023.11.14");
    }

    #[test]
    fn bulk_body_frames_create_lines() {
        let v = json!({"ts": 1_700_000_000_000i64, "x": 1});
        let body = bulk_body("subfrost-cdn", std::slice::from_ref(&v));
        let lines: Vec<&str> = body.lines().collect();
        assert_eq!(lines.len(), 2);
        assert_eq!(lines[0], r#"{"create":{"_index":"subfrost-cdn-2023.11.14"}}"#);
        assert!(lines[1].contains(r#""x":1"#));
        assert!(body.ends_with('\n'));
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /c/refs/tlsfetch
cargo test -p tlsd access_log::tests 2>&1 | tail -25
```

Expected: FAIL de compilação — `AccessFields`/`build_access_event`/`daily_index`/`bulk_body` não existem; `chrono` ausente.

- [ ] **Step 3: Adicionar `chrono` ao `tlsd/Cargo.toml`**

Em `C:\refs\tlsfetch\crates\tlsd\Cargo.toml`, na seção `[dependencies]`, adicionar (chrono já está no Cargo.lock do workspace; `default-features=false` + `clock` basta pra `Utc::now`/format):

```toml
chrono = { version = "0.4", default-features = false, features = ["clock"] }
```

- [ ] **Step 4: Implementar as funções puras**

Em `access_log.rs` (acima do `mod tests`), adicionar:

```rust
use chrono::{TimeZone, Utc};
use serde_json::{json, Value};
use tlsfetch_transport::TlsFingerprint;

/// Primitives extracted from the request/response at emit time. All borrows —
/// the caller (response_filter) owns the Session/ResponseHead.
pub struct AccessFields<'a> {
    pub fp: Option<&'a TlsFingerprint>,
    pub host: &'a str,
    pub path: &'a str,
    pub method: &'a str,
    pub status: u16,
    pub source_ip: Option<&'a str>,
    pub user_agent: &'a str,
    pub xff: &'a str,
    pub referer: Option<&'a str>,
    pub latency_ms: u64,
    pub bytes_out: u64,
    pub instance: &'a str,
    pub now_ms: i64,
}

/// Build the strict subfrost-cdn-* access doc. Field mapping mirrors
/// subfrost.io/lib/telemetry/access-event.ts EXACTLY: doc.ja3 = fp.ja3_hash,
/// doc.ja3_full = fp.ja3, doc.ja4 = fp.ja4. `ts` is epoch-millis (the ES `date`
/// field accepts epoch_millis). `source_ip` is OMITTED when None (ES `ip` field
/// rejects/ignores empty). `path` carries no query string.
pub fn build_access_event(f: &AccessFields) -> Value {
    let path = f.path.split('?').next().unwrap_or(f.path);
    let (ja3, ja3_full, ja4) = match f.fp {
        Some(fp) => (fp.ja3_hash.as_str(), fp.ja3.as_str(), fp.ja4.as_str()),
        None => ("", "", ""),
    };
    let mut headers = serde_json::Map::new();
    headers.insert("sni".to_string(), json!(f.host));
    headers.insert("user-agent".to_string(), json!(f.user_agent));
    headers.insert("x-forwarded-for".to_string(), json!(f.xff));
    if let Some(r) = f.referer {
        if !r.is_empty() {
            headers.insert("referer".to_string(), json!(r));
        }
    }
    let mut doc = serde_json::Map::new();
    doc.insert("ts".to_string(), json!(f.now_ms));
    doc.insert("service".to_string(), json!("tlsd-ingress"));
    doc.insert("instance".to_string(), json!(f.instance));
    doc.insert("host".to_string(), json!(f.host));
    doc.insert("path".to_string(), json!(path));
    doc.insert("method".to_string(), json!(f.method));
    doc.insert("status".to_string(), json!(f.status));
    if let Some(ip) = f.source_ip {
        if !ip.is_empty() {
            doc.insert("source_ip".to_string(), json!(ip));
        }
    }
    doc.insert("ja3".to_string(), json!(ja3));
    doc.insert("ja3_full".to_string(), json!(ja3_full));
    doc.insert("ja4".to_string(), json!(ja4));
    doc.insert("latency_ms".to_string(), json!(f.latency_ms));
    doc.insert("bytes_out".to_string(), json!(f.bytes_out));
    doc.insert("headers".to_string(), Value::Object(headers));
    doc.insert("headers_truncated".to_string(), json!(false));
    doc.insert("kind".to_string(), json!(classify_kind(f.method, path).as_str()));
    Value::Object(doc)
}

/// `subfrost-cdn-YYYY.MM.DD` (UTC) for the given epoch-millis.
pub fn daily_index(prefix: &str, now_ms: i64) -> String {
    let dt = Utc.timestamp_millis_opt(now_ms).single().unwrap_or_else(Utc::now);
    format!("{prefix}-{}", dt.format("%Y.%m.%d"))
}

/// ES `_bulk` body: per doc a `create` action line (index derived from the doc's
/// own `ts`) + the doc line. Trailing newline required by the _bulk API.
pub fn bulk_body(prefix: &str, events: &[Value]) -> String {
    let mut out = String::with_capacity(events.len() * 512);
    for ev in events {
        let now_ms = ev.get("ts").and_then(|t| t.as_i64()).unwrap_or(0);
        let index = daily_index(prefix, now_ms);
        out.push_str(&json!({ "create": { "_index": index } }).to_string());
        out.push('\n');
        out.push_str(&ev.to_string());
        out.push('\n');
    }
    out
}
```

- [ ] **Step 5: Rodar e confirmar que passa**

```bash
cd /c/refs/tlsfetch
cargo test -p tlsd access_log::tests 2>&1 | tail -25
```

Expected: todos os testes de `access_log` PASS (classifier + build_event + daily_index + bulk_body).

- [ ] **Step 6: Commit**

```bash
cd /c/refs/tlsfetch
git add crates/tlsd/src/access_log.rs crates/tlsd/Cargo.toml crates/tlsd/Cargo.lock
git commit -m "feat(tlsd): build_access_event + bulk_body + daily_index (schema parity w/ Parte B)"
```

---

### Task 4: `AccessLogShipper` — canal bounded + loop de flush (drop-on-full)

**Files:**
- Modify: `C:\refs\tlsfetch\crates\tlsd\src\access_log.rs`

**Interfaces:**
- Consumes: `TelemetryConfig` (Task 2); `bulk_body` (Task 3).
- Produces:
  - `pub struct AccessLogShipper { tx: tokio::sync::mpsc::Sender<serde_json::Value> }` (Clone)
  - `pub fn spawn(cfg: &crate::config::TelemetryConfig) -> Option<AccessLogShipper>` (None se `!enabled`; spawna o loop)
  - `pub fn try_emit(&self, event: serde_json::Value)` (não-bloqueante; drop+log on full)

- [ ] **Step 1: Escrever o teste que falha**

Adicionar ao `mod tests` em `access_log.rs`:

```rust
    #[tokio::test]
    async fn shipper_disabled_returns_none() {
        let cfg = crate::config::TelemetryConfig::default(); // enabled=false
        assert!(AccessLogShipper::spawn(&cfg).is_none());
    }

    #[tokio::test]
    async fn try_emit_drops_when_full_without_blocking() {
        // capacity 1, never-draining receiver held open by a stalled loop is hard
        // to simulate; instead build a shipper around a tiny channel directly.
        let (tx, _rx) = tokio::sync::mpsc::channel::<serde_json::Value>(1);
        let s = AccessLogShipper { tx };
        // First send fills the buffer; subsequent try_emit must NOT panic/block.
        s.try_emit(json!({"n": 1}));
        s.try_emit(json!({"n": 2})); // dropped (buffer full), must return immediately
        s.try_emit(json!({"n": 3})); // dropped
        // Reaching here without hang/panic is the assertion.
    }
```

- [ ] **Step 2: Rodar e confirmar que falha**

```bash
cd /c/refs/tlsfetch
cargo test -p tlsd access_log::tests::shipper 2>&1 | tail; cargo test -p tlsd access_log::tests::try_emit 2>&1 | tail
```

Expected: FAIL de compilação — `AccessLogShipper` não existe.

- [ ] **Step 3: Implementar o shipper**

Adicionar em `access_log.rs`:

```rust
use std::sync::atomic::{AtomicU64, Ordering};
use std::sync::Arc;
use std::time::Duration;
use tokio::sync::mpsc;

/// Handle to the access-log shipper. Cloneable, cheap (Arc'd channel). The
/// caller emits via `try_emit` (non-blocking); a background task batches and
/// POSTs to ES `_bulk`. Telemetry NEVER blocks the request path.
#[derive(Clone)]
pub struct AccessLogShipper {
    pub(crate) tx: mpsc::Sender<Value>,
}

static DROPPED: AtomicU64 = AtomicU64::new(0);

impl AccessLogShipper {
    /// Spawn the background flush loop. Returns None when telemetry is disabled.
    pub fn spawn(cfg: &crate::config::TelemetryConfig) -> Option<AccessLogShipper> {
        if !cfg.enabled {
            return None;
        }
        let (tx, rx) = mpsc::channel::<Value>(cfg.channel_capacity.max(1));
        let es_url = cfg.es_url.trim_end_matches('/').to_string();
        let index_prefix = cfg.index_prefix.clone();
        let flush_max = cfg.flush_max_docs.max(1);
        let flush_interval = Duration::from_millis(cfg.flush_interval_ms.max(100));
        log::info!(
            "tlsd: access-log shipper enabled (es_url={es_url}, prefix={index_prefix}, \
             flush={flush_max} docs / {}ms)",
            flush_interval.as_millis()
        );
        tokio::spawn(flush_loop(rx, es_url, index_prefix, flush_max, flush_interval));
        Some(AccessLogShipper { tx })
    }

    /// Non-blocking emit. On a full channel the event is dropped (counted) so the
    /// request path never stalls on telemetry.
    pub fn try_emit(&self, event: Value) {
        if self.tx.try_send(event).is_err() {
            let n = DROPPED.fetch_add(1, Ordering::Relaxed) + 1;
            // Log sparsely to avoid log spam under sustained backpressure.
            if n % 1000 == 1 {
                log::warn!("tlsd: access-log shipper dropped {n} events (channel full / closed)");
            }
        }
    }
}

async fn flush_loop(
    mut rx: mpsc::Receiver<Value>,
    es_url: String,
    index_prefix: String,
    flush_max: usize,
    flush_interval: Duration,
) {
    let mut buf: Vec<Value> = Vec::with_capacity(flush_max);
    let mut ticker = tokio::time::interval(flush_interval);
    ticker.set_missed_tick_behavior(tokio::time::MissedTickBehavior::Delay);
    loop {
        tokio::select! {
            maybe = rx.recv() => {
                match maybe {
                    Some(ev) => {
                        buf.push(ev);
                        if buf.len() >= flush_max {
                            flush(&es_url, &index_prefix, &mut buf).await;
                        }
                    }
                    None => {
                        // Channel closed (shutdown): final flush + exit.
                        flush(&es_url, &index_prefix, &mut buf).await;
                        return;
                    }
                }
            }
            _ = ticker.tick() => {
                flush(&es_url, &index_prefix, &mut buf).await;
            }
        }
    }
}

async fn flush(es_url: &str, index_prefix: &str, buf: &mut Vec<Value>) {
    if buf.is_empty() {
        return;
    }
    let body = bulk_body(index_prefix, buf);
    let n = buf.len();
    buf.clear();
    if let Err(e) = es_bulk_post(es_url, &body).await {
        log::warn!("tlsd: access-log _bulk POST failed ({n} docs dropped): {e}");
    }
}
```

- [ ] **Step 4: Rodar e confirmar que passa**

```bash
cd /c/refs/tlsfetch
cargo test -p tlsd access_log::tests 2>&1 | tail -25
```

Expected: PASS (incl. `shipper_disabled_returns_none`, `try_emit_drops_when_full_without_blocking`). `es_bulk_post` ainda não existe → este step adiciona uma referência a função inexistente; portanto implementar `es_bulk_post` no MESMO step (ver Step 5) antes de rodar. **Ordem real:** escrever Step 5 antes de rodar o teste.

- [ ] **Step 5: Implementar `es_bulk_post` (HTTP/1.1 cru sobre tokio TCP)**

ES é HTTP puro intra-cluster (sem auth, sem TLS). Conexão por flush, `Connection: close`, lê até EOF. Adicionar em `access_log.rs`:

```rust
use tokio::io::{AsyncReadExt, AsyncWriteExt};
use tokio::net::TcpStream;

/// POST an NDJSON `_bulk` body to ES over plain HTTP/1.1. Fresh connection per
/// call, `Connection: close`, read-to-EOF. Best-effort: returns Err on any
/// transport/HTTP/ES-level failure so the caller can log+drop. NEVER called on
/// the request hot path (only from the background flush loop).
async fn es_bulk_post(es_url: &str, body: &str) -> Result<(), String> {
    // Parse host:port from es_url (expects http://host:port[/...]).
    let rest = es_url.strip_prefix("http://").ok_or("es_url must be http://")?;
    let authority = rest.split('/').next().unwrap_or(rest);
    let (host, port) = match authority.rsplit_once(':') {
        Some((h, p)) => (h, p.parse::<u16>().map_err(|_| "bad port")?),
        None => (authority, 80u16),
    };
    let mut stream = TcpStream::connect((host, port))
        .await
        .map_err(|e| format!("connect {authority}: {e}"))?;
    let req = format!(
        "POST /_bulk HTTP/1.1\r\nHost: {host}\r\nContent-Type: application/x-ndjson\r\n\
         Content-Length: {}\r\nConnection: close\r\n\r\n",
        body.len()
    );
    stream.write_all(req.as_bytes()).await.map_err(|e| format!("write head: {e}"))?;
    stream.write_all(body.as_bytes()).await.map_err(|e| format!("write body: {e}"))?;
    stream.flush().await.map_err(|e| format!("flush: {e}"))?;
    let mut resp = Vec::new();
    stream.read_to_end(&mut resp).await.map_err(|e| format!("read: {e}"))?;
    let text = String::from_utf8_lossy(&resp);
    let status_line = text.lines().next().unwrap_or("");
    // Expect "HTTP/1.1 200 OK". Also surface ES partial-failure ("errors":true).
    let http_ok = status_line.contains(" 200 ") || status_line.contains(" 201 ");
    if !http_ok {
        return Err(format!("ES status: {status_line}"));
    }
    // _bulk returns 200 even with per-item errors; flag them.
    if let Some(idx) = text.find("\"errors\":") {
        let tail = &text[idx..idx + 16.min(text.len() - idx)];
        if tail.contains("\"errors\":true") {
            return Err("ES _bulk reported per-item errors (mapping/strict?)".to_string());
        }
    }
    Ok(())
}
```

(Reordenar: este Step 5 vem ANTES de rodar o Step 4. Mantidos separados só para isolar o shipper da camada HTTP na leitura.)

- [ ] **Step 6: Rodar a suíte do módulo + commit**

```bash
cd /c/refs/tlsfetch
cargo test -p tlsd access_log:: 2>&1 | tail -25
```

Expected: todos PASS.

```bash
git add crates/tlsd/src/access_log.rs
git commit -m "feat(tlsd): AccessLogShipper (bounded channel, drop-on-full, _bulk flush loop)"
```

---

### Task 5: Wire — `ConfigProxy` emite no `response_filter`; spawn no runtime

**Files:**
- Modify: `C:\refs\tlsfetch\crates\tlsd\src\proxy.rs` (campo `shipper`; `CTX` com `started`; `new_ctx`; `with_shipper`; emit no `response_filter`; extrair `effective_client_ip`)
- Modify: `C:\refs\tlsfetch\crates\tlsd\src\runtime.rs` (spawn + `with_shipper`)

**Interfaces:**
- Consumes: `AccessLogShipper` (Task 4), `build_access_event`/`AccessFields` (Task 3); `cfg.telemetry` (Task 2).
- Produces: `ConfigProxy::with_shipper(self, AccessLogShipper) -> Self`; emit por request no `response_filter`.

- [ ] **Step 1: Adicionar o campo `shipper` + builder + CTX com `started`**

Em `crates/tlsd/src/proxy.rs`:

1. No fim da struct `ConfigProxy` (após `app_dispatch`, antes do `}` na linha ~174), adicionar:

```rust
    /// Access-log shipper (Peça C). When `Some`, `response_filter` emits one
    /// subfrost-cdn-* access event per upstream response. None = telemetry off.
    shipper: Option<crate::access_log::AccessLogShipper>,
```

2. Em `build_inner` (ambos os `#[cfg]`), inicializar `shipper: None` junto aos outros campos do `ConfigProxy { ... }` retornado. (Procurar onde os campos são preenchidos — adicionar `shipper: None,`.)

3. Adicionar o builder (perto de `with_metrics`/`with_app_registry`):

```rust
    /// Attach the access-log shipper (Peça C). Called from runtime after the
    /// async shipper task is spawned. No-op-friendly: pass the handle only when
    /// `[telemetry].enabled`.
    pub fn with_shipper(mut self, shipper: crate::access_log::AccessLogShipper) -> Self {
        self.shipper = Some(shipper);
        self
    }
```

4. Trocar o `CTX` e `new_ctx` (linhas ~1003-1004):

```rust
    type CTX = RequestCtx;
    fn new_ctx(&self) -> Self::CTX {
        RequestCtx { started: std::time::Instant::now() }
    }
```

E definir a struct (perto do topo do `impl ProxyHttp` ou logo antes, no módulo):

```rust
/// Per-request scratch. `started` lets response_filter compute latency_ms for
/// the access-log shipper without touching the generic proxy lifecycle.
pub struct RequestCtx {
    pub started: std::time::Instant,
}
```

- [ ] **Step 2: Extrair `effective_client_ip` (reuso da lógica de XFF/trusted_proxies)**

Em `proxy.rs`, a lógica do IP efetivo vive inline em `upstream_request_filter` (bloco `if self.forward_client_ip { if let Some(addr) = session.peer_addr { ... } }`). Extrair pra um método e chamar nos dois lugares:

```rust
impl ConfigProxy {
    /// The real client IP per `forward_client_ip` + `trusted_proxies`: if the
    /// immediate peer is a trusted proxy AND the request carries XFF, the client
    /// is the right-most-untrusted entry in that chain; otherwise it's the peer.
    /// Mirrors the X-Forwarded-For/X-Real-IP derivation in upstream_request_filter.
    fn effective_client_ip(&self, session: &Session) -> Option<std::net::IpAddr> {
        let addr = session.peer_addr?;
        if !self.forward_client_ip {
            return Some(addr.ip());
        }
        let peer_trusted = ip_is_trusted(addr.ip(), &self.trusted_proxies);
        if peer_trusted {
            if let Some(chain) = session.req_header("X-Forwarded-For") {
                // right-most untrusted entry
                for part in chain.split(',').rev() {
                    if let Ok(ip) = part.trim().parse::<std::net::IpAddr>() {
                        if !ip_is_trusted(ip, &self.trusted_proxies) {
                            return Some(ip);
                        }
                    }
                }
            }
        }
        Some(addr.ip())
    }
}
```

> ⚠️ Implementer: **leia o bloco real em `upstream_request_filter`** (o `effective_ip` perto da linha ~1505+) e faça `effective_client_ip` reproduzir EXATAMENTE a mesma semântica; depois substitua o cálculo inline lá por uma chamada a `self.effective_client_ip(session)` para não divergir. Se a forma exata diferir do esboço acima, a versão do `upstream_request_filter` é a fonte de verdade.

- [ ] **Step 3: Emitir no `response_filter`**

Em `proxy.rs`, no fim do corpo do `async fn response_filter` (após a lógica de Cache-Status, antes do `Ok(())` final), adicionar:

```rust
        // Access-log shipper (Peça C): one event per upstream response.
        if let Some(shipper) = self.shipper.as_ref() {
            let now_ms = chrono::Utc::now().timestamp_millis();
            let latency_ms = _ctx.started.elapsed().as_millis() as u64;
            let host = session.req_header("Host").unwrap_or("").to_string();
            let method = session.request_head.method.clone();
            let path = session.request_head.path.clone();
            let user_agent = session.req_header("User-Agent").unwrap_or("").to_string();
            let xff = session.req_header("X-Forwarded-For").unwrap_or("").to_string();
            let referer = session.req_header("Referer").map(|s| s.to_string());
            let source_ip = self.effective_client_ip(session).map(|ip| ip.to_string());
            let bytes_out = upstream_head
                .headers
                .iter()
                .find(|(k, _)| k.eq_ignore_ascii_case("Content-Length"))
                .and_then(|(_, v)| v.parse::<u64>().ok())
                .unwrap_or(0);
            let fields = crate::access_log::AccessFields {
                fp: session.tls_fingerprint.as_ref(),
                host: &host,
                path: &path,
                method: &method,
                status: upstream_head.status,
                source_ip: source_ip.as_deref(),
                user_agent: &user_agent,
                xff: &xff,
                referer: referer.as_deref(),
                latency_ms,
                bytes_out,
                instance: "tlsd-core",
                now_ms,
            };
            shipper.try_emit(crate::access_log::build_access_event(&fields));
        }
        Ok(())
```

> Nota: `_ctx` passa a ser usado — renomear o parâmetro de `_ctx` para `ctx` na assinatura do `response_filter`. O `instance` é fixo `"tlsd-core"` (v1); se quiser vir da config, threadar `cfg.telemetry.instance` pro ConfigProxy num campo — fora do escopo v1, manter literal.

- [ ] **Step 4: Spawn + attach no `runtime.rs`**

Em `crates/tlsd/src/runtime.rs`, antes do bloco `let handler = ...`, criar o shipper (contexto async, runtime up):

```rust
    let shipper = crate::access_log::AccessLogShipper::spawn(&cfg.telemetry);
```

E anexar nos DOIS branches (`#[cfg(feature = "wasm")]` e `#[cfg(not(...))]`). No branch não-wasm, trocar:

```rust
    #[cfg(not(feature = "wasm"))]
    let handler = {
        let mut proxy = ConfigProxy::build(&cfg)
            .context("build proxy")?
            .with_metrics(exporter_arc.clone());
        if let Some(s) = shipper.clone() {
            proxy = proxy.with_shipper(s);
        }
        Arc::new(proxy)
    };
```

No branch wasm, após o `.with_metrics(...)`/`with_app_registry`, antes do `Arc::new(proxy)`:

```rust
        if let Some(s) = shipper.clone() {
            proxy = proxy.with_shipper(s);
        }
```

(`shipper` é `Option<AccessLogShipper>`, `Clone`; usar `.clone()` por causa dos dois branches.)

- [ ] **Step 5: Compilar (com wasm) + rodar testes do tlsd**

```bash
cd /c/refs/tlsfetch
cargo build -p tlsd --features wasm 2>&1 | tail -20
cargo test -p tlsd 2>&1 | tail -30
```

Expected: build OK; testes do `tlsd` PASS (incl. `access_log::` + `config::tests::telemetry`). Se o build local no Windows falhar por deps nativas, validar no Cloud Build (Task 9) — mas o `cargo build` é o gate; não prosseguir pro deploy sem um build verde (local OU Cloud Build).

- [ ] **Step 6: Commit**

```bash
cd /c/refs/tlsfetch
git add crates/tlsd/src/proxy.rs crates/tlsd/src/runtime.rs
git commit -m "feat(tlsd): emit access-log event per response (shipper wired via response_filter + runtime spawn)"
```

---

### Task 6: (subfrost.io) config `[telemetry]` no `tlsd.yaml` + bump de imagem

**Files:**
- Modify: `C:\Alkanes Geral Dev\subfrost.io\k8s\tlsd-ingress\tlsd.yaml` (bloco `[telemetry]` no ConfigMap `tlsd-config` + bump da `image:` tag)

**Interfaces:**
- Consumes: a imagem buildada na Task 9 (tag).
- Produces: o DaemonSet do tlsd rodando a imagem nova com `[telemetry].enabled=true`.

> ⚠️ Esta task **depende da imagem existir** (Task 9). Em subagent-driven, executar a Task 9 (build) ANTES de fechar esta. A edição do YAML pode ser preparada antes; o bump da tag usa a tag real da Task 9.

- [ ] **Step 1: Adicionar o bloco `[telemetry]` ao `tlsd.toml` no ConfigMap**

Em `k8s/tlsd-ingress/tlsd.yaml`, dentro de `data: tlsd.toml: |`, no fim da seção `[server]` (antes do primeiro `[[listener]]`), adicionar:

```toml
    [telemetry]
    enabled = true
    es_url = "http://elasticsearch.telemetry.svc.cluster.local:9200"
    index_prefix = "subfrost-cdn"
    instance = "tlsd-core"
```

(Os demais campos usam os defaults da Task 2.)

- [ ] **Step 2: Bump da tag da imagem**

Em `k8s/tlsd-ingress/tlsd.yaml`, trocar a linha `image:` do container `tlsd` pela tag buildada na Task 9:

```yaml
          image: us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/tlsd:<TAG_DA_TASK_9>
```

(Manter aspas se a tag puder ser interpretada como número/float pelo YAML.)

- [ ] **Step 3: Validar o YAML**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
python -c "import yaml; list(yaml.safe_load_all(open('k8s/tlsd-ingress/tlsd.yaml'))); print('YAML OK')"
```

Expected: `YAML OK`.

- [ ] **Step 4: Commit** (na branch `feat/tlsd-access-log-shipper` do subfrost.io)

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add k8s/tlsd-ingress/tlsd.yaml
git commit -m "deploy(tlsd): enable [telemetry] access-log shipper + bump tlsd image (Peça C)"
```

---

### Task 7: (subfrost.io) flip do `esSource` pro tlsd via env

**Files:**
- Modify: deploy do app — env `ANALYTICS_INSTANCE` (ESO/Secret ou env do Deployment do app). Não é mudança de código (o Plano 1 já implementou a leitura de `ANALYTICS_INSTANCE`).

**Interfaces:**
- Consumes: `analyticsFilters` do Plano 1 (lê `ANALYTICS_INSTANCE`).
- Produces: dashboard lendo docs `instance:tlsd-core`.

> Esta é uma task **operacional de cutover**, executada DEPOIS da validação (Task 10). Documentada aqui pra completude; não tem código.

- [ ] **Step 1 (soak):** setar `ANALYTICS_INSTANCE=edge-middleware` no deploy do app **antes** de ligar o tlsd → dashboard lê só o middleware enquanto o tlsd é validado.
- [ ] **Step 2 (flip):** após validar (Task 10), setar `ANALYTICS_INSTANCE=tlsd-core` → dashboard passa a ler o tlsd.
- [ ] **Step 3 (rollback):** voltar `ANALYTICS_INSTANCE=edge-middleware` (instantâneo) se algo destoar.

---

### Task 8: (subfrost.io) template `kind` no ES vivo + mapping do índice do dia

**Files:**
- Usa: `k8s/telemetry/index-template-configmap.yaml` (Plano 1) + `k8s/telemetry/es-bootstrap-job.yaml`.
- Tooling: `C:\Alkanes Geral Dev\.ioenv-extracted\kubectl-io.sh`.

> Operacional, executada ANTES de ligar o tlsd (Task 6). O `kind` no template (Plano 1) só vale pra índices NOVOS; o índice do dia já criado precisa do campo adicionado ao mapping.

- [ ] **Step 1: Re-aplicar o template (re-rodar o bootstrap job)** — após o Plano 1 estar mergeado na `main` e reconciliado por Flux, deletar+recriar o `es-bootstrap-job` (Job é one-shot):

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
bash "$KIO" -n telemetry delete job es-bootstrap --ignore-not-found
bash "$KIO" -n telemetry apply -f -   # (aplicar o es-bootstrap-job.yaml reconciliado; ou deixar o Flux recriar)
```

(Se o Flux gerencia o Job, anotar o source→kustomization pra reconciliar; ver deploy gotchas.)

- [ ] **Step 2: Adicionar `kind` ao mapping do índice do dia** (adicionar campo a mapping `strict` é permitido):

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
TODAY=$(date -u +%Y.%m.%d)
bash "$KIO" -n telemetry exec elasticsearch-0 -c elasticsearch -- \
  curl -fsS -X PUT "localhost:9200/subfrost-cdn-$TODAY/_mapping" \
  -H 'content-type: application/json' \
  -d '{"properties":{"kind":{"type":"keyword","ignore_above":16}}}'
```

Expected: `{"acknowledged":true}`.

- [ ] **Step 3: Confirmar o template tem `kind`:**

```bash
bash "$KIO" -n telemetry exec elasticsearch-0 -c elasticsearch -- \
  curl -fsS "localhost:9200/_index_template/subfrost-cdn" | grep -o '"kind"'
```

Expected: `"kind"`.

---

### Task 9: Build da imagem do tlsd (Cloud Build) — `--features wasm`

**Files:**
- Usa: `C:\refs\tlsfetch\cloudbuild-tlsd-io.yaml` + `docker/Dockerfile.tlsd-prebuilt`.

**Interfaces:**
- Produces: imagem `us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/tlsd:<TAG>` (tag = `acc-<short-sha>`).

> O `cloudbuild-tlsd-io.yaml` é **prebuilt**: precisa de `target/release/tlsd` já compilado (Linux glibc 2.39). Como o Windows não builda, escolher UMA via:
> - **(a) Cloud Build do source (recomendado):** adicionar `docker/Dockerfile.tlsd-source` (multi-stage: `rust:1.91` compila `cargo build --release -p tlsd --features wasm` → runtime `ubuntu:24.04`) + um `cloudbuild-tlsd-io-source.yaml` que builda esse Dockerfile. Compila no Cloud Build (Linux), sem host local. Risco: tempo de compile do workspace → usar `machineType: E2_HIGHCPU_32` + `timeout: 3600s` + cache (cargo-chef) se preciso.
> - **(b) WSL2 ubuntu-24.04 + Rust:** `cargo build --release -p tlsd --features wasm` no WSL, depois `gcloud builds submit --config cloudbuild-tlsd-io.yaml`.

- [ ] **Step 1 (via a, recomendado): criar `docker/Dockerfile.tlsd-source`**

```dockerfile
# tlsd — source build (compiles inside Cloud Build; no local toolchain needed).
FROM rust:1.91-bookworm AS builder
WORKDIR /src
COPY . .
# --features wasm is REQUIRED (app_modules silently ignored without it).
RUN rustup target add wasm32-wasip2 \
 && cargo build --release -p tlsd --features wasm
FROM ubuntu:24.04
RUN apt-get update \
 && apt-get install -y --no-install-recommends ca-certificates \
 && rm -rf /var/lib/apt/lists/*
COPY --from=builder /src/target/release/tlsd /usr/local/bin/tlsd
RUN useradd -u 65532 -r -s /usr/sbin/nologin tlsd
USER 65532:65532
ENTRYPOINT ["/usr/local/bin/tlsd"]
```

E `cloudbuild-tlsd-io-source.yaml`:

```yaml
steps:
  - name: 'gcr.io/cloud-builders/docker'
    args: ['build','-f','docker/Dockerfile.tlsd-source','-t','us-central1-docker.pkg.dev/$PROJECT_ID/subfrost-docker/tlsd:${_TAG}','.']
images:
  - 'us-central1-docker.pkg.dev/$PROJECT_ID/subfrost-docker/tlsd:${_TAG}'
options: { logging: CLOUD_LOGGING_ONLY, machineType: 'E2_HIGHCPU_32', diskSizeGb: 100 }
timeout: '3600s'
```

- [ ] **Step 2: Submeter o build** (precisa de perms GCP no projeto night-wolves-jogging — as que o flex deu; autenticar com a conta/SA que a gente usa pro AR):

```bash
cd /c/refs/tlsfetch
TAG="acc-$(git rev-parse --short HEAD)"
gcloud builds submit --config cloudbuild-tlsd-io-source.yaml \
  --substitutions=_TAG="$TAG" --project night-wolves-jogging .
echo "image tag: $TAG"
```

Expected: build SUCCESS; imagem no AR.

- [ ] **Step 3: Confirmar a imagem no AR**

```bash
gcloud artifacts docker images list \
  us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/tlsd \
  --include-tags --filter="tags:$TAG" --project night-wolves-jogging 2>&1 | head
```

Expected: a tag aparece. Usar `$TAG` na Task 6 Step 2.

> Se o `cargo build --features wasm` falhar no Cloud Build por causa do `wasm32-wasip2` rust-std (toolchain note no CDN_RUST_PORT_DESIGN.md), garantir `rustup target add wasm32-wasip2` no Dockerfile (já incluído) e que a versão do `rust:` tem o target. Se persistir, pinar `rust:1.91`.

---

### Task 10: Deploy + validação (cutover, GitOps)

**Files:** nenhum novo — orquestra Tasks 6/8/9 + verifica.

**Sequência (reversível):**

- [ ] **Step 1:** Merge do **Plano 1** (PR #145) na `main` do subfrost.io (decisão do Vitor) → Flux aplica o template `kind` (ConfigMap). Rodar Task 8 (re-bootstrap + PUT mapping no índice do dia).
- [ ] **Step 2:** Garantir `ANALYTICS_INSTANCE=edge-middleware` no app (Task 7 Step 1) → dashboard lê só o middleware.
- [ ] **Step 3:** Build da imagem (Task 9). PR do subfrost.io com Task 6 (config `[telemetry]` + bump tag) → merge → Flux. Reconcile: anotar `gitrepository subfrost-io` ANTES do `kustomization` (ns flux-system) via `kubectl-io.sh`.
- [ ] **Step 4: Validar** docs do tlsd no ES (via `kubectl-io.sh`):

```bash
KIO="C:/Alkanes Geral Dev/.ioenv-extracted/kubectl-io.sh"
TODAY=$(date -u +%Y.%m.%d)
bash "$KIO" -n telemetry exec elasticsearch-0 -c elasticsearch -- \
  curl -fsS "localhost:9200/subfrost-cdn-$TODAY/_count" \
  -H 'content-type: application/json' \
  -d '{"query":{"match_phrase":{"instance":"tlsd-core"}}}'
```

Expected: `count` > 0 e crescendo. Verificar também: nenhum `mapper_parsing_exception` nos logs do tlsd (`kubectl-io.sh -n tlsd-ingress logs ds/tlsd -c tlsd | grep -i "_bulk\|drop"`); `ja4` não-vazio; distribuição de `kind` plausível:

```bash
bash "$KIO" -n telemetry exec elasticsearch-0 -c elasticsearch -- \
  curl -fsS "localhost:9200/subfrost-cdn-$TODAY/_search" \
  -H 'content-type: application/json' \
  -d '{"size":0,"query":{"term":{"instance":"tlsd-core"}},"aggs":{"k":{"terms":{"field":"kind"}}}}'
```

- [ ] **Step 5: Invariante de não-bloqueio** — confirmar que o ingress segue saudável sob a captura: latência do site normal, `tlsd` `/healthz` OK, e (teste de resiliência) que parar o ES NÃO derruba o tlsd (drops contados, proxy intacto). Smoke: home 200, /articles 200, /api/fp 200.
- [ ] **Step 6: Flip** `ANALYTICS_INSTANCE=tlsd-core` (Task 7 Step 2). Verificar o dashboard `/admin/marketing/analytics` consistente (pageviews na ordem do middleware; visitors/sessions plausíveis). Soak 24-48h.
- [ ] **Step 7: Aposentar o middleware** — PR removendo `capturePageview` do `subfrost.io/middleware.ts` (e o param `event` se não usado em outro lugar). Após merge, opcional `ANALYTICS_INSTANCE` unset.

---

## Self-Review

**Spec coverage (do spec §4.1):**
- U1 (`AccessEvent` builder) → Task 3 (`build_access_event`). ✅
- U2 (classificador `kind`) → Task 1 (`classify_kind`). ✅
- U3 (shipper async, drop-on-full) → Task 4 (`AccessLogShipper` + flush loop + `es_bulk_post`). ✅
- U4 (config `[telemetry]`, off default) → Task 2. ✅
- U5 (template `kind`) → Plano 1 + Task 8 (aplicar no vivo). ✅
- U6 (esSource filtro/pin) → Plano 1 + Task 7 (flip). ✅
- U7 (cutover) → Task 10. ✅
- U8 (build/deploy) → Task 9 + Task 6. ✅
- Mapeamento de campos (§4.2) → Task 3 testes (ja3=ja3_hash etc.). ✅
- Riscos: não-bloquear (Task 4 invariante + Task 10 Step 5); source_ip (Task 5 `effective_client_ip` + omit-on-None Task 3); ES cross-ns (Task 10 Step 4); mapping strict (Task 8); volume (config `flush_*`; sampling = follow-up, ver abaixo). ✅

**Placeholder scan:** As Tasks 6/7/8/9/10 têm passos operacionais (deploy/cutover) que dependem de artefatos vivos (tag da imagem, índice do dia) — são intencionalmente parametrizados (`<TAG_DA_TASK_9>`, `$TODAY`), não placeholders de lógica. Todo código Rust está completo. A `effective_client_ip` (Task 5 Step 2) traz um esboço + instrução explícita de casar a fonte-de-verdade do `upstream_request_filter` real (a forma exata só é visível no arquivo) — é o único ponto que o implementer confirma contra o código vivo.

**Type consistency:** `AccessLogShipper` (Task 4) usado em `ConfigProxy.shipper`/`with_shipper`/runtime (Task 5). `AccessFields`/`build_access_event` (Task 3) usados no `response_filter` (Task 5). `TelemetryConfig` (Task 2) consumido por `AccessLogShipper::spawn` (Task 4) e `runtime` (Task 5). `Kind`/`classify_kind` (Task 1) usados em `build_access_event` (Task 3). Nomes batem.

**Sampling (YAGNI):** o spec menciona `sample_rate_assets`; deixei FORA do v1 (volume é medido no soak; ligar sampling é um follow-up barato se `kind:asset` incomodar). Não há task de sampling — decisão consciente registrada aqui, não um gap.

**Decisão de ordem (Task 4):** o `es_bulk_post` (Step 5) é pré-requisito do `flush` (Step 3) compilar; o implementer escreve o Step 5 ANTES de rodar o teste do Step 4. Anotado nos dois steps.
