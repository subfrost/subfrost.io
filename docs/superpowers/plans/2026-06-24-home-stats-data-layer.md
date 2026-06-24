# Home stats data layer — SSR-from-cache + unified /api/stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the subfrost.io home's full stat set from one cached endpoint, SSR-rendered from the Redis cache so the page shows data on first paint (no slow first load, no partial-sum flicker), and add the 5 marquee data points — without building the marquee visual (Elon's lane).

**Architecture:** A single `getStatsFromCache()` reads all stat keys from Redis and is served both by a new `/api/stats` route and by `app/page.tsx` (converted to a thin server shell that hydrates a client `HomeClient` via SWR `fallback`). `MetricsBoxes` goes from 7 client SWR fetches to 1 (`/api/stats`), computing derived totals only from a complete set. New data sources (BTC/metashrew heights via the Subfrost RPC; DIESEL/FIRE USD prices via ESPO `ammdata.get_candles`) are warmed by the existing `/api/prefetch` job.

**Tech Stack:** Next.js 16 App Router (server + client components), React 19, SWR, Redis (`lib/redis.ts`), Vitest + @testing-library/react (happy-dom), the Subfrost JSON-RPC gateway, ESPO/alkanode.

## Global Constraints

- **Branch → PR → merge, NEVER push to main.** Branch already created: `feat/home-stats-data-layer`.
- **Gates (before each PR):** `npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build` 0 (benign Windows `EINVAL` copy warnings on the standalone trace are fine).
- **Request path reads cache only** — `/api/stats` and the SSR page never call the live cascade; missing key → `null`. The live fetches happen only in `/api/prefetch` (Cloud Scheduler, every 25 min) and `cacheSet` with `CACHE_TTL = 2100` (35 min).
- **Cache key contract (exact key → value shape):**
  - existing (already written by the warmer): `alkanes-btc-locked` `{btcLocked:number, address:string}` · `brc20-btc-locked` `{btcLocked:number, address:string}` · `alkanes-circulating` `{circulatingBtc:number}` · `brc20-circulating` `{circulatingBtc:number}` · `alkanes-total-unwraps` `{totalUnwrapsBtc:number}` · `brc20-total-unwraps` `{totalUnwrapsBtc:number}` · `btc-price` `{btcPrice:number}`
  - new (this front adds them): `btc-height` `{height:number}` · `metashrew-height` `{height:number}` · `diesel-price` `{usd:number}` · `fire-price` `{usd:number}`
- **Data sources (verified live 2026-06-24):**
  - BTC/USD: existing `btc-price` cache (subpricer `{RPC}/api/v1/bitcoin-price`).
  - BTC height: `subfrostRpc<number>('esplora_blocks:tip:height', [])`.
  - metashrew height: `subfrostRpc<string|number>('metashrew_height', [])` → coerce to `number`.
  - DIESEL/FIRE USD: POST `https://api.alkanode.com/rpc` method `ammdata.get_candles`, params object `{pool, timeframe:'10m', side:'base', limit:1, page:1}` with `pool` `'2:0-usd'` (DIESEL) / `'2:77623-usd'` (FIRE); `result.candles[0].close` is a decimal string; USD = `Number(close) / 1e16` (mirrors subfrost-app `ESPO_PRICE_SCALE`).
- **Out of scope:** the marquee visual (Elon), removing the per-metric routes, a durable last-known-good store, /articles SEO.
- **Env:** Windows + Git Bash. `pnpm`. zod v3.
- **Each commit ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File map

- `lib/stats.ts` (new) — `HomeStats` type + `getStatsFromCache()` (the cache-assembly contract).
- `app/api/stats/route.ts` (new) — `GET` → `getStatsFromCache()`.
- `lib/rpc-client.ts` (modify) — `getBtcHeight()`, `getMetashrewHeight()`.
- `lib/espo-price.ts` (new) — `getEspoUsdPrice(pool)` via alkanode ammdata.get_candles.
- `app/api/prefetch/route.ts` (modify) — warm `btc-height`, `metashrew-height`, `diesel-price`, `fire-price`.
- `app/page.tsx` (modify → server shell) + `components/HomeClient.tsx` (new, extracted body).
- `components/MetricsBoxes.tsx` (modify) — 7 SWR → 1 `/api/stats` + loading-correctness.
- Tests: `tests/lib/stats.test.ts`, `tests/api/stats.test.ts`, `tests/lib/rpc-heights.test.ts`, `tests/lib/espo-price.test.ts`, `tests/cms/metrics-boxes.test.tsx` (all new).

