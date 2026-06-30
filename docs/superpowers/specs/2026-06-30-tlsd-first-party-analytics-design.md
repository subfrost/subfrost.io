# tlsd First-Party Analytics (replace GA4) — Design

- **Date:** 2026-06-30
- **Status:** Approved (brainstorm) → ready for implementation plan
- **Area:** subfrost.io — telemetry infra (`k8s/telemetry/`, GitOps/Flux) + app (`/admin` Marketing → "Site analytics" page, capture middleware)
- **Author:** Vitor + Claude (brainstorm session)

## Context

flex's directive (relayed by Vitor): power the subfrost.io analytics stack from **tlsd** and **replace GA4** with a first-party pipeline ("don't trust third-party data"). The `2026-06-24-marketing-engagement-analytics` front shipped the "Site analytics" page reading **GA4** behind a normalized source boundary (`lib/analytics/source.ts`), explicitly leaving `esSource` as a future second adapter. **This spec implements that second adapter, the per-pageview capture that feeds it, and the Elasticsearch hardening that makes it durable** — i.e. the actual GA4→first-party cutover on the read side, and a real pageview source on the write side.

This is the **tlsd / first-party analytics** front (memory `tlsd-analytics-gitops`). It is **independent of the X engagement piece** (`x-engagement-piece2-build`, already LIVE).

### Current state (de-risking discoveries, verified live 2026-06-30)

The pipeline is much further along than the handoff implied:

