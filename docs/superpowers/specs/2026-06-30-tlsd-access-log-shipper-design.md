# tlsd access-log shipper — Peça C da frente tlsd / first-party analytics

**Data:** 2026-06-30
**Status:** design aprovado (brainstorm fechado). Implementação ainda não começou.
**Frente:** continuação de `2026-06-30-tlsd-first-party-analytics-design.md` (Partes A+B
já MERGED+LIVE). Esta é a **Peça C**, adiada de propósito.

---

## 1. Objetivo

Mover o **produtor** dos eventos de telemetria do **app (middleware Next.js, hoje LIVE)** pro
**próprio tlsd no edge**. O tlsd vê **todo request** que chega no ingress (não só pageviews
HTML renderizadas pelo Next.js) e **já tem o fingerprint TLS na mão**. Resultado: uma base de
acesso **completa** (bots, APIs, assets, todos os hosts) com JA3/JA4 por request.

**Nada downstream muda de arquitetura:** mesmo Elasticsearch (`subfrost-cdn-*`), mesmo
`esSource`, mesmo dashboard `/admin/marketing/analytics`. Só muda **quem produz** os docs
(middleware do app → core do tlsd) e ganhamos um campo `kind` pra separar pageview de tráfego
de borda.

### Por que (driver)

- **Completude.** Hoje o middleware (`capturePageview` em `middleware.ts`) só grava
  `isCapturablePageview` — exclui `/admin`, `/api`, assets, e qualquer coisa que não seja uma
  navegação HTML pública. Perde bots que não renderizam, chamadas de API, downloads, e tráfego
  de outros hosts que o mesmo tlsd atende (ex: `cdn.subfrost.io`). O sistema legado (fp-server)
  logava **tudo** na porta.
- **Dados melhores.** O middleware assume `status:200` e `latency:0` (roda antes do handler).
  O tlsd, no proxy, tem o **status real**, **latência real** e **bytes** da resposta.
- **Diretiva do flex.** Usar o tlsd como stack de analytics foi pedido explícito do flex.

---

## 2. Estado atual (de onde a Peça C parte)