---

## Task 1: `getStatsFromCache()` + `HomeStats` (the cache contract)

**Files:**
- Create: `lib/stats.ts`
- Test: `tests/lib/stats.test.ts`

**Interfaces:**
- Produces: `HomeStats` (see below); `getStatsFromCache(): Promise<HomeStats>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/stats.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/redis', () => ({ cacheGet: vi.fn() }))

import { getStatsFromCache } from '@/lib/stats'
import { cacheGet } from '@/lib/redis'

const mockCache = (entries: Record<string, unknown>) =>
  vi.mocked(cacheGet).mockImplementation(async (key: string) => (key in entries ? (entries[key] as never) : null))

beforeEach(() => vi.clearAllMocks())

describe('getStatsFromCache', () => {
  it('assembles metrics + marquee from the cache keys', async () => {
    mockCache({
      'alkanes-btc-locked': { btcLocked: 99.6, address: 'bc1pA' },
      'brc20-btc-locked': { btcLocked: 1.0, address: 'bc1pB' },
      'alkanes-circulating': { circulatingBtc: 99.2 },
      'brc20-circulating': { circulatingBtc: 0.95 },
      'alkanes-total-unwraps': { totalUnwrapsBtc: 74.2 },
      'brc20-total-unwraps': { totalUnwrapsBtc: 20.3 },
      'btc-price': { btcPrice: 62000 },
      'btc-height': { height: 955109 },
      'metashrew-height': { height: 955108 },
      'diesel-price': { usd: 70.2 },
      'fire-price': { usd: 55.2 },
    })
    const s = await getStatsFromCache()
    expect(s.metrics.alkanesBtcLocked).toBe(99.6)
    expect(s.metrics.alkanesBtcLockedAddress).toBe('bc1pA')
    expect(s.metrics.btcPrice).toBe(62000)
    expect(s.marquee.btcUsd).toBe(62000)
    expect(s.marquee.btcHeight).toBe(955109)
    expect(s.marquee.metashrewHeight).toBe(955108)
    expect(s.marquee.dieselUsd).toBe(70.2)
    expect(s.marquee.fireUsd).toBe(55.2)
  })

  it('yields null for cold/missing keys (never throws)', async () => {
    mockCache({})
    const s = await getStatsFromCache()
    expect(s.metrics.alkanesBtcLocked).toBeNull()
    expect(s.metrics.alkanesBtcLockedAddress).toBeNull()
    expect(s.marquee.btcHeight).toBeNull()
    expect(s.marquee.dieselUsd).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/lib/stats.test.ts`
Expected: FAIL — module `@/lib/stats` not found.

- [ ] **Step 3: Implement `lib/stats.ts`**