- **ES is up, not stuck.** `elasticsearch-0` is `1/1 Running` in ns `telemetry`; the `Multi-Attach` the handoff described **auto-recovered** — it is a *recurring* short outage on spot pre-emption, not a permanent lock. The handoff's "priority 1: ES 1/1 Ready" is already satisfied.
- **The re-index is already done.** Indices `subfrost-cdn-*` already hold ~94,613 docs (matches the 94,612-doc GCS dump). The handoff's "Task 2: re-index the dump" is complete.
- **Live tail already works.** Docs exist for `2026.06.24` and `2026.06.30` (today) — `app/api/fp/route.ts` already writes to ES; it is just rarely hit (only on explicit `/api/fp` calls).
- **Cluster is `yellow`, cosmetically.** 14 unassigned shards because the re-indexed indices carry `replicas:1` on a single node (replicas never allocate). The index *template* already sets `replicas:0`; it just was not applied to the re-indexed indices. A `PUT _settings` makes it `green`.
- **The cluster is 100% spot.** Only `spot-pool` exists (no stable node pool). "Pin ES to a stable pool" (the handoff's assumed fix) is not available without creating a pool — which contradicts flex's "runs cheap on spot" and "ES isnt super necessary".
- **Capture seam exists.** `app/api/fp/route.ts` already shapes the strict `subfrost-cdn-<date>` access-event from the tlsd `X-TLS-*` headers and fire-and-forgets it to ES.
- **A single `middleware.ts`** (i18n + `/admin` gate + CSP, matcher `/:path*`, Edge runtime) already exists — capture must extend it, not add a second middleware.

So the remaining work is: **harden + Flux-manage the ES** (infra), and **add a real per-pageview emitter + the `esSource` reader + flip the page off GA4** (app).

## Goals

- **Part A (infra, GitOps):** ES `green`, durable on spot, and Flux-managed.
  - Clear the `yellow` (apply `replicas:0` to existing indices).
  - Harden ES for spot pre-emption (shrink the Multi-Attach window; survive reschedule).
  - DR: periodic ES→GCS export so a lost PVC is recoverable.
  - Wire `k8s/telemetry/` into the Flux tree (today it is a hand-applied standalone overlay).
- **Part B (app, PR):** real first-party numbers in the existing "Site analytics" page.
  - Capture **one access-event per public pageview** in the existing `middleware.ts`, reading the tlsd `X-TLS-*` headers, into `subfrost-cdn-<date>`.
  - Implement `esSource: AnalyticsSource` (`lib/analytics/es.ts`) that fills the existing `AnalyticsDashboard` shape from ES aggregations.
  - Flip `app/admin/marketing/analytics/page.tsx` from `ga4Source` to `esSource`, behind an env selector for rollback (`ANALYTICS_SOURCE`).

## Non-goals (YAGNI for v1)

- **No wasip2 / JA3-at-the-edge tlsd extensions** (the deferred "piece C"). Capture stays app-side; it migrates into tlsd in piece C with **no change to ES / esSource** (only the producer moves).
- **No `x.subfrost.io` cutover, no fp-server / legacy `cdn-telemetry` teardown.** The legacy cluster is untouched. We stand up nothing new there.
- **No RabbitMQ + cdn-telemetry-sink.** The middleware/`/api/fp` write straight to ES; the bus is unnecessary for this scope (scaffold stays in-repo but out of the Flux kustomization).
- **No client-side beacon** (no dwell JS); engagement is a server-side heuristic.
- **No new Prisma schema, no new privilege** (reuse `marketing.view`).
- **No ECK / Helm migration of ES** — keep the plain StatefulSet, just harden it.
- **No node-pool provisioning** — stay on spot.

## Decisions (from brainstorm)

1. **Scope = A + B** (vertical slice "first-party analytics LIVE"). wasip2 = piece C, later.
2. **Capture = app-side now, tlsd later.** The middleware reads the `X-TLS-*` headers tlsd already injects and writes the event. The fingerprint comes from tlsd in every case; only the *emitter* is app-side. Migrates to a tlsd access-log shipper in piece C without touching sink/ES/esSource.
3. **Capture point = the existing `middleware.ts`** (extended). It is the only deterministic per-request hook (runs even for static/cached pages, where a Server Component layout would not).
4. **Engagement = server-side heuristic** (no beacon): dwell of a pageview = Δts to the next pageview in the same session (clamped, last-in-session = bounce).
5. **ES resilience = accept spot + harden + DR ($0, GitOps).** Keep spot (aligns with "cheap"/"not critical"); clear yellow; ES→GCS DR; shrink the Multi-Attach window; wire Flux. Accept occasional short outages.
6. **DR = CronJob export→GCS, not native `_snapshot`.** `repository-gcs` is an ES 8.x *plugin* needing a custom image or a re-installing initContainer + a GCS keystore credential — extra weight/fragility on a spot node that reschedules often, working against "make sure it's working". A full export of a ~60MB / 94k-doc dataset is trivial, reuses the existing `es-dump-*.tar.gz` pattern (consistency with flex's handoff artifact), and restores via the already-proven reindex path.
7. **GA4 stays as an env-selectable fallback** (`ANALYTICS_SOURCE=es|ga4`, default `es`) for rollback/comparison during the transition — the `AnalyticsSource` boundary already exists for exactly this. (Hard removal of GA4 is a later cleanup, not v1.)
8. **Capture excludes `/admin`, `/api`, `/_next`, assets** — public traffic only, like GA4.

## Architecture

```
client → Cloudflare (grey-cloud) → tlsd ingress (LB 34.170.98.157)
   tlsd computes JA3/JA4 from the raw ClientHello, injects
   X-TLS-JA4 / X-TLS-JA3 / X-TLS-JA3-Hash on the upstream request
   → proxy → subfrost-io app (Next.js, ns subfrost)
       middleware.ts (EXTENDED): per public pageview, build access-event
          (X-TLS-* + path + referer + utm) → event.waitUntil(emit → ES)   [NEW]
       app/api/fp/route.ts: beacon, unchanged (same shape, shared builder)  [kept]
   → Elasticsearch (ns telemetry, single-node, spot, hardened)
       indices subfrost-cdn-<date>  (94k history ALREADY re-indexed + live tail)

/admin/marketing/analytics (server page, gated marketing.view)
  └─ AnalyticsClient (UI, UNCHANGED — same AnalyticsDashboard shape)
page.tsx → getAnalyticsSource() → esSource (default) | ga4Source (ANALYTICS_SOURCE=ga4)
                   └─ esSource (lib/analytics/es.ts)   ← THIS SPEC
                        ├─ raw ES _search aggregations over subfrost-cdn-*
                        ├─ normalizers → shapes in lib/analytics/source.ts
                        └─ cacheGetOrCompute (@/lib/redis), ~15min, key analytics:<report>:<range>
```

### Module / file structure

App (Part B):
- `lib/telemetry/access-event.ts` *(new, edge-safe)* — `buildAccessEvent(input)` shaping the strict `subfrost-cdn-*` doc, and `emitAccessEvent(event, esUrl)` fire-and-forget POST to `<index>/_doc`. No `os`/Node-only imports (must run in Edge runtime). Daily-index helper moves here.
- `app/api/fp/route.ts` *(refactor)* — reuse `buildAccessEvent`/`emitAccessEvent`; pass `instance = os.hostname()` (nodejs runtime). Behavior unchanged.
- `middleware.ts` *(extend)* — after the existing i18n/admin logic, for matched public pageviews, build + `event.waitUntil(emitAccessEvent(...))`. Add `event: NextFetchEvent` to the signature.
- `lib/analytics/es.ts` *(new)* — `esSource: AnalyticsSource`; raw `_search` calls + normalizers + cache, mirroring `lib/analytics/ga4.ts`. Channel-classifier + dwell-heuristic helpers (pure, unit-tested).
- `lib/analytics/source.ts` *(extend)* — add `getAnalyticsSource()` selector + `isEsConfigured()`. Shapes unchanged.
- `app/admin/marketing/analytics/page.tsx` *(edit)* — `getAnalyticsSource().getDashboard(range)`.

Infra (Part A), all under `k8s/telemetry/`:
- `elasticsearch.yaml` *(edit)* — `terminationGracePeriodSeconds`, `startupProbe`; keep spot toleration/selector.
- `es-bootstrap-job.yaml` *(edit)* — also `PUT subfrost-*/_settings {number_of_replicas:0}` (idempotent), so a re-run heals the yellow.
- `es-snapshot-cronjob.yaml` *(new)* — daily ES→GCS export Job (cloud-sdk + curl/jq), WI via the `telemetry-reindex` KSA.
- `kustomization.yaml` *(edit)* — include only ns, serviceaccount, elasticsearch, index-template-configmap, es-bootstrap-job, es-snapshot-cronjob. Exclude rabbitmq, cdn-telemetry-sink, external-secrets, reindex-job (one-shot, already run).
- `clusters/subfrost-io/flux-kustomizations.yaml` *(edit)* — add a `telemetry` Flux `Kustomization` (path `./k8s/telemetry`, dependsOn `subfrost-io`).

## Part A — Infra detail

- **A1 — Harden ES.** Root cause of the recurring outage: single-node ES + RWO PVC on a spot node; on pre-emption the volume stays attached to the dead node until force-detach (~1–6min). We cannot remove reschedule (spot), so we minimize the window: short `terminationGracePeriodSeconds` (let GKE graceful node-shutdown detach the PVC cleanly), `startupProbe` to give ES room to recover from disk on reschedule. Keep `discovery.type=single-node`, heap 1g, image pinned `8.14.3`.
- **A2 — Heal yellow → green.** Template already has `replicas:0`; the re-indexed indices were created with the dump's mapping (`replicas:1`). The bootstrap Job additionally does `PUT subfrost-*/_settings {"index":{"number_of_replicas":0}}`. Idempotent; safe to re-run.
- **A3 — DR (export→GCS).** Daily CronJob: `_search`/scroll (or `elasticdump`-style) export of `subfrost-cdn-*` + `subfrost-diagnostics-*` to `gs://subfrost-cdn-bucket/es-dumps/`, same tar/ndjson shape as the existing dump. Restore path = the existing reindex-job. WI = `telemetry-reindex` KSA → GSA with `storage.objectAdmin` on the bucket.
- **A4 — Flux wiring.** New `Kustomization` reconciles `./k8s/telemetry` on push to main; `prune: true` adopts the already-running ES (same names/ns). Manifests must equal the live objects (plus the hardening) so the first reconcile is a no-op-ish convergence, not a surprise replace. `dependsOn: subfrost-io`.

## Part B — App detail

- **B1 — Capture middleware.** For requests whose path is a public pageview (matcher excludes `/admin`, `/api`, `/_next`, `/favicon`, static asset extensions, `/api/fp`), build the strict access-event and `event.waitUntil(emitAccessEvent(...))`. Fields (must match the `dynamic:strict` top-level template exactly — missing fields OK, extra fields rejected): `ts, source_ip, ja3, ja3_full, ja4, host, method, path, status, bytes_out, latency_ms, service:"tlsd-ingress", instance, headers_truncated, headers{}`. `referer` + `utm_*` go under `headers.*` (dynamic). `status` is assumed `200` (middleware runs before the handler — documented limitation; refine in piece C). Best-effort; never blocks or fails the response.
- **B2 — `esSource`.** `getDashboard(range)` runs four guarded, cached (`cacheGetOrCompute`, 15min) ES `_search` aggregations over `subfrost-cdn-*` within `[range.start, range.end]`, each normalized into `source.ts` shapes; any error → `emptyDashboard`, never throws:
  - **visitors** — `date_histogram(ts, calendar_interval:day)`; per bucket `pageViews=doc_count`, `activeUsers=cardinality(visitor_key)`, `sessions=cardinality(session_key)`. `totals` summed.
  - **topPages** — `terms(path, size:20)`, `pageViews=doc_count`. `title` resolved via prisma for `/articles/<slug>` only, else null.
  - **trafficSources** — `terms(headers.referer.keyword)` + utm terms; `channel` derived in TS (classifier); `sessions=cardinality(session_key)` per bucket (or doc_count fallback).
  - **articleEngagement** — `terms(path)` filtered `path` begins-with `/articles/` → `pageViews`; **dwell** via `composite(session_key)` + `top_hits(_source:[path,ts], sort ts asc)`, computing Δts to the next hit per session in TS, clamped to 30min, last-in-session dropped, aggregated by slug → `avgEngagementSeconds`. **Bounded** by a session-page cap with `log`/console-warn when truncated (no silent cap). `title` via prisma by slug (as ga4 does).
- **B3 — Source selector.** `getAnalyticsSource()` returns `esSource` unless `ANALYTICS_SOURCE=ga4`. Page uses it; `AnalyticsClient` and `marketing.view` gating unchanged.
- **B4 — Config.** `TELEMETRY_ES_URL` (default `http://elasticsearch.telemetry.svc.cluster.local:9200`, already used by `/api/fp`). `isEsConfigured()` (env present). Local dev without ES → `emptyDashboard` (no crash).

## Metric definitions (first-party)

- **visitor_key** = `ja4 | source_ip` (ES runtime field). **session_key** = `visitor_key | floor(ts / 30min)`. Counted via `cardinality` (HyperLogLog — approximate, honest for telemetry; ja4+ip is not a perfect identity but is the first-party best-effort the JA4 is for).
- **channel** — no referer → `direct`; referer host is a search engine → `organic`; is x.com/t.co/social → `social`; else `referral`. Any `utm_source`/`utm_medium` overrides (→ utm-named channel).
- **engagement** — Δts intra-session (decided). Approximate: the last pageview of a session has no dwell.

## Error handling

- Capture (middleware + `/api/fp`): best-effort, fire-and-forget, short timeout, swallow all errors (network/timeout/4xx/5xx). Absent `X-TLS-*` (local dev / direct hit) → no-op, no junk doc.
- `esSource`: every query guarded; ES down (e.g. mid-preemption) → zeroed/empty section, never throws. Cache serves the last good result for 15min.

## Testing

- **Pure units (vitest):** access-event shaping (headers → strict doc, including referer/utm placement); middleware matcher (excludes admin/api/_next/assets); channel classifier; dwell heuristic on a synthetic ordered session; ES aggregation normalizers (response fixtures → shapes); `esSource` guard (fetch throws/non-ok → `emptyDashboard`).
- **Gates:** `pnpm exec tsc --noEmit && pnpm test && pnpm build` green (minus the ~12 pre-existing live-RPC integration tests that are offline-skipped).
- **Infra:** manual verification via `.ioenv-extracted/kubectl-io.sh` — cluster `green`, Flux `Kustomization telemetry` Ready, snapshot CronJob ran + object in GCS.

## Risks

- **Edge-runtime fetch to the in-cluster ES.** The middleware runs in the Edge runtime; `event.waitUntil(fetch('http://elasticsearch.telemetry.svc...'))` must resolve cross-namespace DNS under self-hosted `next start`. **Mitigation:** an early smoke test in implementation; if it does not reach ES, fall back to delegating the write to a tiny nodejs route (`/api/_pageview`) the middleware calls. `/api/fp` (nodejs) already proves the app→ES path works, so the fallback is low-risk.
- **Dwell cost.** `composite`+`top_hits` over a wide range — bounded by a session cap + 15min cache, with a truncation log.
- **Multi-Attach** persists as an occasional short outage (accepted); A3 bounds data-loss on PVC loss.
- **Flux adoption drift.** The committed manifests must match the live ES so the first reconcile converges rather than replaces. Verify with a dry-run/diff before annotating the source.

## Delivery

- **Part A** = manifest commits + Flux wiring; applied/verified via `kubectl-io.sh` (annotate `gitrepository subfrost-io` before `kustomization`). No app deploy.
- **Part B** = PR (`feat/tlsd-first-party-analytics`) → review → merge → GKE bump `newTag` (quoted; full-SHA if the Cloud Build short-SHA lags → `ImagePullBackOff`). CI `deploy.yml` handles `prisma db push` (none here — no schema change). Merge/deploy confirmed with Vitor (memory `always-pr-for-code-changes`).

## Open questions

- None blocking. The edge-fetch fallback (B1 risk) is resolved by an early smoke test, not a design decision.