- **Partes A+B LIVE+verificadas** (PR #144 → `c0a70c9`; deploy `4aad7de`).
  - **A:** Elasticsearch endurecido e Flux-managed no ns `telemetry` (single-node, spot,
    `subfrost-cdn` template + ILM 30d, DR export→GCS). `green`.
  - **B:** captura por pageview no `middleware.ts` (`event.waitUntil(emitAccessEvent)`) lendo o
    `X-TLS-*` injetado pelo tlsd → escreve direto no ES. Página GA4→`esSource` flipada (GA4 é
    fallback via `ANALYTICS_SOURCE=ga4`).
- **tlsd em produção roda a branch `feat/tlsd-inbound-ja4`** do `pyrosec/tlsfetch` (⚠️ **não a
  master** — a master nem tem captura de JA4). Imagem viva:
  `us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/tlsd:ja4cc-58962f2-1742`,
  rodando como **DaemonSet** no ns `tlsd-ingress` (LB `34.170.98.157`, `externalTrafficPolicy:
  Local`). Config em `k8s/tlsd-ingress/tlsd.yaml` (`forward_tls_fingerprint=true`,
  `tls_fingerprint_header="X-TLS-JA4"`, `forward_client_ip=true`).

### A descoberta que fundamenta o patch

Na branch `feat/tlsd-inbound-ja4`:

- `crates/tlsd-proxy/src/session.rs` — a `Session` tem
  `pub tls_fingerprint: Option<TlsFingerprint>`, anexado no handshake via
  `with_tls_fingerprint()`.
- `crates/tlsfetch-transport/src/lib.rs` — `pub struct TlsFingerprint { ja3: String,
  ja3_hash: String, ja4: String }` (ja3 cleartext, ja3_hash = md5 lowercase hex, ja4 = FoxIO).
- `crates/tlsd/src/proxy.rs` (`upstream_request_filter`, ~linha 668) — lê
  `session.tls_fingerprint` e injeta os headers `X-TLS-JA4`/`X-TLS-JA3`/`X-TLS-JA3-Hash` no
  request upstream **quando `forward_tls_fingerprint`**.
- `crates/tlsd-proxy/src/service.rs` (~linha 361) — anexa o fingerprint na `Session`; e (~linha
  598) emite o `info!` do access-log **já com `response_head.status` e `started.elapsed()` em
  escopo**. **Esse é o ponto de emissão do shipper.** Tudo que o doc precisa
  (fingerprint + método/host/path + status + latência + bytes + peer) está vivo ali.

> **Importante:** o access-log atual (`info!`) **não persiste** o fingerprint em lugar nenhum —
> ele só é injetado como header no upstream. Por isso um sidecar de log-shipping **não**
> resolveria; capturar fingerprint na borda exige código no tlsd de qualquer jeito. O patch é
> localizado, mas é net-new.

---

## 3. Decisões (brainstorm fechado)

| # | Decisão | Escolha | Motivo |
|---|---------|---------|--------|
| 1 | Escopo | Access-log shipper no **core do tlsd** (Rust). | Completude + diretiva do flex. |
| 2 | wasip2 (enriquecer JA3/JA4) | **Fora do escopo** (follow-up). | O modelo Tier-2 do tlsd *substitui* o backend; não casa com "enriquecer-e-encaminhar". O shipper é async em Rust no core, não wasm. |
| 3 | Transporte → ES | **Direto via `_bulk`** (sem RabbitMQ). | A Parte B já escreve direto; não há bus no subfrost-io; menos peças. |
| 4 | Granularidade | Captura **tudo**, com campo **`kind`** (page/api/asset/other). | Completude (bots/borda) sem poluir as métricas de pageview. |
| 5 | Relação c/ middleware | **Complementar e virar a chave.** | Os dois escrevem (distintos por `instance`); valida o tlsd; flip do esSource; aposenta o middleware. Reversível. |
| 6 | Ambiente de dev | **Nós fazemos tudo** (spec + patch Rust + build + deploy). | O flex deu as permissões e não vai buildar. |
| 7 | Branch base do tlsd | A partir de **`feat/tlsd-inbound-ja4`**. | É o que roda em prod; a master não tem JA4. |

---

## 4. Arquitetura

```
                          ┌─────────────────────────── tlsd DaemonSet (ns tlsd-ingress) ─────────┐
client ──TLS(grey-cloud)──▶ listener (handshake → TlsFingerprint)                                  │
                          │   │                                                                     │
                          │   ▼ Session{tls_fingerprint, request_head, peer_addr, ...}              │
                          │  proxy → upstream (Next.js / cdn) ──▶ response_head{status}             │
                          │   │                                                                     │
                          │   ▼ service.rs ~598 (access-log point: status+latency+bytes in scope)  │
                          │  [NEW] build AccessEvent (+kind) ──push──▶ bounded mpsc (drop-on-full)  │
                          │                                              │                          │
                          │                              [NEW] async shipper task: batch → _bulk    │
                          └──────────────────────────────────────────────┼──────────────────────┘
                                                                          ▼
                                  Elasticsearch (ns telemetry) subfrost-cdn-YYYY.MM.DD
                                                                          ▲
                          middleware.ts capturePageview (Parte B, LIVE) ──┘  (instance:edge-middleware)
                                                                          │
                                                       esSource ◀─────────┘ (lê subfrost-cdn-*)
```

### 4.1 Componentes (unidades isoladas)

**U1 — `AccessEvent` builder (tlsd, Rust).**
*O que faz:* a partir de `&Session`, `&response_head`, `started.elapsed()`, `resp_bytes`, monta
o doc JSON no shape exato do `subfrost-cdn-*` + classifica o `kind`.
*Interface:* função pura `build_access_event(session, status, latency_ms, bytes_out, instance, now) -> AccessEvent`.
*Depende de:* `TlsFingerprint`, `RequestHead`, classificador de `kind`. **Sem I/O** (testável puro).

**U2 — classificador `kind` (tlsd, Rust).**
*O que faz:* `path (+ method) -> Kind` ∈ {page, api, asset, other}.
*Regra v1 (server-side, espelha a intenção do `capture-path.ts`):*
- `api` se path começa com `/api` (ou `/_next/data`).
- `asset` se path começa com `/_next/static`, `/static`, ou bate extensão estática
  (`.js .css .png .jpg .jpeg .gif .svg .webp .ico .woff .woff2 .ttf .map .txt .xml .json`)
  ou path == `/favicon.ico`, `/robots.txt`, `/sitemap.xml`, `/feed.xml`.
- `page` se for GET/HEAD e **não** for api/asset e **não** começar com `/admin` (paridade com
  `isCapturablePageview`: admin não conta como pageview público).
- `other` pro resto (POST não-api, OPTIONS, `/admin`, etc.).
*Interface:* `classify_kind(method, path) -> Kind`. **Pura** (testável puro).

**U3 — shipper assíncrono (tlsd, Rust).**
*O que faz:* recebe `AccessEvent` por um canal `tokio::mpsc` **bounded**; acumula em buffer;
faz flush pro ES `_bulk` a cada `flush_max_docs` **ou** `flush_interval` (o que vier antes);
em erro de rede/ES, loga e **descarta o lote** (best-effort, nunca retém indefinidamente).
*Invariante crítico:* o `try_send` no caller é **não-bloqueante** — se o canal estiver cheio,
**descarta o evento** e incrementa um contador (`telemetry_dropped_total`). **Telemetria nunca
bloqueia nem derruba o ingress.**
*Interface:* `Shipper::spawn(cfg) -> ShipperHandle`; `handle.try_emit(event)`.
*Depende de:* cliente HTTP async (o tlsd já usa um stack async — reaproveitar `reqwest`/o
cliente HTTP interno disponível no workspace; decidir no plano).

**U4 — config `[telemetry]` (tlsd, Rust).**
*O que faz:* novos campos em `cfg.server` (ou seção `[telemetry]`): `enabled` (bool, **default
false**), `es_url` (string), `index_prefix` (default `subfrost-cdn`), `instance` (default
`tlsd-core`), `flush_max_docs` (default 500), `flush_interval_ms` (default 5000),
`channel_capacity` (default 10000), `sample_rate_assets` (0.0–1.0, default 1.0).
*Interface:* parse no `config.rs`, snapshot no `ConfigProxy::build`.
*Default off* → buildar/deployar o tlsd **não liga** o shipper até a config pedir.

**U5 — template ES (`kind`) (subfrost.io, infra/GitOps).**
*O que faz:* adiciona `kind` (keyword) ao template `subfrost-cdn` (que é `dynamic=strict` no
topo — campo novo é **rejeitado** se não estiver no mapping). Onde: o configmap/bootstrap da
Parte A (`k8s/telemetry/`). Re-aplicar o template (não recria índices; ILM/settings seguem por
match de `index_patterns`).
*Compat:* docs antigos (middleware + dump) **sem** `kind` continuam válidos; queries que
filtram `kind:page` simplesmente não casam os antigos (ver U7 cutover).

**U6 — esSource: filtro `kind` + pin de `instance` (subfrost.io, app).**
*O que faz:* nas queries de **pageview/top-pages/article-engagement** do `lib/analytics/es.ts`,
adicionar `filter: { term: { kind: "page" } }` **quando** a fonte for tlsd. Visitors/sessions
(cardinalidade de `visitor_key`/`session_key`) podem ficar sobre todo o tráfego ou também
filtrar — decidir no plano (provável: visitors/sessions = todo tráfego com `ja4`; pageviews =
`kind:page`).
*Pin de `instance`:* env `ANALYTICS_INSTANCE` opcional; quando setado, esSource adiciona
`filter: { term: { instance: X } }`. **Durante o soak** = `edge-middleware` (dashboard lê só o
middleware, sem dupla contagem). **No cutover** = `tlsd-core` (ou unset depois de aposentar o
middleware). ⚠️ docs do dump/legado **não têm** `instance` → o filtro por `instance` os exclui;
aceitável (são históricos; ranges recentes não dependem deles). Se quisermos manter o legado
visível no soak, usar `bool.should[term instance=X, must_not exists instance]` — decidir no plano.

**U7 — cutover (operacional).**
Sequência reversível (detalhe em §6).

**U8 — build/deploy (GitOps).**
Binário Linux → `cloudbuild-tlsd-io.yaml` → AR `night-wolves-jogging` → bump tag no
`k8s/tlsd-ingress/tlsd.yaml` → Flux. Secret do ES via ESO (detalhe em §7).

### 4.2 Mapeamento de campos (paridade com a Parte B)

O shipper **tem que** emitir exatamente o shape de `lib/telemetry/access-event.ts`
(`AccessEvent`), senão o mapping `dynamic=strict` rejeita o doc e/ou o esSource não agrega.

| Campo do doc | Origem no tlsd | Nota |
|---|---|---|
| `ts` | relógio (ISO 8601 UTC) no momento do log | índice `subfrost-cdn-YYYY.MM.DD` derivado daqui |
| `service` | constante `"tlsd-ingress"` | igual à Parte B |
| `instance` | config (`"tlsd-core"`) | **discriminador** do cutover (B usa `"edge-middleware"`) |
| `host` | header `Host` do request | |
| `path` | `request_head.path` **sem query string** | paridade com B (`pathname`) |
| `method` | `request_head.method` | |
| `status` | `response_head.status` | **status real** (B assume 200) |
| `source_ip` | 1º IP do `X-Forwarded-For`, senão `peer_addr` (respeitar `trusted_proxies`/`forward_client_ip`) | fidelidade de IP é risco (§7) |
| `ja3` | `fp.ja3_hash` | ⚠️ doc `ja3` = **hash** md5 (B lê `x-tls-ja3-hash`) |
| `ja3_full` | `fp.ja3` | cleartext |
| `ja4` | `fp.ja4` | **deve ser não-vazio** p/ visitor/session contarem |
| `latency_ms` | `started.elapsed().as_millis()` | **latência real** (B = 0) |
| `bytes_out` | `Content-Length` da resposta, senão 0 | B = 0 |
| `headers` | `{ sni: host, "user-agent": ua, "x-forwarded-for": xff, referer?: ..., utm_*?: ... }` | `referer_src` do esSource lê `headers.referer` |
| `headers_truncated` | `false` (v1) | |
| **`kind`** | `classify_kind(method, path)` | **NOVO** (precisa no template, U5) |

Runtime fields do esSource (não vão no doc; computados na query a partir de `_source`):
`visitor_key = ja4|source_ip`, `session_key = ja4|source_ip|janela30min(ts)`,
`path_src = path`, `referer_src = headers.referer`. Como o doc acima fornece `ja4`,
`source_ip`, `ts`, `path`, `headers.referer` → **esSource funciona sem mudança nesses campos**
(a única mudança no esSource é o filtro `kind`/`instance` de U6).

---

## 5. Build & deploy

1. **Branch:** a partir de `feat/tlsd-inbound-ja4` no `pyrosec/tlsfetch`, criar
   `feat/tlsd-access-log-shipper` (ou nome equivalente). Coordenar com o flex se eles querem
   merge eventual na master (a master não tem nem o JA4 — provável que `feat/tlsd-inbound-ja4`
   vire a base; ver §8).
2. **Compilar o binário Linux:** `cargo build --release -p tlsd --features wasm` (⚠️ `--features
   wasm` **obrigatório** — sem ele os `app_modules` são ignorados silenciosamente; mantemos
   paridade com o build de prod). **Onde compilar** = decisão do plano:
   - **(a) Cloud Build do source (recomendado):** adicionar um `docker/Dockerfile.tlsd-source`
     multi-stage (builder Rust compila → runtime ubuntu:24.04) + cloudbuild que compila no
     próprio Cloud Build (Linux, sem host local). Evita WSL e o problema de glibc. Risco: tempo
     de compile (workspace grande) — mitigar com cache (cargo-chef) e/ou `timeout`/máquina maior.
   - **(b) WSL2 (ubuntu 24.04, glibc 2.39) + Rust:** compila local, depois
     `gcloud builds submit --config cloudbuild-tlsd-io.yaml`. Atenção a deps nativas do workspace.
   - **(c) VM Linux do flex:** se (a)/(b) emperrarem.
3. **Imagem:** `gcloud builds submit --config cloudbuild-tlsd-io.yaml
   --substitutions=_TAG=<tag> --ignore-file .gcloudignore.tlsd --project night-wolves-jogging .`
   → `us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/tlsd:<tag>`.
4. **Secret do ES:** o tlsd precisa de `es_url` (e auth, se houver). ESO a partir do GCP Secret
   Manager, montado no DaemonSet (ou inline na config se for só URL interna sem auth). O ES é
   `http://elasticsearch.telemetry.svc.cluster.local:9200` — **cross-ns** (`tlsd-ingress` →
   `telemetry`); validar alcançabilidade (§7c).
5. **Deploy (GitOps, subfrost.io):** editar `k8s/tlsd-ingress/tlsd.yaml`:
   - bump da `image:` tag (COM ASPAS se a tag puder virar float YAML);
   - adicionar a seção `[telemetry]` no `tlsd-config` ConfigMap (`enabled=true`, `es_url`, etc.);
   - PR ([[always-pr-for-code-changes]]) → merge → Flux. Reconcile: anotar `gitrepository
     subfrost-io` **antes** do `kustomization` (ns flux-system) via `.ioenv-extracted/kubectl-io.sh`.
   - ⚠️ tag GKE = short-SHA do Cloud Build pode atrasar; usar a tag explícita que submetemos.

---

## 6. Plano de cutover (reversível)

0. **Pré:** U5 (template `kind`) aplicado; U6 (esSource com filtro `kind` + pin `instance`)
   deployado **com `ANALYTICS_INSTANCE=edge-middleware`** → dashboard segue lendo só o middleware
   (zero regressão). Middleware continua LIVE.
1. **Liga o tlsd shipper** (`[telemetry] enabled=true`, `instance=tlsd-core`) via deploy GitOps.
   Os dois produtores escrevem agora; o dashboard ainda só vê `edge-middleware`.
2. **Valida** docs `tlsd-core` no ES cru (via `kubectl-io.sh` exec no ES):
   - contagem cresce: `match_phrase instance:tlsd-core` no índice do dia;
   - shape OK (sem rejeições do mapping strict — `kind` presente, `ja4` não-vazio, status real);
   - `kind` distribui plausível (page/api/asset/other);
   - sanidade vs middleware: nº de `kind:page` do tlsd ≈ pageviews do `edge-middleware` (ordem
     de grandeza; o tlsd pega mais por ver tudo + bots).
3. **Vira a chave:** `ANALYTICS_INSTANCE=tlsd-core` (deploy do app). Dashboard passa a ler o
   tlsd. Soak (ex: 24–48h) observando.
4. **Aposenta o middleware:** remove o `capturePageview` do `middleware.ts` (e o `event` param
   se não for mais usado). Opcional: depois, `ANALYTICS_INSTANCE` unset (só o tlsd escreve).
5. **Rollback** em qualquer ponto: `ANALYTICS_INSTANCE=edge-middleware` (instantâneo, volta pro
   middleware) e/ou `[telemetry] enabled=false` no tlsd.

---

## 7. Riscos & mitigações

- **(a) Bloquear o proxy.** Invariante de design: emit via canal **bounded** + `try_send`
  **não-bloqueante** + **drop-on-full** + flush em task separada. Telemetria nunca afeta a
  latência nem a disponibilidade do ingress. Contador de drops exposto nas métricas.
- **(b) Fidelidade de `source_ip`.** O fp-server usava `externalTrafficPolicy: Local` (preserva
  IP do cliente). Atrás do tlsd, usar o IP efetivo que o próprio tlsd já calcula
  (`forward_client_ip` + `trusted_proxies`, lógica em `proxy.rs`), não o `peer_addr` cru.
  Reaproveitar a mesma derivação da injeção de `X-Forwarded-For`/`X-Real-IP`.
- **(c) ES alcançável do ns `tlsd-ingress`.** A Parte B provou edge→ES interno **do app**
  (ns do app). Do `tlsd-ingress` é cross-ns diferente — **validar** (NetworkPolicy? DNS?) num
  smoke antes do cutover. Mitigação se bloqueado: NetworkPolicy/peering, ou (último caso) um
  beacon HTTP interno.
- **(d) Mapping `dynamic=strict`.** Qualquer campo fora do template é **rejeitado** (doc
  perdido). `kind` precisa entrar no template **antes** (U5). Validar no passo 2 do cutover que
  não há `mapper_parsing_exception`.
- **(e) Volume.** O tlsd loga **tudo** → muito mais docs que o middleware (assets, polling, bots).
  ILM de 30d + sizing da Parte A precisam aguentar; `sample_rate_assets` configurável pra
  derrubar volume de `kind:asset` se preciso. Medir no soak; ajustar ILM/PVC se necessário.
- **(f) Branch divergente.** Prod roda `feat/tlsd-inbound-ja4`, não master. Nosso patch parte
  dela. Coordenar com o flex a estratégia de branch/merge (§8). Build sempre da nossa branch.
- **(g) Build do binário.** Compile do workspace tlsfetch (grande, deps nativas) — ver §5.2;
  Cloud Build do source é o caminho preferido pra não depender de host local.
- **(h) Tempo do `info!` vs corpo.** O `info!` (linha ~598) roda **após o head da resposta**,
  antes de fazer o pipe do corpo. `bytes_out` = `Content-Length` declarado (advisory), não bytes
  realmente transmitidos — aceitável (mesma semântica do log atual). Não esperar o corpo.

---

## 8. Open questions / coordenação

1. **Estratégia de branch no `pyrosec/tlsfetch`** (com o flex): partir de `feat/tlsd-inbound-ja4`;
   o flex quer eventual merge na master (que está bem atrás)? Onde o PR do shipper aterrissa?
2. **Auth do ES.** O ES interno tem auth (user/pass/API key) ou é aberto na rede do cluster?
   Define se o `es_url` basta ou precisa de secret via ESO. (A Parte B escreve sem auth no
   `http://...:9200` interno → provavelmente aberto intra-cluster; confirmar.)
3. **Onde compilar** (Cloud Build do source vs WSL vs VM do flex) — fechar no plano após um
   spike de build.
4. **Sampling.** Ligar `sample_rate_assets<1.0` já no go-live ou só se o volume incomodar?
5. **Visitors/sessions sobre todo tráfego vs só `kind:page`** no esSource — definir a semântica
   no plano (provável: visitors/sessions = todo tráfego com `ja4`; pageviews/top-pages =
   `kind:page`).

---

## 9. Fora de escopo (follow-ups)

- **wasip2 / enriquecimento de JA3/JA4 no edge** (JA4H/JA4S/JA4T, bot-scoring custom). O modelo
  Tier-2 do tlsd (`wasi:http/incoming-handler`) substitui o backend — não serve pra
  enriquecer-e-encaminhar transparente. Seria uma frente separada (e provável trabalho upstream
  no tlsd pra um novo tier "observer/middleware"). Só se o flex pedir variantes JA4.
- **Aposentar fp-server / `x.subfrost.io`** e drop de RabbitMQ legado — coberto pelo
  `TELEMETRY_MIGRATION_PLAN.md`; a Peça C torna o tlsd o produtor canônico, o que **viabiliza**
  esse retire, mas o decommission é outra frente.
- **Novas views de dashboard** (bots, distribuição por JA4, borda/segurança) que a base completa
  destrava — produto decide depois.

---

## 10. Critérios de pronto (done)

- tlsd buildado da nossa branch (com `--features wasm`) e deployado no DaemonSet via GitOps,
  com `[telemetry] enabled=true`.
- Docs `service:tlsd-ingress instance:tlsd-core` crescendo no `subfrost-cdn-*`, **sem rejeição
  de mapping**, com `ja4` não-vazio, `status`/`latency_ms` reais e `kind` populado.
- `esSource` lendo o tlsd (`ANALYTICS_INSTANCE=tlsd-core`): dashboard
  `/admin/marketing/analytics` consistente (pageviews ≈ ordem do middleware; visitors/sessions
  plausíveis), sem regressão visual.
- Middleware `capturePageview` removido (ou pronto pra remover) após o soak.
- Invariante verificado: derrubar/lentidão do ES **não** afeta latência/saúde do ingress (drops
  contados, proxy intacto).
