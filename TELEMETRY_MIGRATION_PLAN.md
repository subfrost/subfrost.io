# Telemetry / Fingerprint Stack Migration Plan

Migrate the `x.subfrost.io` TLS-fingerprint stack + its Elasticsearch out of
the legacy GKE cluster `cdn-telemetry` (project `alkane-assets`, ns
`telemetry`) into the `subfrost-io` cluster (project `night-wolves-jogging`)
as Flux/Cloudbuild-managed orchestration, with a clean Cloudflare cutover and
no teardown of the old stack until the new one serves.

**Status: SCOPING + SCAFFOLD only. Nothing in this plan has been applied. The
live `cdn-telemetry` cluster and its Elasticsearch are untouched.**

---

## 1. What exists today (legacy `cdn-telemetry`)

Source: `~/subfrost-cdn/services/{fp-server,cdn-telemetry-sink,fpctl}`.

```
client ── TLS (DNS-only A record, grey-cloud) ──▶ fp-server  (x.subfrost.io)
            raw ClientHello peeked → JA3/JA4 computed
            │  /upgrade, /identify, /pay/identity-complete, /diagnostics
            ▼  publish JSON to RabbitMQ exchange subfrost.cdn.access
               rk access.fp.upgrade  /  access.diag.crash
RabbitMQ (subfrost.cdn.access) ──▶ cdn-telemetry-sink (consumer)
               queue subfrost.cdn.access.q, rk access.#
               drains → ES _bulk every 500 docs / 5s
Elasticsearch (helm statefulset, ns telemetry)
   indices: subfrost-cdn-{YYYY.MM.DD}, subfrost-diagnostics-{YYYY.MM.DD}
   index templates + ILM (30d delete) applied by cdn-telemetry-sink/deploy.sh
fpctl ── analytics CLI over ES (kubectl port-forward svc/elasticsearch 9200)
```

Key facts pulled from the code:

- **fp-server** (`main.go`) is a TLS terminator using `autocert` (Let's Encrypt
  for `x.subfrost.io`). It wraps each accepted conn with `peekConn`
  (`clienthello.go`) to parse the raw ClientHello off the wire, computes JA3
  (md5) + JA4 itself (GREASE-stripped, RFC 8701), and serves `/upgrade` which
  returns the fingerprint AND publishes an ES-shaped doc to RabbitMQ. It also
  has `/identify`, `/pay/identity-complete` (SUBFROST Pay magic-link), and
  `/diagnostics` (mobile crash-report sink → `access.diag.crash`).
- It runs as a **LoadBalancer Service pinned to static IP 136.113.233.117**
  (us-central1), `externalTrafficPolicy: Local` (to preserve client source-IP
  for the remote-addr-keyed ClientHello cache), on the spot pool.
- **cdn-telemetry-sink** (`main.go`) is a pure AMQP→ES bulk pump. Index name
  derives from each event's `ts` (daily). Routing-key prefix `access.diag.`
  routes to `subfrost-diagnostics-*`; everything else to `subfrost-cdn-*`.
- **ES templates / ILM** live as JSON next to the sink and are PUT by
  `deploy.sh`: `subfrost-cdn` (dynamic=strict top-level, `headers.*` dynamic),
  `subfrost-diagnostics` (dynamic=false), both with a 30-day delete ILM.
- **fpctl** queries `subfrost-cdn-*` (default), filtered to `service=fp-server`,
  for recent/distribution/bots/by-ja3/by-ip/session/stats/raw.

