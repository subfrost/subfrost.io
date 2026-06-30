# subfrost.io Polish Backlog

Generated 2026-06-29 from a four-way audit (deps/CI, code quality, security, docs/hygiene). Items are ordered by severity. Strike through or delete entries as they're resolved.

## Critical (production risk)

- [ ] **`prisma db push --accept-data-loss` runs against prod every deploy** — `.github/workflows/deploy.yml:303-369`. On any non-additive schema refactor this *will* silently delete production data. Replace with `prisma migrate deploy` against a real `prisma/migrations/` history.

## High (security / correctness)

- [ ] **Admin-secret comparisons are not timing-safe** in ~11 routes (`app/api/admin/{clear-all,reset-sync,sync-status,users,keys}/route.ts`, `app/api/stream/{start,stop,live,focus,captions}/route.ts`, `app/api/prefetch/route.ts:41`) — all use `!==`. Constant-time helper already exists at `lib/api/service-key.ts:30` (used by the referral routes). Wire admin routes through it.
- [ ] **`ADMIN_SECRET`, `PREFETCH_SECRET`, `STREAM_SECRET` shipped as `--set-env-vars`** in `deploy.yml:106-107` and `preview.yml:114` — visible in Cloud Run revision metadata to anyone with `roles/run.viewer`. Sibling values (`DATABASE_URL`, `AUTH_SECRET`) correctly use `--set-secrets`. Rotate and move.
- [ ] **`/api/prefetch` silently disables auth when `PREFETCH_SECRET` is unset** (`app/api/prefetch/route.ts:38-44`). Every other admin route returns 503 when its secret is missing — match the pattern.
- [ ] **`typescript.ignoreBuildErrors: true`** in `next.config.mjs:13` — prod builds skip type checks. CI tsc catches it today, but if CI breaks, type errors ship.

## Should fix (high value, low effort)

- [ ] **Delete 9 scratch scripts at repo root** — `test-{address-txs,find-frbtc,getstorageat,parallel-traces,parse-trace,single-block,trace-structure,wrap-unwrap-simple}.ts` and `dump-traceblocks.ts`. Zero imports.
- [ ] **Remove `swc: ^1.0.11`** from `package.json:105` — it's the unrelated npm package, not Next's compiler. Unused, pulls in ~13 platform binaries (~100MB).
- [ ] **Pin `@radix-ui/react-dialog`** in `package.json:49` — currently `"latest"`.
- [ ] **Resolve `lib/alkanes-client.ts` vs `lib/alkanes-client-v2.ts`** — v2 (391 lines) is used by one example + one scratch script + one test. Promote or delete.
- [ ] **Delete orphan `lib/` files** — `brc20-client.ts` (334 lines), `stream-client.ts` (66 lines), `fonts.ts`, `sync-service.ts` (referenced in `README.md:127` but unused in code).
- [ ] **Sync `.env.example` with reality** — ~25 server env vars referenced in code (`FUEL_API_KEY`, `STRIPE_*`, `GITHUB_PAT`, `GITHUB_WEBHOOK_SECRET`, `ANTHROPIC_API_KEY`, `GOLDRUSH_API_KEY`, `CDN_BUCKET`, `DOCS_BUCKET`, `GCP_PROJECT`, `ESPO_*`, `TELEMETRY_ES_URL`, etc.) missing from `.env.example`.
- [ ] **Rewrite `AGENTS.md`** — currently says "use Netlify for production deploys". Everything in the repo (Dockerfile, cloudbuild.yaml, deploy.yml, gcp/, k8s/) is GCP Cloud Run; Netlify is preview-only.
- [ ] **Reconcile `README.md`'s env-var list** (lines 341-360) — documents 16 of ~50 used. Drop the inline list and point at `.env.example`.
- [ ] **Strip debug `console.log` from `app/api/admin/reset-sync/route.ts`** (lines 25, 38, 55-57).
- [ ] **Dockerfile**: switch runner from `node:20-alpine3.18` (EOL May 2025) back to `node:20-alpine` — the "Prisma needs OpenSSL 1.1" comment is stale (Prisma 5.22 supports OpenSSL 3). Drop redundant `npm install -g prisma`.
- [ ] **`--cache-from` is a no-op** in `cloudbuild.yaml` and `deploy.yml:65-71` without `BUILDKIT_INLINE_CACHE=1` or `docker/build-push-action`. Currently zero cache reuse.
- [ ] **Hardcoded LB IPs** `216.239.32.21` and `34.128.174.75` in `deploy.yml:160,280` → move to GH `vars.GCP_RUN_LB_IP` / `vars.MEDIA_LB_IP`.
- [ ] **Add `concurrency:` blocks** to CI / deploy workflows — rapid pushes currently race duplicate runs. Worst case in `deploy.yml`: two `gcloud run deploy` invocations in parallel.
- [ ] **k8s/deployment.yaml**: liveness probe is TCP — a deadlocked Node process that still binds the port won't restart. Switch to HTTP `/api/health/live`. Add `terminationGracePeriodSeconds: 30` + `preStop` sleep for graceful drains.
- [ ] **`pnpm lint || true`** in `ci.yml:42` permanently swallows lint failures. README acknowledges `next lint` is broken on Next 16 — either migrate to flat-config ESLint and drop `|| true`, or remove the lint step until it's real.
- [ ] **k8s/external-secrets.yaml**: atomic sync means one missing key disables the whole secret. Switch to `dataFrom` or split into multiple `ExternalSecret` resources.

