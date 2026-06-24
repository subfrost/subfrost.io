# Home stats data layer — SSR-from-cache + unified /api/stats — design

**Date:** 2026-06-24
**Repo:** `subfrost.io` (Next.js 16 App Router, Prisma/Postgres, Redis, GKE/Flux)
**Branch:** `feat/home-stats-data-layer`
**Status:** approved (brainstorm 2026-06-24)

## Context & goal

The subfrost.io home renders its high-level metrics **client-side** via 7 separate SWR
fetches (`components/MetricsBoxes.tsx`), and the whole page (`app/page.tsx`) is a
`"use client"` component. Next.js still server-renders that tree to HTML, but **with no
server-side data** — so the metrics SSR as `'...'` placeholders and only fill in after
hydration + 7 successful round-trips. Result: a slow/blank first load and an intermittent
"lifetime tx value" that briefly shows a number summed from a partial set (loaded parts
counted, not-yet-loaded counted as 0), then corrects on refresh.

Per flex's direction: **serve the entire set of statistics in one API call, rendered SSR
from cache at the nextjs layer** so the page always shows data on first paint — aligned
with how `/articles` is server-rendered. flex also wants a **ticker marquee** of 5 live
data points (BTC/USD, BTC block height, metashrew block height, BTC/DIESEL, BTC/FIRE).

**This front builds the data layer + SSR, not the marquee visual.** The marquee's visual
design is owned by Elon Moist (coinyeezy) and will be a separate PR; it will consume the
`/api/stats` payload this front produces. Vitor handles implementing the data side.

## Global constraints

- **Branch → PR → merge, NEVER push to main.** Deploy is human-owned: merge → Cloud Build
  (short-sha image) → bump `newTag` in `k8s/kustomization.yaml` via PR → Flux. Flux gotcha:
  reconcile the **GitRepository (source)** first so it fetches the bump commit, then the
  Kustomization (the Kustomization reconcile only re-applies the last-fetched revision).
- **Gates:** `npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build` 0
  (benign Windows `EINVAL` copy warnings on the standalone trace).
- **Reuse the existing cache + warmer model:** Redis via `lib/redis.ts` (`cacheGet`/
  `cacheSet`), TTL `2100`s (35 min), warmed by `app/api/prefetch/route.ts` (Cloud Scheduler
  every 25 min). `/api/stats` and the SSR read **only the cache** — never the live cascade
  in the request path.
- **RPC:** `mainnet.subfrost.io/v4/subfrost` (JSON-RPC POST) — `lib/rpc-client.ts`
  `subfrostRpc(method, params, timeoutMs)`. mempool.space times out from the server (do not
  use it). zod v3, pnpm, Windows + Git Bash.

## Architecture

```
Cloud Scheduler ─▶ /api/prefetch ─▶ RPC + ESPO ─▶ Redis (all keys warm, every 25 min)

Browser GET /  ─▶ app/page.tsx (server)  ─▶ getStatsFromCache(Redis)  ─▶ initialStats
                                          └▶ <SWRConfig fallback={{ '/api/stats': initialStats }}>
                                               └▶ <HomeClient>  (current "use client" body)
                                                    └▶ MetricsBoxes  ─▶ useSWR('/api/stats')
                                                         (first render = SSR data, no flicker;
                                                          revalidate in background every 15 min)

GET /api/stats ─▶ getStatsFromCache(Redis)  (single response: all metrics + marquee)
Marquee (Elon, later) ─▶ consumes /api/stats
```

## Components

### 1. `lib/stats.ts` (new) — `getStatsFromCache()`
The single cache-assembly function, used by both `/api/stats` and the SSR page. Reads all
stat keys from Redis (one batched read where possible) and returns a typed `HomeStats`:

- `metrics`: the existing 6 — `alkanesBtcLocked`, `brc20BtcLocked`, `alkanesCirculating`,
  `brc20Circulating`, `alkanesTotalUnwraps`, `brc20TotalUnwraps` (each `number | null`),
  plus `btcPrice: number | null`.
- `marquee`: `btcUsd` (= btcPrice), `btcHeight: number | null`, `metashrewHeight: number | null`,
  `dieselPrice: number | null`, `firePrice: number | null`.
- `updatedAt`: newest source timestamp (for staleness display, optional).

Missing/cold key → `null` for that field (never throws, never calls the live cascade). Pure
over an injected cache reader so it is unit-testable without Redis.

### 2. `app/api/stats/route.ts` (new)
`GET` → `NextResponse.json(await getStatsFromCache())`. One call returns the full set. No
auth (public, same as the existing metric routes). The existing per-metric routes
(`/api/alkanes-btc-locked`, …) **stay** (backward-compatible; the warmer still writes their
keys, which `getStatsFromCache` reads) — this front does not remove them.

### 3. SSR-from-cache: `app/page.tsx` → server shell + `components/HomeClient.tsx`
- The current 420-line `"use client"` body of `app/page.tsx` moves verbatim into a new
  `components/HomeClient.tsx` (keeps `"use client"`), accepting an `initialStats: HomeStats`
  prop.