No Terraform/Helm sources for the cluster were found in `subfrost-cdn` (only
`infra/terraform/cdn-telemetry/` is *referenced* in docs); ES was stood up via
a Helm chart on the legacy cluster. The new stack is therefore defined fresh as
plain manifests (this repo's `k8s/telemetry/`).

---

## 2. The new world: tlsd already captures JA4

`tlsd` (in `~/tlsfetch`) is **already the live subfrost.io ingress** (ns
`tlsd-ingress`, LB `34.170.98.157`, in front of the apex). From
`crates/tlsfetch-server/src/listener.rs::handshake()` and
`crates/tlsd/src/proxy.rs`:

- It `peek()`s the raw ClientHello before completing the handshake and computes
  `ja3`, `ja3_hash`, and `ja4` (via `tlsfetch_common`).
- When `forward_tls_fingerprint = true` (it is, in `k8s/tlsd-ingress/tlsd.yaml`),
  it **injects on the upstream request**: `X-TLS-JA4` (configurable header),
  `X-TLS-JA3`, and `X-TLS-JA3-Hash`.
- It already requires the same Cloudflare posture fp-server needs: **grey-cloud
  / DNS-only** so it sees the *real client's* fingerprint, not Cloudflare's.

So fp-server's core reason to exist — "Cloudflare Pro doesn't expose JA4, so run
our own TLS terminator" — is **already solved by tlsd at the ingress**. tlsd
does NOT currently publish fingerprint events anywhere (it only injects headers
into the proxied request); the app consumes them per-session
(`Session.tlsFingerprint`).

### Recommendation — replace fp-server with tlsd-sourced events

**Drop fp-server. Source fingerprint events from the existing tlsd ingress.**
Rationale:

- tlsd already computes the identical fingerprints (same JA3/JA4 algorithms) at
  the only ingress that matters, with the correct grey-cloud requirement
  already satisfied and a cert-renewal story in progress.
- Keeping fp-server means running a *second* TLS terminator + a *second* static
  IP + a *second* ACME cert + a *second* Cloudflare hostname, all to recompute
  what tlsd already has. That's pure redundancy.
- The legacy `subfrost-cdn-*` schema (`ts, source_ip, host, method, path,
  service, ja3, ja3_full, ja4, status, headers.*`) is exactly what an
  access-log line from tlsd's upstream request can fill.

**How tlsd's fingerprints become ES events (the one missing seam):** tlsd emits
headers, not events. Pick one producer:

- **Option A (recommended): app-side emitter.** The Next.js app already reads
  `X-TLS-JA4` per request (for `Session.tlsFingerprint`). Add a thin server-side
  hook (route middleware or a tiny `/api/_telemetry` beacon) that, per request
  (or sampled), forwards `{ts, source_ip (X-Forwarded-For), host, path, method,
  status, ja3 (X-TLS-JA3-Hash), ja3_full (X-TLS-JA3), ja4 (X-TLS-JA4),
  headers.user-agent, service:"tlsd-ingress"}` to the sink's RabbitMQ exchange
  (rk `access.fp.upgrade`) — or directly to ES `_bulk`. No new TLS terminator,
  reuses the existing seam. `service` field flips from `fp-server` to
  `tlsd-ingress` (update fpctl's default filter, or query `--all`).
- **Option B: a tiny tlsd access-log → AMQP shipper.** Add an access-log sink to
  tlsd (it has the fingerprint + request line in `proxy.rs`) that publishes the
  same doc. More work in Rust; keeps the app untouched.

Either way the **sink + ES + ILM + templates + fpctl stay unchanged** — only the
*producer* of access events changes.

**What about `/diagnostics`, `/identify`, `/pay/identity-complete`?** Those are
NOT fingerprint-capture; they're app endpoints that fp-server happened to host.
If still needed:

- `/diagnostics` (mobile crash sink → `access.diag.crash`) — re-home as a small
  HTTP handler or a route in the Next.js API / subfrost-mobile-api that
  publishes to the same exchange. It does not need raw-ClientHello access (it
  takes JA3/JA4 from the connection, which behind tlsd is the `X-TLS-*` headers).
- `/identify`, `/pay/identity-complete` — confirm with product whether still in
  use; if so, re-home likewise. **Open question (see §8).**

> If `/diagnostics` is the only surviving AMQP producer and fingerprint events
> go straight to ES from the app, **RabbitMQ + the sink could be dropped
> entirely** and the app could bulk-write to ES on a short timer. The scaffold
> keeps RabbitMQ + sink so the lift-and-shift works on day one; revisit once the
> producer set is settled (§8).

---

## 3. New orchestration (this repo, `k8s/telemetry/`)

Target: GKE `subfrost-io` / project `night-wolves-jogging`, **new namespace
`telemetry`** (kept off `subfrost` and `tlsd-ingress` for storage/RBAC
isolation; name matches the old ns so `fpctl` port-forward docs still work).

Scaffolds created (all valid YAML, `kubectl --dry-run`-shaped, NOT applied):

| File | What |
|------|------|
| `namespace.yaml` | `telemetry` ns |
| `serviceaccount.yaml` | KSA `telemetry-reindex` + WI annotation for GCS read |
| `external-secrets.yaml` | ESO SecretStore + ExternalSecret `telemetry-secrets` (RabbitMQ creds from Secret Manager), mirrors `k8s/external-secrets.yaml` |
| `elasticsearch.yaml` | single-node ES 8.x StatefulSet + ClusterIP + headless Service, spot-tolerant, 20Gi PVC, `vm.max_map_count` init |
| `index-template-configmap.yaml` | ILM policies + index templates ported verbatim from `cdn-telemetry-sink/*.json` |
| `es-bootstrap-job.yaml` | one-shot Job applying templates+ILM (replaces deploy.sh Step 1) |
| `rabbitmq.yaml` | single-node RabbitMQ (optional — see §2) |
| `cdn-telemetry-sink.yaml` | sink Deployment (Go binary ported unchanged) |
| `reindex-job.yaml` | one-shot Job: GCS dump → recreate indices → bulk-load |
| `kustomization.yaml` | standalone overlay (not wired into the app's kustomization) |

### ES sizing

Current dataset: **12 indices, 94,612 docs, ~60 MB primary** (the local dump is
~107 MB uncompressed NDJSON, which expands the on-wire `_source`; on-disk
primaries are far smaller). Write rate is one ingress' worth of access events.

- **Single node**, `ES_JAVA_OPTS=-Xms2g -Xmx2g` (4Gi container, request==limit),
  500m–2 CPU, **20Gi PVC** — generous for 30-day ILM retention plus headroom.
- `number_of_replicas: 0` on the templates (single node can't allocate replicas;
  otherwise indices sit `yellow` forever). Raise to 1 only if ES goes
  multi-node.
- Scale to a 3-node StatefulSet (dedicated `discovery` + `cluster.initial_master_nodes`)
  only if write volume or query concurrency grows materially.

#### ES deployment options (pick one before prod)

1. **Plain StatefulSet (scaffolded here)** — fewest moving parts, no operator.
2. **ECK (Elastic Cloud on K8s) operator** — better lifecycle/upgrades/security
   defaults; heavier. Swap `elasticsearch.yaml` for an `Elasticsearch` CR.
3. **Bitnami/Elastic Helm chart via Flux `HelmRelease`** — closest to how the
   legacy cluster ran ES. Swap `elasticsearch.yaml` for a `HelmRelease`; keep
   the `svc/elasticsearch:9200` contract so the sink/fpctl/reindex are unchanged.

### ILM + index templates

Ported **verbatim** from `cdn-telemetry-sink/deploy.sh` + its JSON files:

- `subfrost-cdn` template (`index_patterns: subfrost-cdn-*`, priority 200,
  dynamic=strict top-level, `headers.*` dynamic, ILM `subfrost-cdn-delete-30d`).
- `subfrost-diagnostics` template (`subfrost-diagnostics-*`, dynamic=false,
  nested `mobile_payload`, ILM `subfrost-diagnostics-delete-30d`).
- Both ILM policies: `hot` at 0ms, `delete` at 30d. (No rollover — date-based
  index names are incompatible with ILM rollover, per the original `_meta`.)

Only change from the originals: `number_of_replicas` 1→0 for the single node.

---

## 4. Re-index from the GCS dump

Dump (verified): `gs://subfrost-cdn-bucket/es-dumps/es-dump-20260624-161825.tar.gz`
(local copy `~/tlsfetch-personas/es-dump-20260624-161825/`). 12 indices, 94,612
docs. Per index: `<index>.mapping.json` + `<index>.data.ndjson`.

**Critical format detail (confirmed by inspecting the dump):** the
`.data.ndjson` lines are **full ES search hits** —
`{"_index","_id","_score","_source":{…}}` — NOT bulk-API lines, and NOT bare
`_source`. So a naive `curl --data-binary @data.ndjson .../_bulk` would fail.
The mapping files wrap the mapping under the index name:
`{"<index>":{"mappings":{…}}}`.

**Approach (`reindex-job.yaml`):** a one-shot Job (`google/cloud-sdk:slim` +
`jq`) that, after ES is `yellow`:

1. `gcloud storage cp` the tarball from GCS (Workload Identity → GSA with
   `storage.objectViewer` on the bucket), extract.
2. For each `<index>`: `DELETE` then `PUT` the index with its dumped `mappings`
   (so re-runs are clean and the legacy per-index mapping shape — including the
   `headers.*` `text`+`.keyword` legacy form that `fpctl` already handles — is
   preserved). Template `index_patterns` still govern settings/ILM by match.
3. Transform each data line with `jq` into bulk action+doc pairs **reusing the
   original `_index` + `_id`** (idempotent: re-running overwrites, never
   duplicates), `split` into 10k-doc chunks, POST each to `_bulk`, fail loudly
   on `.errors`.
4. `_refresh` + `_count` per index, then a grand total `_count`
   (expected 94,612) as the verification gate.

Why bulk-load from the search-hit dump rather than ES remote-reindex: the
**source ES is in a different cluster/project and must not be touched live**
(`reindex` `_remote` would require network + creds to the old ES). The GCS dump
is the agreed handoff artifact and is self-contained.

---

## 5. Cloudflare cutover for x.subfrost.io

Creds: `~/.subfrostcloudflarerc` →
`CLOUDFLARE_API_KEY`, `CLOUDFLARE_EMAIL`, `CLOUDFLARE_ZONE_ID` (Global API Key
auth: header `X-Auth-Key` + `X-Auth-Email`).

The DNS record `x.subfrost.io` is an **A record, DNS-only (grey-cloud)** →
`136.113.233.117` (the legacy fp-server LB).

### Decision first: does `x.subfrost.io` survive at all?

Two end states:

- **End state A (recommended): retire `x.subfrost.io`.** If fp-server is dropped
  (§2) and fingerprints come from tlsd at the apex, **nothing needs to serve
  `x.subfrost.io`**. The cutover is then just: stand up the new telemetry stack
  (ES + sink + re-index) in `subfrost-io`, point the app/tlsd producer at the
  new sink/ES, verify events land + the dump is queryable, then **delete the
  `x.subfrost.io` A record** and tear down the old cluster. No new LB/IP/cert.
- **End state B: keep `x.subfrost.io`** (only if `/identify` / `/pay/identity-
  complete` / a standalone `/upgrade` are still required — see §8). Then
  re-home those endpoints behind the existing tlsd ingress (add a `[[route]]`
  for `x.subfrost.io` in `tlsd-config`, backend = the re-homed handler) and flip
  the A record to tlsd's LB `34.170.98.157`. Still grey-cloud.

### Cutover steps (little/no downtime)

1. **Stand up new** (no DNS change): apply `k8s/telemetry/` to `subfrost-io`
   (ES + bootstrap + RabbitMQ/sink if kept). Old cluster keeps serving.
2. **Re-index**: run `es-reindex-from-dump`; verify `_count == 94,612` and
   `fpctl --es <new-es> stats` looks sane.
3. **Dual-write window**: point the new producer (app-side emitter or tlsd
   shipper) at the new sink/ES while the old fp-server still writes to old ES.
   Both stacks now ingest; new ES has history (dump) + live tail.
4. **Verify** new ES is current (recent events present, `fpctl recent`/`stats`).
5. **Flip Cloudflare** (only End state B): `PATCH` the `x.subfrost.io` A record
   from `136.113.233.117` → `34.170.98.157` via the API, keep `proxied:false`
   (grey-cloud). End state A: **delete** the record instead.
   ```bash
   source ~/.subfrostcloudflarerc
   # find record id:
   curl -s -H "X-Auth-Email: $CLOUDFLARE_EMAIL" -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
     "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records?name=x.subfrost.io"
   # End state B (re-point):
   curl -s -X PATCH -H "X-Auth-Email: $CLOUDFLARE_EMAIL" -H "X-Auth-Key: $CLOUDFLARE_API_KEY" \
     -H 'Content-Type: application/json' \
     "https://api.cloudflare.com/client/v4/zones/$CLOUDFLARE_ZONE_ID/dns_records/<id>" \
     --data '{"type":"A","name":"x.subfrost.io","content":"34.170.98.157","ttl":120,"proxied":false}'
   ```
   Drop the TTL to 120s a day ahead so the flip propagates fast.
6. **Verify post-flip** (End state B): `curl https://x.subfrost.io/healthz` (or
   `/upgrade`) resolves to the new LB and serves; fingerprints still land.
7. **Retire old**: only after the new stack has served + ingested for a
   soak window (e.g. 24–48h), tear down the `cdn-telemetry` cluster (or scale
   fp-server/sink to 0 first as an instant rollback hedge).

### Coordination with `cdn.subfrost.io` / CDN-rust-port track

`cdn.subfrost.io` is the CDN edge (the rust port track). It is **independent of
the telemetry/fingerprint migration** — telemetry only *consumes* access events.
Coordinate so that **whoever owns the CDN-rust-port emits access-log events in
the same `subfrost-cdn-*` schema** to the new sink/ES (the CDN can be a producer
alongside tlsd, distinguished by the `service` field). Do not let the CDN
cutover and the telemetry cutover share a maintenance window — keep the DNS
flips separate and sequence them.

### Rollback

- Pre-flip: nothing to roll back (old stack still primary).
- Post-flip (End state B): `PATCH` the A record back to `136.113.233.117`
  (instant, TTL 120s). The old cluster is still up during the soak window.

---

## 6. Image build (Cloudbuild)

- **cdn-telemetry-sink**: add a Cloud Build config that builds the existing Go
  source into `night-wolves-jogging` Artifact Registry
  (`us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/cdn-telemetry-sink`).
  Either vendor the sink source into this repo (e.g. `telemetry/sink/`) or add a
  trigger pointing at `subfrost-cdn`. Per repo convention (`CLOUDBUILD.md`),
  images push to Artifact Registry; **deploy is via Flux, not in cloudbuild**.
- **ES / RabbitMQ**: upstream images, no build.
- **re-index / bootstrap**: stock `google/cloud-sdk` + `curlimages/curl`, no
  build.

---

## 7. Phasing

1. **Phase 0 — prep (no prod impact).** Create Artifact Registry image for the
   sink; create Secret Manager entries (`telemetry-rabbitmq-*`); create GSA +
   WI binding for the re-index Job; drop `x.subfrost.io` TTL to 120s.
2. **Phase 1 — stand up new ES.** Apply ns + ES + bootstrap to `subfrost-io`.
   Confirm `green`/`yellow` + templates present.
3. **Phase 2 — re-index.** Run the dump Job; gate on `_count == 94,612` +
   `fpctl stats`.
4. **Phase 3 — producer.** Wire the app-side emitter (or tlsd shipper) to the
   new sink/ES. Begin dual-write. (Decide RabbitMQ keep/drop here.)
5. **Phase 4 — verify + cutover.** Confirm live tail in new ES; flip/delete the
   Cloudflare record per End state A/B.
6. **Phase 5 — soak + retire.** 24–48h soak, then tear down `cdn-telemetry`.
7. **Phase 6 — Flux wiring.** Add a dedicated Flux Kustomization for
   `k8s/telemetry/` (like the tlsd-ingress follow-up); remove the one-shot
   `reindex-job.yaml` from the kustomization after a successful load.

---

## 8. Risks & open questions

**Risks**

- **Single-node ES = no HA.** Spot pre-emption causes a brief outage (PVC
  survives, recovers from disk). Acceptable for low-criticality telemetry; if
  not, go 3-node or ECK. `replicas:0` means a lost PVC = data loss — the GCS
  dump + 30d ILM bound the blast radius, but consider periodic snapshots
  (`_snapshot` to a GCS repo) for the new ES too.
- **Producer seam is the real work.** tlsd emits headers, not events; the
  app-side emitter (or tlsd access-log shipper) is net-new code and must match
  the strict `subfrost-cdn-*` mapping exactly (top-level fields are
  `dynamic=strict` — an unexpected key is rejected).
- **`service` field changes** from `fp-server` to `tlsd-ingress`; `fpctl`
  defaults to `service=fp-server`. Update its default filter or document `--all`.
- **Re-index format trap** (mitigated): data lines are search hits, not bulk
  lines — the Job transforms them. If a future dump format differs, the Job's
  `jq` transform must be revisited.
- **Source-IP fidelity.** fp-server used `externalTrafficPolicy: Local` for true
  client IPs. Behind tlsd, `source_ip` must come from `X-Forwarded-For` /
  tlsd's `forward_client_ip` — verify the emitter reads the right field.
- **Cloudflare grey-cloud invariant.** Both the old (fp-server) and new (tlsd)
  paths REQUIRE DNS-only. An accidental orange-cloud toggle silently replaces
  every client fingerprint with Cloudflare's — guard with a check post-cutover.
- **Cert** (End state B only): re-homing `x.subfrost.io` behind tlsd needs that
  SAN on tlsd's cert (currently `subfrost.io` + `tlsd-canary.subfrost.io`). Add
  it to the lego/cert-manager issuance.

**Open questions**

1. Are `/identify` and `/pay/identity-complete` (SUBFROST Pay magic-link) still
   in use? If yes → End state B + re-home; if no → End state A (retire
   `x.subfrost.io` entirely). **Drives the whole cutover shape.**
2. Keep RabbitMQ + sink, or have the producer bulk-write straight to ES? (If
   `/diagnostics` is the only AMQP producer left, dropping the bus simplifies
   ops.) Where does `/diagnostics` (mobile crash sink) get re-homed —
   subfrost-mobile-api, or a Next.js API route?
3. ES deployment choice: plain StatefulSet vs ECK vs Helm `HelmRelease`?
4. Does the CDN-rust-port (`cdn.subfrost.io`) want to be a second producer into
   this same telemetry ES, and on what schema/`service` tag?
5. Retention: keep 30d ILM, or change now that this is consolidated? Add GCS
   snapshots for DR?
6. Is there a Kibana/dashboard consumer beyond `fpctl` that needs to follow the
   ES move (URL/creds update)?
```