## Nice to have

- [ ] **`context/WalletContext.tsx` has 41 `any` casts** (dominant escape-hatch source). Add `Window` interface augmentations for `gapi`/`google` and type the wallet SDK promise.
- [ ] **CSP allows `'unsafe-inline'` and `'unsafe-eval'`** (`middleware.ts:55`) — nonce-based migration eventually.
- [ ] **In-memory rate-limiting is per-pod** in `app/api/stream/chat` and `app/api/room/[id]/chat` → 2 replicas = 2× the intended rate. Move counters to Redis.
- [ ] **`/api/admin/clear-all:75`** leaks `error.stack` to clients on DB-clear failure.
- [ ] **`/api/webhooks/stripe`** missing the 1 MiB body cap that `/api/webhooks/github:14` has.
- [ ] **3 skipped taproot/segwit tests** at `tests/conference/keystore-wallet.test.ts:75,82,89` — fix or delete.
- [ ] **~38 unused shadcn UI primitives** in `components/ui/` — sweep or treat as vendored library.
- [ ] **`CDN_RUST_PORT_DESIGN.md` (19KB) and `TELEMETRY_MIGRATION_PLAN.md` (20KB)** still labeled "SCOPING + SCAFFOLD only". Move to `docs/superpowers/plans/` or delete.
- [ ] **`.impeccable/hook.cache.json`** should be added to `.gitignore`. `.roo/mcp.json` (`{"mcpServers":{}}`) can be removed.
- [ ] **75 remote branches** — at least 14 `deploy/bump-*` deploy markers and 6+ `fix-*` branches look prunable. `git remote prune` + triage.
- [ ] **package.json**: add `engines: { node: ">=20 <21", pnpm: "9.x" }`; pick one version-style convention (current mix of exact + caret pins is accidental).
- [ ] **`docker-compose.yaml:5`** — `version: "3.8"` is obsolete; Compose v2 warns. Drop the line.
- [ ] **`gcp/setup.sh:50-54`** enables deprecated `containerregistry.googleapis.com` (sunset 2025-05-15). Remove.
- [ ] **`gcp/setup.sh:81`** discards the generated root password. Pipe to Secret Manager.
- [ ] **`meet-api-image.yml`** builds an image that nothing deploys (k8s comment says media-server is dropped). Verify or remove.
- [ ] **No Dependabot, no `pnpm audit`, no bundle-size check** in CI. `dependabot.yml` is the cheapest win.

## Suggested PR ordering

1. **Data-loss fix** (Critical #1) — generate baseline migration from current schema, switch deploy to `migrate deploy`.
2. **Quick-win cleanup PR**: delete scratch scripts, drop `swc`, pin Dialog, strip debug logs, fix CI lint, gitignore `.impeccable/hook.cache.json`, drop compose `version:` line. ~30 min, no risk.
3. **Security hardening PR**: timing-safe admin compares, secrets → Secret Manager, prefetch fail-closed.
4. **Docs sync PR**: `.env.example`, `AGENTS.md`, README env list.

## Clean — no action needed
Zero `TODO/FIXME/HACK` comments. Zero `@ts-ignore` / `@ts-nocheck`. No committed secrets. Webhook signatures correctly constant-time (Stripe, GitHub, Documenso). Session cookies hardened (`httpOnly`, `sameSite=lax`, `secure`). GCS uploads enforce MIME + size limits. No wide-open CORS.