```ts
import { cacheGet } from '@/lib/redis'

export interface HomeStats {
  metrics: {
    alkanesBtcLocked: number | null
    brc20BtcLocked: number | null
    alkanesBtcLockedAddress: string | null
    brc20BtcLockedAddress: string | null
    alkanesCirculating: number | null
    brc20Circulating: number | null
    alkanesTotalUnwraps: number | null
    brc20TotalUnwraps: number | null
    btcPrice: number | null
  }
  marquee: {
    btcUsd: number | null
    btcHeight: number | null
    metashrewHeight: number | null
    dieselUsd: number | null
    fireUsd: number | null
  }
}

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)

/** Assemble the full home stat set from Redis. Reads cache only — never calls
 *  the live cascade. A cold/missing key yields null for that field; never throws. */
export async function getStatsFromCache(): Promise<HomeStats> {
  const [
    alkanesLocked, brc20Locked, alkanesCirc, brc20Circ,
    alkanesUnwraps, brc20Unwraps, price, btcHeight, msHeight, diesel, fire,
  ] = await Promise.all([
    cacheGet<{ btcLocked?: number; address?: string }>('alkanes-btc-locked'),
    cacheGet<{ btcLocked?: number; address?: string }>('brc20-btc-locked'),
    cacheGet<{ circulatingBtc?: number }>('alkanes-circulating'),
    cacheGet<{ circulatingBtc?: number }>('brc20-circulating'),
    cacheGet<{ totalUnwrapsBtc?: number }>('alkanes-total-unwraps'),
    cacheGet<{ totalUnwrapsBtc?: number }>('brc20-total-unwraps'),
    cacheGet<{ btcPrice?: number }>('btc-price'),
    cacheGet<{ height?: number }>('btc-height'),
    cacheGet<{ height?: number }>('metashrew-height'),
    cacheGet<{ usd?: number }>('diesel-price'),
    cacheGet<{ usd?: number }>('fire-price'),
  ])

  const btcPrice = numOrNull(price?.btcPrice)
  return {
    metrics: {
      alkanesBtcLocked: numOrNull(alkanesLocked?.btcLocked),
      brc20BtcLocked: numOrNull(brc20Locked?.btcLocked),
      alkanesBtcLockedAddress: strOrNull(alkanesLocked?.address),
      brc20BtcLockedAddress: strOrNull(brc20Locked?.address),
      alkanesCirculating: numOrNull(alkanesCirc?.circulatingBtc),
      brc20Circulating: numOrNull(brc20Circ?.circulatingBtc),
      alkanesTotalUnwraps: numOrNull(alkanesUnwraps?.totalUnwrapsBtc),
      brc20TotalUnwraps: numOrNull(brc20Unwraps?.totalUnwrapsBtc),
      btcPrice,
    },
    marquee: {
      btcUsd: btcPrice,
      btcHeight: numOrNull(btcHeight?.height),
      metashrewHeight: numOrNull(msHeight?.height),
      dieselUsd: numOrNull(diesel?.usd),
      fireUsd: numOrNull(fire?.usd),
    },
  }
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/lib/stats.test.ts`
Expected: PASS (both cases).

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add lib/stats.ts tests/lib/stats.test.ts
git commit -m "feat(home): getStatsFromCache assembles the full stat set from Redis

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `GET /api/stats`

**Files:**
- Create: `app/api/stats/route.ts`
- Test: `tests/api/stats.test.ts`

**Interfaces:**
- Consumes: `getStatsFromCache` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `tests/api/stats.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/stats', () => ({ getStatsFromCache: vi.fn() }))

import { GET } from '@/app/api/stats/route'
import { getStatsFromCache } from '@/lib/stats'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/stats', () => {
  it('returns the assembled stats payload', async () => {
    vi.mocked(getStatsFromCache).mockResolvedValueOnce({
      metrics: { alkanesBtcLocked: 99.6, brc20BtcLocked: 1, alkanesBtcLockedAddress: null, brc20BtcLockedAddress: null, alkanesCirculating: null, brc20Circulating: null, alkanesTotalUnwraps: null, brc20TotalUnwraps: null, btcPrice: 62000 },
      marquee: { btcUsd: 62000, btcHeight: 955109, metashrewHeight: 955108, dieselUsd: 70.2, fireUsd: 55.2 },
    })
    const res = await GET()
    expect(res.status).toBe(200)
    const data = await res.json()
    expect(data.metrics.alkanesBtcLocked).toBe(99.6)
    expect(data.marquee.btcHeight).toBe(955109)
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/api/stats.test.ts`
Expected: FAIL — module `@/app/api/stats/route` not found.

- [ ] **Step 3: Implement the route**

Create `app/api/stats/route.ts`:

```ts
/**
 * Unified home statistics endpoint.
 *
 * Returns the entire home stat set (metrics + marquee) in one call, assembled
 * from the Redis cache (kept warm by /api/prefetch). Cache-only — never calls
 * the live cascade in the request path. This is what the home SSR reads and
 * what the client (MetricsBoxes + the marquee) fetches.
 */
import { NextResponse } from 'next/server'
import { getStatsFromCache } from '@/lib/stats'

export async function GET() {
  return NextResponse.json(await getStatsFromCache())
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/api/stats.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add app/api/stats/route.ts tests/api/stats.test.ts
git commit -m "feat(home): GET /api/stats serves the full stat set in one call

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: BTC + metashrew height sources

**Files:**
- Modify: `lib/rpc-client.ts`
- Test: `tests/lib/rpc-heights.test.ts`

**Interfaces:**
- Produces: `getBtcHeight(): Promise<number>`, `getMetashrewHeight(): Promise<number>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/rpc-heights.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

