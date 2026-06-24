# Home stats data layer — durable store + SSR + unified /api/stats — design

**Date:** 2026-06-24
**Repo:** `subfrost.io` (Next.js 16 App Router, Prisma/Postgres, Redis, GKE/Flux)
**Branch:** `feat/home-stats-data-layer`
**Status:** approved (brainstorm 2026-06-24, revised after the #96 overlap + the durable-store decision)

## Context & goal

The subfrost.io home renders its high-level metrics **client-side** via 7 separate SWR
fetches (`components/MetricsBoxes.tsx`), and the whole page (`app/page.tsx`) is a
`"use client"` component. Next.js server-renders that tree to HTML but **with no server-side
data** — so the metrics SSR as `'...'` placeholders and only fill in after hydration + 7
round-trips. Result: a slow/blank first load and an intermittent "lifetime tx value" that
briefly shows a number summed from a partial set, then corrects.

Per flex/gabe's direction, crystallized by Vitor: the home's data should **always populate
instantly, even on a user's first visit** — never a slow first load, never a blank card,
never a live fetch in the request path. flex also wants a **ticker marquee** of 5 live data
points (BTC/USD, BTC block height, metashrew block height, DIESEL, FIRE).

The key architectural decision (this revision): the SSR source is a **durable
last-known-good store in Postgres**, not a TTL cache. A TTL Redis cache (the prior plan) goes
cold on eviction/restart/post-deploy and the in-memory fallback is per-pod and starts empty —
so "first visit after a deploy" would blank. A durable DB row, kept fresh by the existing
warmer and read at SSR, is **never cold** (survives restarts/deploys/Redis outages),
**shared** across pods, and **last-known-good** (a failed upstream fetch leaves the previous
value rather than nulling it).

### Division of labour (coordinated with Elon/coinyeezy, PR #96)

PR #96 (`codex/homepage-market-data`) rebuilt the home with its own data layer
(`/api/homepage` envelope + inline fetchers), removed the metric cards, and added a marquee
(`HeroMarketTicker`) that consumed `/api/homepage`. To avoid two competing data layers and a
hard `app/page.tsx` conflict, the split is:

- **Data + the 3 metric cards = us** (this front): the durable store, `/api/stats`, the SSR
  shell, and `MetricsBoxes` (cards kept, fixed to SSR-instant). Our DIESEL/FIRE source is the
  canonical ESPO candle (USD), matching subfrost-app.
- **Marquee visual + editorial layout = Elon**: his marquee consumes our `/api/stats`; he
  drops `/api/homepage` and keeps the 3 cards. The home is **cards + marquee**, not
  marquee-only.

## Global constraints

- **Branch → PR → merge, NEVER push to main.** Deploy is human-owned: merge → Cloud Build
  (short-sha image) → bump `newTag` in `k8s/kustomization.yaml` via PR → Flux. Flux gotcha:
  reconcile the **GitRepository (source)** first so it fetches the bump commit, then the
  Kustomization (the Kustomization reconcile only re-applies the last-fetched revision).
- **Gates:** `npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build` 0
  (benign Windows `EINVAL` copy warnings on the standalone trace).
- **Request path never calls the live cascade.** `/api/stats` and the SSR page read **only**
  the durable store (one Postgres query). All live RPC/ESPO fetches happen only in
  `app/api/prefetch/route.ts` (Cloud Scheduler, every 25 min).
- **Schema change is additive** (a new model, no edits to existing models), applied by the
  repo's `prisma db push` init container; `npx prisma generate` locally is the type gate.
- **RPC:** `mainnet.subfrost.io/v4/subfrost` (JSON-RPC POST) — `lib/rpc-client.ts`
  `subfrostRpc(method, params, timeoutMs)`. mempool.space times out from the server (do not
  use it). zod v3, pnpm, Windows + Git Bash.

## Architecture

```
Cloud Scheduler ─▶ /api/prefetch ─▶ RPC + ESPO ──┬─▶ Redis (legacy keys, TTL)  [old per-metric routes]
   (every 25 min)                                 └─▶ HomeStat table (DURABLE, last-known-good)  ◀── new
                                                       (upsert per key, only on a successful fetch)

Browser GET /  ─▶ app/page.tsx (server) ─▶ getStats(DB) ─▶ initialStats
                                          └▶ <SWRConfig fallback={{ '/api/stats': initialStats }}>
                                               └▶ <HomeClient> (current "use client" body)
                                                    ├▶ MetricsBoxes (3 cards) ─▶ useSWR('/api/stats')
                                                    └▶ marquee (Elon, later) ─▶ consumes /api/stats

GET /api/stats ─▶ getStats(DB)   (one response: metrics + marquee; never cold, never live in-path)
```

## Components

### 1. Durable store — `HomeStat` model + `lib/stats-store.ts` (new)

Prisma model (additive):

```prisma
model HomeStat {
  key       String   @id      // "alkanes-btc-locked", "btc-price", "btc-height", "diesel-price", ...
  value     Json               // same per-key value shape the warmer already produces
  updatedAt DateTime @updatedAt
}
```

- One row per stat key; latest value only (no history — the existing snapshot models cover
  history). `value` is `Json` for flexibility (reuses the shapes already cached).
- `lib/stats-store.ts`:
  - `storeSet(key: string, value: unknown): Promise<void>` — `prisma.homeStat.upsert`.
  - `storeGetAll(): Promise<Record<string, unknown>>` — one `findMany`, keyed by `key`.
- **Last-known-good is automatic:** `storeSet` is called only on the success path of each
  warmer step, so a failed fetch never overwrites the row.

### 2. `lib/stats.ts` (new) — `getStats()` + `HomeStats`

The single assembly function, used by both `/api/stats` and the SSR page. Reads the durable
store once (`storeGetAll`) and returns a typed `HomeStats`:

- `metrics` (the 3 cards): `alkanesBtcLocked`, `brc20BtcLocked`, `alkanesBtcLockedAddress`,
  `brc20BtcLockedAddress`, `alkanesCirculating`, `brc20Circulating`, `alkanesTotalUnwraps`,
  `brc20TotalUnwraps`, `btcPrice` (each `number | null`, addresses `string | null`).
- `marquee` (Elon): `btcUsd` (= btcPrice), `btcHeight`, `metashrewHeight`, `dieselUsd`,
  `fireUsd` (each `number | null`).
- `updatedAt?: string` — newest row `updatedAt` (optional, for staleness display).

Missing/cold key → `null` for that field (never throws, never calls the live cascade). The
numeric/string coercion uses `numOrNull` / `strOrNull` guards so a malformed `value` degrades
to `null`. Decoupled from Prisma via `storeGetAll` so it is unit-testable with a mocked store.

### 3. `app/api/stats/route.ts` (new)

`GET` → `NextResponse.json(await getStats())`. One call returns the full set. Public (same as
the existing metric routes). The per-metric routes (`/api/alkanes-btc-locked`, …) **stay**
(backward-compatible — they still read their Redis keys, which the warmer still writes).

### 4. SSR-from-store: `app/page.tsx` → server shell + `components/HomeClient.tsx`

- The current `"use client"` body of `app/page.tsx` moves verbatim into a new
  `components/HomeClient.tsx` (keeps `"use client"`), accepting `initialStats: HomeStats`.
- `app/page.tsx` becomes a thin **server component**: `const initialStats = await getStats()`,
  then renders `<HomeClient initialStats={initialStats} />` wrapped in
  `<SWRConfig value={{ fallback: { '/api/stats': initialStats } }}>`.
  `export const dynamic = "force-dynamic"` (request-time read, like `/articles`).
- Net: the home is SSR'd **with data** in the HTML → first paint shows the metrics.

### 5. `components/MetricsBoxes.tsx` — 7 SWR calls → 1 (cards kept)

- Replace the per-metric `useMetric(...)` / per-endpoint `useSWR(...)` calls with a single
  `useSWR<HomeStats>('/api/stats', fetcher)` (the SSR fallback provides the first value).
- Derive the 3 cards' values from the one `stats` object (same formatting / USD-toggle logic).
- **Loading-correctness:** compute the "Lifetime Tx Value" (and any derived total) only when
  **all** its inputs are non-null; if any is null, show `<LoadingDots />` for that card —
  never a sum that treats a missing part as 0. The BTC/USD toggle reads `stats.metrics.btcPrice`.
- The `useMetric` hook / per-metric route imports are no longer used by MetricsBoxes (leave
  the routes; remove the dead usage from this component).

### 6. New data sources (the 2 heights + 2 AMM prices)

- `lib/rpc-client.ts`: `getBtcHeight()` → `subfrostRpc<number|string>('esplora_blocks:tip:height', [])`
  → `Number`; `getMetashrewHeight()` → `subfrostRpc<number|string>('metashrew_height', [])`
  → `Number` (metashrew returns a string).
- `lib/espo-price.ts` (new): `getEspoUsdPrice(pool, fetchImpl?)` → POST
  `https://api.alkanode.com/rpc` method `ammdata.get_candles`, params **object**
  `{ pool, timeframe:'10m', side:'base', limit:1, page:1 }`; pool `'2:0-usd'` (DIESEL) /
  `'2:77623-usd'` (FIRE); USD = `Number(result.candles[0].close) / 1e16` (mirrors subfrost-app
  `parseEspoScaledUsd`). DIESEL ≈ $70, FIRE ≈ $55. (alkanode `/rpc` wants params as an object;
  the subfrost gateway has no `ammdata.*`; `oyl.alkanode.com/rpc` = 404 — use `api.alkanode.com/rpc`.)

### 7. `app/api/prefetch/route.ts` — warm Redis + the durable store

Each existing `run(key, fn)` step, plus 4 new ones (`btc-height`, `metashrew-height`,
`diesel-price`, `fire-price`), writes **both** on success:
`cacheSet(key, value, CACHE_TTL)` (existing Redis, for the legacy routes) **and**
`storeSet(key, value)` (new durable upsert). Both inside the `try`, so a failed fetch writes
neither and the durable row keeps its last-known-good value. (BTC/USD is already warmed as
`btc-price`.)

## Marquee contract (what Elon consumes)

`/api/stats` → `HomeStats`. The marquee reads `marquee.{btcUsd, btcHeight, metashrewHeight,
dieselUsd, fireUsd}`. DIESEL/FIRE are exposed in **USD** (canonical ESPO close) plus `btcUsd`
— a BTC-denominated ratio (e.g. BTC/DIESEL) is derivable client-side as `btcUsd / dieselUsd`,
so the visual owns the denomination without us changing the data source.

## Error handling / cold-start

- Request path (`/api/stats`, SSR) only reads the durable store — a cold/absent key surfaces
  as `null`; the client SWR revalidates `/api/stats` in the background and the warmer
  repopulates within its cycle.
- `getStats` is total (no throw): a store read error or a malformed `value` yields `null` for
  that field, not a 500.
- **First deploy** (empty table): fields are `null` until the first warm; run `/api/prefetch`
  once post-deploy (already in the live verification). Thereafter durable — survives restarts,
  deploys, Redis outages, and TTL expiry (there is no TTL on the store).

## Out of scope

- The **marquee visual** (Elon Moist / coinyeezy) — this front only exposes the data.
- Removing the per-metric routes (kept for backward-compat) or the Redis keys (the legacy
  routes still read them).
- The home editorial rebuild / layout (Elon's #96).
- `/articles` SEO/meta-at-publish (separate front).

## Testing

- `lib/stats-store.ts`: `storeSet` upserts; `storeGetAll` returns a key→value map (mocked
  Prisma). Unit.
- `lib/stats.ts` `getStats`: assembles the full payload from a mocked `storeGetAll`; a missing
  key yields `null` for that field; a malformed `value` yields `null` (no throw). Unit.
- `app/api/stats/route.ts`: `GET` returns the assembled payload (mocked `getStats`).
- `components/MetricsBoxes.tsx`: renders the 3 cards from an injected `/api/stats` fallback
  without a loading flash; the lifetime card shows `<LoadingDots />` when any input is null and
  the full sum when all are present. Component test (happy-dom + SWRConfig fallback).
- `lib/rpc-client.ts` `getBtcHeight`/`getMetashrewHeight`: query the right RPC method (mocked
  fetch); the metashrew string height coerces to a number.
- `lib/espo-price.ts`: POSTs `ammdata.get_candles` with the right pool/params and parses
  `candle.close / 1e16`; throws when no candle is returned (mocked fetch).
- Gates: `tsc` 0 · `vitest` green · `next build` 0.

## Verification (live, post-deploy)

1. Run `/api/prefetch` once (or wait for the scheduler) to populate the durable rows.
2. `curl https://subfrost.io/api/stats` → one JSON with all metrics + the marquee block,
   fast (~0.5s, single DB read), heights + diesel/fire USD present.
3. `view-source` of `https://subfrost.io/` shows the metric values **in the SSR HTML** (not
   `'...'`) — data on first paint.
4. The "Lifetime Tx Value" no longer flickers to a lower number then corrects.
5. Restart a pod (or after a deploy) and load the home cold — the cards still paint with data
   immediately (durable store, not a cold cache).