- `app/page.tsx` becomes a thin **server component**: `const initialStats = await
  getStatsFromCache()`, then renders `<HomeClient initialStats={initialStats} />` wrapped in
  `<SWRConfig value={{ fallback: { '/api/stats': initialStats } }}>`. `export const dynamic
  = "force-dynamic"` (reads request-time cache, same as `/articles`).
- Net behavior change: the home is SSR'd **with data** in the HTML, so first paint shows the
  metrics immediately.

### 4. `components/MetricsBoxes.tsx` — 7 SWR calls → 1
- Replace the per-metric `useMetric(...)` + per-endpoint `useSWR(...)` calls with a single
  `useSWR<HomeStats>('/api/stats', fetcher)` (the SSR fallback provides the first value).
- Derive the displayed values from the one `stats` object (same formatting/USD-toggle logic).
- **Loading-correctness:** compute the "Lifetime Tx Value" (and any derived total) only when
  **all** its inputs are non-null; if any is null (cold cache), show `<LoadingDots />` for
  that card — never a sum that treats a missing part as 0. The BTC/USD toggle reads
  `stats.metrics.btcPrice`.
- The `useMetric` hook and the per-metric route imports are no longer used by MetricsBoxes
  (leave the routes; remove the now-dead `useMetric` usage from this component).

### 5. New data sources (the 2 heights + 2 AMM prices)
- `lib/rpc-client.ts`: add `getBtcHeight()` → `subfrostRpc<number>('esplora_blocks:tip:height',
  [])`; `getMetashrewHeight()` → `subfrostRpc<string|number>('metashrew_height', [])` (returns
  a numeric height; metashrew returns it as a string — coerce to number).
- `lib/espo-price.ts` (new): `getEspoUsdPrice(tokenId)` → ESPO `ammdata.get_candles` →
  parse `candle.close` (scaled USD), mirroring `subfrost-app/queries/account.ts:684-725`
  (`parseEspoScaledUsd`). Used for DIESEL and FIRE. **To pin in the plan:** the ESPO endpoint
  URL for the server (subfrost-app proxies `/api/rpc/<network>/espo`; confirm the subfrost.io
  server's ESPO base), the DIESEL and FIRE alkane token-ids, and whether the marquee wants
  USD or BTC-denominated (default: USD price, like the wallet; a BTC-denominated value can be
  derived as `usd / btcUsd` if needed).

### 6. `app/api/prefetch/route.ts` — warm the new keys
Add to the `Promise.allSettled` batch: `btc-height`, `metashrew-height`, `diesel-price`,
`fire-price` (BTC/USD already warmed as `btc-price`). Each `run(key, fn)` fetches via the new
libs and `cacheSet`s with the existing `CACHE_TTL`. So `/api/stats` always serves warm.

## Error handling / cold-cache

- Request path (`/api/stats`, SSR) never calls the live cascade — only cache reads. A cold or
  failed key surfaces as `null`; the client SWR revalidates `/api/stats` in the background and
  the server-side warmer repopulates within its cycle.
- `getStatsFromCache` is total (no throw): a Redis read error for one key yields `null` for
  that field, not a 500.
- **Out of scope (future):** a durable "last-known-good" key (TTL-less) so SSR always has a
  value even after a long warmer outage. The warmer (25 min) + TTL (35 min) covers the normal
  case; note it but don't build it now.

## Out of scope

- The **marquee visual** (Elon Moist / coinyeezy) — this front only exposes the data in
  `/api/stats`.
- Removing the per-metric routes (kept for backward-compat).
- `/articles` SEO/meta-at-publish work flex mentioned (separate front).
- Durable last-known-good store.

## Testing

- `lib/stats.ts` `getStatsFromCache`: assembles the full payload from a mocked cache reader;
  a missing key yields `null` for that field (no throw). Unit.
- `app/api/stats/route.ts`: `GET` returns the assembled payload (mocked `getStatsFromCache`).
- `components/MetricsBoxes.tsx`: renders values from an injected `/api/stats` fallback without
  a loading flash; the lifetime card shows `<LoadingDots />` when any input is null and the
  full sum when all are present. Component test (happy-dom + SWRConfig fallback).
- `lib/rpc-client.ts` `getBtcHeight`/`getMetashrewHeight`: query the right RPC method (mocked
  fetch); metashrew string height coerces to number.
- `lib/espo-price.ts`: parses `candle.close` to a USD number (mocked ESPO response).
- Gates: `tsc` 0 · `vitest` green · `next build` 0.

## Verification (live, post-deploy)

1. `curl https://subfrost.io/api/stats` returns one JSON with all metrics + the marquee
   block, fast (~0.5s, cache).
2. `view-source` of `https://subfrost.io/` shows the metric values **in the SSR HTML** (not
   `'...'`), i.e. data on first paint.
3. The "Lifetime Tx Value" no longer flickers to a lower number then corrects — it shows the
   complete value or a clean loading state.