const mockFetch = vi.fn()
global.fetch = mockFetch as unknown as typeof fetch

import { getBtcHeight, getMetashrewHeight } from '@/lib/rpc-client'

const rpc = (result: unknown) => ({ ok: true, json: async () => ({ jsonrpc: '2.0', id: 1, result }) })

beforeEach(() => vi.clearAllMocks())

describe('getBtcHeight / getMetashrewHeight', () => {
  it('getBtcHeight queries esplora_blocks:tip:height and returns a number', async () => {
    mockFetch.mockResolvedValueOnce(rpc(955109))
    const h = await getBtcHeight()
    expect(h).toBe(955109)
    const body = JSON.parse(String((mockFetch.mock.calls[0][1] as RequestInit).body))
    expect(body.method).toBe('esplora_blocks:tip:height')
  })

  it('getMetashrewHeight coerces the string height to a number', async () => {
    mockFetch.mockResolvedValueOnce(rpc('955108'))
    const h = await getMetashrewHeight()
    expect(h).toBe(955108)
    const body = JSON.parse(String((mockFetch.mock.calls[0][1] as RequestInit).body))
    expect(body.method).toBe('metashrew_height')
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/lib/rpc-heights.test.ts`
Expected: FAIL — `getBtcHeight`/`getMetashrewHeight` not exported.

- [ ] **Step 3: Implement in `lib/rpc-client.ts`**

Add, after the existing Esplora methods section (these reuse the file's existing `subfrostRpc` helper):

```ts
/** Current Bitcoin tip height from the Subfrost RPC esplora index. */
export async function getBtcHeight(): Promise<number> {
  const result = await subfrostRpc<number | string>('esplora_blocks:tip:height', [], 10_000)
  return Number(result)
}

/** Current metashrew indexer height (returned as a string by the node). */
export async function getMetashrewHeight(): Promise<number> {
  const result = await subfrostRpc<number | string>('metashrew_height', [], 10_000)
  return Number(result)
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/lib/rpc-heights.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add lib/rpc-client.ts tests/lib/rpc-heights.test.ts
git commit -m "feat(home): BTC tip + metashrew height RPC sources

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 4: ESPO USD price source (DIESEL/FIRE)

**Files:**
- Create: `lib/espo-price.ts`
- Test: `tests/lib/espo-price.test.ts`

**Interfaces:**
- Produces: `getEspoUsdPrice(pool: string, fetchImpl?: typeof fetch): Promise<number>`; constants `DIESEL_POOL = '2:0-usd'`, `FIRE_POOL = '2:77623-usd'`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/espo-price.test.ts`:

```ts
import { describe, it, expect, vi } from 'vitest'
import { getEspoUsdPrice, DIESEL_POOL, FIRE_POOL } from '@/lib/espo-price'

const candleReply = (close: string) => ({
  ok: true,
  json: async () => ({ jsonrpc: '2.0', id: 1, result: { ok: true, candles: [{ close }] } }),
})

describe('getEspoUsdPrice', () => {
  it('POSTs ammdata.get_candles and parses candle.close / 1e16', async () => {
    const fetchImpl = vi.fn(async () => candleReply('702147774299597804')) as unknown as typeof fetch
    const usd = await getEspoUsdPrice(DIESEL_POOL, fetchImpl)
    expect(usd).toBeCloseTo(70.2147774299597804, 4)
    const [url, init] = vi.mocked(fetchImpl).mock.calls[0]
    expect(String(url)).toBe('https://api.alkanode.com/rpc')
    const body = JSON.parse(String((init as RequestInit).body))
    expect(body.method).toBe('ammdata.get_candles')
    expect(body.params.pool).toBe('2:0-usd')
    expect(body.params.timeframe).toBe('10m')
  })

  it('exposes the FIRE pool id', () => {
    expect(FIRE_POOL).toBe('2:77623-usd')
  })

  it('throws when no candle is returned', async () => {
    const fetchImpl = vi.fn(async () => ({ ok: true, json: async () => ({ result: { ok: true, candles: [] } }) })) as unknown as typeof fetch
    await expect(getEspoUsdPrice(DIESEL_POOL, fetchImpl)).rejects.toThrow()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/lib/espo-price.test.ts`
Expected: FAIL — module `@/lib/espo-price` not found.

- [ ] **Step 3: Implement `lib/espo-price.ts`**

```ts
/**
 * DIESEL/FIRE USD prices from ESPO (canon alkanode). Mirrors subfrost-app's
 * `fetchEspoUsdPricesFrom10mCandles` + `parseEspoScaledUsd`: ammdata.get_candles
 * on the `<id>-usd` pool, newest 10m candle, USD = Number(close) / 1e16.
 */
const ESPO_RPC_URL = process.env.ESPO_RPC_URL || 'https://api.alkanode.com/rpc'
const ESPO_PRICE_SCALE = 10_000_000_000_000_000 // 1e16

export const DIESEL_POOL = '2:0-usd'
export const FIRE_POOL = '2:77623-usd'

export async function getEspoUsdPrice(pool: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(ESPO_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'ammdata.get_candles',
      params: { pool, timeframe: '10m', side: 'base', limit: 1, page: 1 },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`ESPO get_candles ${pool} responded ${res.status}`)
  const data = (await res.json()) as { result?: { candles?: { close?: string }[] } }
  const close = data.result?.candles?.[0]?.close
  if (!close || !/^\d+$/.test(close)) throw new Error(`ESPO get_candles ${pool} returned no candle`)
  const usd = Number(close) / ESPO_PRICE_SCALE
  if (!Number.isFinite(usd) || usd <= 0) throw new Error(`ESPO get_candles ${pool} parsed non-positive USD`)
  return usd
}
```

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/lib/espo-price.test.ts`
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add lib/espo-price.ts tests/lib/espo-price.test.ts
git commit -m "feat(home): DIESEL/FIRE USD price source via ESPO ammdata.get_candles

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 5: Warm the 4 new keys in `/api/prefetch`

**Files:**
- Modify: `app/api/prefetch/route.ts`

**Interfaces:**
- Consumes: `getBtcHeight`, `getMetashrewHeight` (Task 3); `getEspoUsdPrice`, `DIESEL_POOL`, `FIRE_POOL` (Task 4).

> No new unit test: the warmer is an orchestration of already-tested fns + `cacheSet`, verified by `tsc` + `next build` + the live post-deploy `/api/prefetch` run. Match the existing `run(key, fn)` pattern exactly.

- [ ] **Step 1: Add imports**

In `app/api/prefetch/route.ts`, extend the existing imports:

```ts
import { getAlkanesBtcLocked, getBrc20BtcLocked, getBrc20TotalSupply, getBtcHeight, getMetashrewHeight } from '@/lib/rpc-client'
import { getEspoUsdPrice, DIESEL_POOL, FIRE_POOL } from '@/lib/espo-price'
```

(Keep the existing `fetchAlkanesCirculating` / `getVolumeStats` / `getVolumeCandles` imports as-is.)

- [ ] **Step 2: Add the 4 warm steps**

Inside the `await Promise.allSettled([ … ])` array (alongside the existing `run('btc-price', …)` etc.), add:

```ts
    run('btc-height', async () => {
      const height = await getBtcHeight()
      await cacheSet('btc-height', { height }, CACHE_TTL)
    }),

    run('metashrew-height', async () => {
      const height = await getMetashrewHeight()
      await cacheSet('metashrew-height', { height }, CACHE_TTL)
    }),

    run('diesel-price', async () => {
      const usd = await getEspoUsdPrice(DIESEL_POOL)
      await cacheSet('diesel-price', { usd }, CACHE_TTL)
    }),

    run('fire-price', async () => {
      const usd = await getEspoUsdPrice(FIRE_POOL)
      await cacheSet('fire-price', { usd }, CACHE_TTL)
    }),
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` → 0, then `npx next build` → 0.

- [ ] **Step 4: Commit**

```bash
git add app/api/prefetch/route.ts
git commit -m "feat(home): warm btc-height, metashrew-height, diesel/fire price keys

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 6: SSR-from-cache — `app/page.tsx` server shell + `components/HomeClient.tsx`

**Files:**
- Create: `components/HomeClient.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getStatsFromCache` + `HomeStats` (Task 1).
- Produces: `HomeClient` accepts `{ initialStats: HomeStats }`; the home is wrapped in `<SWRConfig value={{ fallback: { '/api/stats': initialStats } }}>`.

> No new unit test: this is a server/client boundary refactor verified by `tsc` + `next build` + the live post-deploy `view-source` check (Task 7 adds the MetricsBoxes test that exercises the fallback). Moving the body is mechanical — the JSX is unchanged.

- [ ] **Step 1: Create `components/HomeClient.tsx` from the current page body**

Move the **entire current contents** of `app/page.tsx` into a new `components/HomeClient.tsx`, with three changes:
1. Keep the `"use client"` directive at the top.
2. Rename the default export function from `Page` to `HomeClient` and give it the prop:
   ```ts
   import type { HomeStats } from '@/lib/stats'
   export default function HomeClient({ initialStats }: { initialStats: HomeStats }) {
   ```
   (`initialStats` is consumed by MetricsBoxes via the SWR fallback set in `app/page.tsx`; it is accepted here so the prop type flows. It is fine that this component does not read `initialStats` directly yet — the SWRConfig wrapper in `page.tsx` is what hydrates SWR.)
3. Leave every import and all JSX exactly as they were (the giant journal comment header may move with it or be dropped — does not matter).

- [ ] **Step 2: Replace `app/page.tsx` with the server shell**

Overwrite `app/page.tsx` with:

```tsx
import { SWRConfig } from 'swr'
import HomeClient from '@/components/HomeClient'
import { getStatsFromCache } from '@/lib/stats'

export const dynamic = 'force-dynamic'

// Server shell: read the full stat set from the Redis cache at request time and
// hand it to the client tree as the SWR fallback for '/api/stats', so the home
// is server-rendered WITH data on first paint (no '...' flash, no slow first load).
export default async function Page() {
  const initialStats = await getStatsFromCache()
  return (
    <SWRConfig value={{ fallback: { '/api/stats': initialStats } }}>
      <HomeClient initialStats={initialStats} />
    </SWRConfig>
  )
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` → 0, then `npx next build` → 0.
Expected: the home route still builds (now `ƒ`/dynamic). Benign Windows `EINVAL` copy warnings are fine.

- [ ] **Step 4: Run the full suite (no regressions)**

Run: `CI=true npx vitest run`
Expected: green (MetricsBoxes still uses its current per-metric SWR calls at this point — unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/HomeClient.tsx
git commit -m "feat(home): SSR-from-cache server shell + extract HomeClient

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: `MetricsBoxes` — 7 SWR fetches → 1 `/api/stats` + loading-correctness

**Files:**
- Modify: `components/MetricsBoxes.tsx`
- Test: `tests/cms/metrics-boxes.test.tsx`

**Interfaces:**
- Consumes: `/api/stats` (Task 2) + the SSR `fallback` (Task 6); `HomeStats` (Task 1).

- [ ] **Step 1: Write the failing test**

Create `tests/cms/metrics-boxes.test.tsx`:

```tsx
import { describe, it, expect, beforeEach, vi } from 'vitest'
import { render, cleanup } from '@testing-library/react'
import { SWRConfig } from 'swr'
import MetricsBoxes from '@/components/MetricsBoxes'
import type { HomeStats } from '@/lib/stats'

vi.mock('@/hooks/useTranslation', () => ({ useTranslation: () => ({ t: (k: string) => k }) }))

beforeEach(() => cleanup())

const stats = (over: Partial<HomeStats['metrics']> = {}): HomeStats => ({
  metrics: {
    alkanesBtcLocked: 99.6, brc20BtcLocked: 1, alkanesBtcLockedAddress: null, brc20BtcLockedAddress: null,
    alkanesCirculating: 99.2, brc20Circulating: 0.95, alkanesTotalUnwraps: 74.2, brc20TotalUnwraps: 20.3,
    btcPrice: 62000, ...over,
  },
  marquee: { btcUsd: 62000, btcHeight: null, metashrewHeight: null, dieselUsd: null, fireUsd: null },
})

const renderWith = (s: HomeStats) =>
  render(
    <SWRConfig value={{ fallback: { '/api/stats': s }, provider: () => new Map() }}>
      <MetricsBoxes onPartnershipsClick={() => {}} />
    </SWRConfig>,
  )

describe('MetricsBoxes — SSR fallback', () => {
  it('renders the combined BTC locked from the fallback (99.6 + 1 = 100.6)', () => {
    const { getByText } = renderWith(stats())
    expect(getByText('100.600')).toBeTruthy()
  })

  it('shows the full lifetime value when all inputs are present (74.2+20.3+99.2+0.95)', () => {
    const { getByText } = renderWith(stats())
    expect(getByText('194.650')).toBeTruthy()
  })

  it('shows a loading state (not a partial sum) when a lifetime input is null', () => {
    const { queryByText } = renderWith(stats({ brc20TotalUnwraps: null }))
    // must NOT render the partial sum that drops the missing part
    expect(queryByText('174.350')).toBeNull()
  })
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `CI=true npx vitest run tests/cms/metrics-boxes.test.tsx`
Expected: FAIL — MetricsBoxes still fetches 7 endpoints (no `/api/stats` consumption; `100.600` not found).

- [ ] **Step 3: Refactor the data layer of `MetricsBoxes.tsx`**

In `components/MetricsBoxes.tsx`, replace the data-fetching block (the `useMetric(...)` calls, the per-endpoint `useSWR(...)` calls, the `METRIC_ENDPOINTS`/`handleRefresh` SWR mutate plumbing, and the derived `combinedBtcLocked`/`combinedFrbtcSupply`/`lifetime*` computations at the top of the component) with a single `/api/stats` read. Keep the imports of `useState`, the UI pieces, and `useTranslation`. Remove the `useMetric` import and the `useSWRConfig`/`METRIC_ENDPOINTS` plumbing.

Replace the hooks/derivation section with:

```tsx
import useSWR from 'swr'
import type { HomeStats } from '@/lib/stats'

const fetcher = (url: string) => fetch(url).then((res) => res.json())

// inside the component, replacing the old useMetric/useSWR calls:
  const { data: stats } = useSWR<HomeStats>('/api/stats', fetcher, { refreshInterval: 900000 })
  const m = stats?.metrics

  const num = (v: number | null | undefined): number | null => (typeof v === 'number' ? v : null)
  const sumOrNull = (...vals: (number | null)[]): number | null =>
    vals.every((v) => v !== null) ? (vals as number[]).reduce((a, b) => a + b, 0) : null

  const combinedBtcLockedVal = sumOrNull(num(m?.alkanesBtcLocked), num(m?.brc20BtcLocked))
  const combinedFrbtcSupplyVal = sumOrNull(num(m?.alkanesCirculating), num(m?.brc20Circulating))
  const lifetimeVal = sumOrNull(
    num(m?.alkanesTotalUnwraps), num(m?.brc20TotalUnwraps),
    num(m?.alkanesCirculating), num(m?.brc20Circulating),
  )

  const combinedBtcLocked: number | React.ReactNode = combinedBtcLockedVal ?? <LoadingDots />
  const combinedFrbtcSupply: number | React.ReactNode = combinedFrbtcSupplyVal ?? <LoadingDots />
  const lifetimeBtcTxValue: number | React.ReactNode =
    lifetimeVal !== null ? formatBtcValue(lifetimeVal) : <LoadingDots />
  const lifetimeLoading = lifetimeVal === null

  const btcPrice = num(m?.btcPrice)
  const alkanesAddress = m?.alkanesBtcLockedAddress ?? ''
  const brc20Address = m?.brc20BtcLockedAddress ?? ''
```

Update the consumers that previously read separate values:
- The USD toggle / `getDisplayValue`: replace `btcPriceData.btcPrice` / `btcPriceError || !btcPriceData` with `btcPrice` (null → `<LoadingDots />`), e.g.:
  ```tsx
  const getDisplayValue = (btcValue: number | string | React.ReactNode): string | React.ReactNode => {
    if (typeof btcValue !== 'number') return btcValue
    if (currency === 'USD') {
      if (btcPrice === null) return <LoadingDots />
      return formatUsd(btcValue * btcPrice)
    }
    return btcValue >= 10 ? btcValue.toFixed(3) : btcValue.toFixed(4)
  }
  ```
- The BTC-price label at the bottom: `btcPrice ? \`$${Math.round(btcPrice).toLocaleString('en-US')}\` : '...'`.
- The breakdown popovers that printed per-source numbers (`alkanesCirculatingFrbtc`, `brc20Circulating`, `alkanesBtcLocked`, `alkanesTotalUnwraps`, …): read them from `m` with the same `num(...)` guard, printing `'...'` when null. For example the "Total BTC Locked" popover:
  ```tsx
  <p>Alkanes: {num(m?.alkanesBtcLocked) !== null ? (m!.alkanesBtcLocked as number).toFixed(5) : '...'} {alkanesAddress && <a href={`https://mempool.space/address/${alkanesAddress}`} target="_blank" rel="noopener noreferrer" className="underline">{shortenAddress(alkanesAddress)}</a>}</p>
  <p>BRC20: {num(m?.brc20BtcLocked) !== null ? (m!.brc20BtcLocked as number).toFixed(5) : '...'} {brc20Address && <a href={`https://mempool.space/address/${brc20Address}`} target="_blank" rel="noopener noreferrer" className="underline">{shortenAddress(brc20Address)}</a>}</p>
  ```
  Apply the same `num(m?.X) !== null ? … : '...'` pattern to the Current frBTC Supply and Lifetime Tx Value popovers (Alkanes/BRC20 lines).
- The refresh button: replace `handleRefresh` (which mutated 7 endpoints) with a single `mutate('/api/stats')` via `useSWRConfig`:
  ```tsx
  import { useSWRConfig } from 'swr'
  // …
  const { mutate } = useSWRConfig()
  const handleRefresh = async () => {
    setIsRefreshing(true)
    try { await mutate('/api/stats') } finally { setIsRefreshing(false) }
  }
  ```
- Delete the now-unused `formatBtcValue(value)`-only `brc20BtcLocked`/`brc20Circulating` intermediate consts if they are no longer referenced; keep `formatBtcValue`, `formatUsd`, `LoadingDots`, `AnimatedCountUp` (AnimatedCountUp may become unused — if so, remove it to keep the test output pristine).

Leave the entire JSX render structure (the 3 metric cards, the toggle, the refresh button markup) intact except for the value bindings above.

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/metrics-boxes.test.tsx`
Expected: PASS (combined 100.600, lifetime 194.650, and no partial sum when an input is null).

- [ ] **Step 5: Typecheck + full suite + build**

Run: `npx tsc --noEmit` → 0 · `CI=true npx vitest run` → green · `npx next build` → 0.

- [ ] **Step 6: Commit**

```bash
git add components/MetricsBoxes.tsx tests/cms/metrics-boxes.test.tsx
git commit -m "feat(home): MetricsBoxes reads one /api/stats call, no partial-sum flicker

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Final verification (before opening the PR)

- [ ] **Full gates**

Run:
```bash
npx tsc --noEmit
CI=true npx vitest run
npx next build
```
Expected: tsc 0 · vitest green (incl. new `stats`, `api/stats`, `rpc-heights`, `espo-price`, `metrics-boxes` suites) · build 0.

- [ ] **Open the PR** (do NOT merge or bump `newTag` without Vitor's go):

```bash
git push -u origin feat/home-stats-data-layer
gh pr create --title "Home stats data layer: SSR-from-cache + unified /api/stats (+marquee data)" --body "$(cat <<'EOF'
Builds the data layer behind the subfrost.io home (the marquee visual is Elon's separate PR).

- **`/api/stats`** — one cache-backed call returns the full stat set (metrics + marquee).
- **SSR-from-cache** — `app/page.tsx` is now a server shell that reads the Redis cache and hydrates the client tree via SWR `fallback`, so the home paints WITH data (no `'...'` flash, no slow first load).
- **`MetricsBoxes`** — 7 client fetches → 1 (`/api/stats`); the "Lifetime Tx Value" is computed only from a complete set (kills the "wrong number then refresh" flicker).
- **Marquee data points** — BTC/USD, BTC height (`esplora_blocks:tip:height`), metashrew height (`metashrew_height`), DIESEL & FIRE USD (ESPO `ammdata.get_candles`), all warmed by `/api/prefetch`.

Gates: tsc 0 · vitest green · build 0. No schema change.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Live verification (post-merge + deploy)
1. After deploy, run `/api/prefetch` once (or wait for the scheduler) to warm the 4 new keys, then `curl https://subfrost.io/api/stats` → one JSON with `metrics` + `marquee` (heights + diesel/fire USD present), fast (~0.5s).
2. `curl -s https://subfrost.io/ | grep -o '100\\.[0-9]*'` (or view-source) → the BTC-locked value appears in the **SSR HTML** (data on first paint, not `'...'`).
3. Watch the "Lifetime Tx Value" — it no longer flickers to a lower number then corrects.
