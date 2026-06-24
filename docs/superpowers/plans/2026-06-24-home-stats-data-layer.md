# Home stats data layer — durable store + SSR + unified /api/stats — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Serve the subfrost.io home's full stat set from one endpoint backed by a durable Postgres last-known-good store, SSR-rendered so the home shows data on first paint even cold (post-deploy/restart), keep the 3 metric cards, and add the 5 marquee data points — without building the marquee visual (Elon's lane).

**Architecture:** A new `HomeStat` Postgres table (one row per stat key) is the durable source. The existing `/api/prefetch` cron writes both Redis (legacy per-metric routes) and the durable store, **only on a successful fetch** (last-known-good). `getStats()` reads the store once and is served by both a new `/api/stats` route and by `app/page.tsx` (a thin server shell that hydrates a client `HomeClient` via SWR `fallback`). `MetricsBoxes` (the 3 cards) goes from 7 client SWR fetches to 1. New sources: BTC/metashrew heights via the Subfrost RPC; DIESEL/FIRE USD via ESPO `ammdata.get_candles`.

**Tech Stack:** Next.js 16 App Router (server + client components), React 19, SWR, Prisma/Postgres (`lib/prisma`, default export), Redis (`lib/redis.ts`), Vitest + @testing-library/react (happy-dom), the Subfrost JSON-RPC gateway, ESPO/alkanode.

## Global Constraints

- **Branch → PR → merge, NEVER push to main.** Branch already exists: `feat/home-stats-data-layer` (base `daf1c03`). Do NOT `git add` the untracked `.claude/` or `.npmrc`.
- **Gates (before each PR):** `npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build` 0 (benign Windows `EINVAL` copy warnings on the standalone trace are fine).
- **Request path reads the durable store only** — `/api/stats` and the SSR page call `getStats()` (one Postgres read) and never the live cascade; a missing/cold key → `null` for that field, never a throw. Live fetches happen only in `/api/prefetch` (Cloud Scheduler, every 25 min).
- **Schema change is additive** (new `HomeStat` model only). Applied in prod by the repo's `prisma db push` init container; locally, `npx prisma generate` is the type gate (no DB connection needed — Prisma is mocked in tests).
- **Last-known-good:** in the warmer, `storeSet(key, value)` is called only on the success path of each step, so a failed upstream fetch leaves the prior durable value untouched.
- **Durable store key contract (key → value shape the warmer writes and `getStats` reads):**
  - `alkanes-btc-locked` `{ btcLocked:number, address:string }` (warmer writes more fields; getStats reads these two) · `brc20-btc-locked` `{ btcLocked:number, address:string }`
  - `alkanes-circulating` `{ circulatingBtc:number }` · `brc20-circulating` `{ circulatingBtc:number }`
  - `alkanes-total-unwraps` `{ totalUnwrapsBtc:number }` · `brc20-total-unwraps` `{ totalUnwrapsBtc:number }`
  - `btc-price` `{ btcPrice:number }` · `btc-height` `{ height:number }` · `metashrew-height` `{ height:number }` · `diesel-price` `{ usd:number }` · `fire-price` `{ usd:number }`
- **Data sources (verified live 2026-06-24):**
  - BTC/USD: existing subpricer `{RPC}/api/v1/bitcoin-price` (warmer already writes `btc-price`).
  - BTC height: `subfrostRpc<number|string>('esplora_blocks:tip:height', [])` → `Number`.
  - metashrew height: `subfrostRpc<number|string>('metashrew_height', [])` → `Number` (returned as a string).
  - DIESEL/FIRE USD: POST `https://api.alkanode.com/rpc` method `ammdata.get_candles`, params **object** `{ pool, timeframe:'10m', side:'base', limit:1, page:1 }`, pool `'2:0-usd'` (DIESEL) / `'2:77623-usd'` (FIRE); USD = `Number(result.candles[0].close) / 1e16`.
  - total-unwraps: `getVolumeStats('alkanes'|'brc20')` → `Number(stats.unwrap_volume_sats || '0') / 1e8` (same derivation as `app/api/*-total-unwraps/route.ts`).
- **Marquee = data only**, not the visual (Elon/coinyeezy). `/api/stats` exposes `dieselUsd`, `fireUsd`, `btcUsd`; a BTC-denominated ratio is derivable client-side.
- **Out of scope:** the marquee visual, removing the per-metric routes or their Redis keys, the home editorial rebuild (Elon's #96), surfacing `updatedAt` (the `HomeStat.updatedAt` column exists for future staleness display; `getStats` does not surface it — YAGNI).
- **Env:** Windows + Git Bash. `pnpm`. zod v3.
- **Each commit ends with:** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.

---

## File map

- `prisma/schema.prisma` (modify) — add the `HomeStat` model.
- `lib/stats-store.ts` (new) — `storeSet(key, value)` (upsert) + `storeGetAll()` (one findMany).
- `lib/stats.ts` (new) — `HomeStats` type + `getStats()` (assembles from the store).
- `app/api/stats/route.ts` (new) — `GET` → `getStats()`.
- `lib/rpc-client.ts` (modify) — `getBtcHeight()`, `getMetashrewHeight()`.
- `lib/espo-price.ts` (new) — `getEspoUsdPrice(pool)` via alkanode `ammdata.get_candles`.
- `app/api/prefetch/route.ts` (modify) — also `storeSet` the durable rows; warm `btc-height`, `metashrew-height`, `diesel-price`, `fire-price`, `*-total-unwraps`.
- `app/page.tsx` (modify → server shell) + `components/HomeClient.tsx` (new, extracted body).
- `components/MetricsBoxes.tsx` (modify) — 7 SWR → 1 `/api/stats` + loading-correctness (cards kept).
- Tests: `tests/lib/stats-store.test.ts`, `tests/lib/stats.test.ts`, `tests/api/stats.test.ts`, `tests/lib/rpc-heights.test.ts`, `tests/lib/espo-price.test.ts`, `tests/cms/metrics-boxes.test.tsx` (all new).

---

## Task 1: `HomeStat` model + `lib/stats-store.ts` (the durable store)

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/stats-store.ts`
- Test: `tests/lib/stats-store.test.ts`

**Interfaces:**
- Produces: `storeSet(key: string, value: unknown): Promise<void>`; `storeGetAll(): Promise<Record<string, unknown>>`.

- [ ] **Step 1: Add the Prisma model**

In `prisma/schema.prisma`, after the existing `SUBFROST METRICS MODELS` block (e.g. after `FrbtcSupplySnapshot`), add:

```prisma
// Durable last-known-good store for the home stat set. One row per stat key;
// latest value only. Written by /api/prefetch (only on a successful fetch) and
// read at SSR + /api/stats so the home always paints with data, even cold.
model HomeStat {
  key       String   @id
  value     Json
  updatedAt DateTime @updatedAt
}
```

- [ ] **Step 2: Generate the client (type gate)**

Run: `npx prisma generate`
Expected: completes; `prisma.homeStat` is now typed. (No DB connection needed.)

- [ ] **Step 3: Write the failing test**

Create `tests/lib/stats-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/prisma', () => {
  const homeStat = { upsert: vi.fn(), findMany: vi.fn() }
  const client = { homeStat }
  return { prisma: client, default: client }
})

import prisma from '@/lib/prisma'
import { storeSet, storeGetAll } from '@/lib/stats-store'

const hs = (prisma as unknown as { homeStat: Record<string, ReturnType<typeof vi.fn>> }).homeStat

beforeEach(() => {
  hs.upsert.mockReset()
  hs.findMany.mockReset()
})

describe('stats-store', () => {
  it('storeSet upserts the key with the value on both create and update', async () => {
    await storeSet('btc-height', { height: 955109 })
    expect(hs.upsert).toHaveBeenCalledWith({
      where: { key: 'btc-height' },
      create: { key: 'btc-height', value: { height: 955109 } },
      update: { value: { height: 955109 } },
    })
  })

  it('storeGetAll returns a key→value map from the rows', async () => {
    hs.findMany.mockResolvedValueOnce([
      { key: 'btc-price', value: { btcPrice: 62000 }, updatedAt: new Date() },
      { key: 'btc-height', value: { height: 955109 }, updatedAt: new Date() },
    ])
    const all = await storeGetAll()
    expect(all['btc-price']).toEqual({ btcPrice: 62000 })
    expect(all['btc-height']).toEqual({ height: 955109 })
  })
})
```

- [ ] **Step 4: Run it to verify it fails**

Run: `CI=true npx vitest run tests/lib/stats-store.test.ts`
Expected: FAIL — module `@/lib/stats-store` not found.

- [ ] **Step 5: Implement `lib/stats-store.ts`**

```ts
/**
 * Durable last-known-good store for the home stat set (Postgres `HomeStat`).
 * One row per stat key. `storeSet` is called by the warmer only after a
 * successful fetch, so a failed upstream leaves the prior value intact.
 * `storeGetAll` is read at SSR + /api/stats — one query, never the live cascade.
 */
import prisma from '@/lib/prisma'
import type { Prisma } from '@prisma/client'

export async function storeSet(key: string, value: unknown): Promise<void> {
  const json = value as Prisma.InputJsonValue
  await prisma.homeStat.upsert({
    where: { key },
    create: { key, value: json },
    update: { value: json },
  })
}

export async function storeGetAll(): Promise<Record<string, unknown>> {
  const rows = await prisma.homeStat.findMany()
  const out: Record<string, unknown> = {}
  for (const row of rows) out[row.key] = row.value
  return out
}
```

- [ ] **Step 6: Run it to verify it passes**

Run: `CI=true npx vitest run tests/lib/stats-store.test.ts`
Expected: PASS (both cases).

- [ ] **Step 7: Typecheck + commit**

Run: `npx tsc --noEmit` → 0.
```bash
git add prisma/schema.prisma lib/stats-store.ts tests/lib/stats-store.test.ts
git commit -m "feat(home): durable HomeStat store (storeSet/storeGetAll)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 2: `getStats()` + `HomeStats` (assemble from the store)

**Files:**
- Create: `lib/stats.ts`
- Test: `tests/lib/stats.test.ts`

**Interfaces:**
- Consumes: `storeGetAll` (Task 1).
- Produces: `HomeStats` (see below); `getStats(): Promise<HomeStats>`.

- [ ] **Step 1: Write the failing test**

Create `tests/lib/stats.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/stats-store', () => ({ storeGetAll: vi.fn() }))

import { getStats } from '@/lib/stats'
import { storeGetAll } from '@/lib/stats-store'

beforeEach(() => vi.clearAllMocks())

describe('getStats', () => {
  it('assembles metrics + marquee from the store rows', async () => {
    vi.mocked(storeGetAll).mockResolvedValueOnce({
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
    const s = await getStats()
    expect(s.metrics.alkanesBtcLocked).toBe(99.6)
    expect(s.metrics.alkanesBtcLockedAddress).toBe('bc1pA')
    expect(s.metrics.brc20TotalUnwraps).toBe(20.3)
    expect(s.metrics.btcPrice).toBe(62000)
    expect(s.marquee.btcUsd).toBe(62000)
    expect(s.marquee.btcHeight).toBe(955109)
    expect(s.marquee.metashrewHeight).toBe(955108)
    expect(s.marquee.dieselUsd).toBe(70.2)
    expect(s.marquee.fireUsd).toBe(55.2)
  })

  it('yields null for cold/missing or malformed values (never throws)', async () => {
    vi.mocked(storeGetAll).mockResolvedValueOnce({
      'alkanes-btc-locked': { btcLocked: 'oops' }, // malformed
    })
    const s = await getStats()
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
import { storeGetAll } from '@/lib/stats-store'

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

/** Assemble the full home stat set from the durable store. Reads the store only —
 *  never calls the live cascade. A cold/missing/malformed key yields null for that
 *  field; never throws. */
export async function getStats(): Promise<HomeStats> {
  const store = await storeGetAll()
  const at = (k: string): Record<string, unknown> | undefined =>
    (store[k] && typeof store[k] === 'object' ? (store[k] as Record<string, unknown>) : undefined)

  const alkanesLocked = at('alkanes-btc-locked')
  const brc20Locked = at('brc20-btc-locked')
  const alkanesCirc = at('alkanes-circulating')
  const brc20Circ = at('brc20-circulating')
  const alkanesUnwraps = at('alkanes-total-unwraps')
  const brc20Unwraps = at('brc20-total-unwraps')
  const price = at('btc-price')
  const btcHeight = at('btc-height')
  const msHeight = at('metashrew-height')
  const diesel = at('diesel-price')
  const fire = at('fire-price')

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
git commit -m "feat(home): getStats assembles the full stat set from the durable store

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 3: `GET /api/stats`

**Files:**
- Create: `app/api/stats/route.ts`
- Test: `tests/api/stats.test.ts`

**Interfaces:**
- Consumes: `getStats` (Task 2).

- [ ] **Step 1: Write the failing test**

Create `tests/api/stats.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from 'vitest'

vi.mock('@/lib/stats', () => ({ getStats: vi.fn() }))

import { GET } from '@/app/api/stats/route'
import { getStats } from '@/lib/stats'

beforeEach(() => vi.clearAllMocks())

describe('GET /api/stats', () => {
  it('returns the assembled stats payload', async () => {
    vi.mocked(getStats).mockResolvedValueOnce({
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
 * from the durable HomeStat store (kept warm by /api/prefetch). Store-only —
 * never calls the live cascade in the request path. This is what the home SSR
 * reads and what the client (MetricsBoxes + the marquee) fetches.
 */
import { NextResponse } from 'next/server'
import { getStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

export async function GET() {
  return NextResponse.json(await getStats())
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

## Task 4: BTC + metashrew height sources

**Files:**
- Modify: `lib/rpc-client.ts`
- Test: `tests/lib/rpc-heights.test.ts`

**Interfaces:**
- Produces: `getBtcHeight(): Promise<number>`, `getMetashrewHeight(): Promise<number>` (both use the file's existing private `subfrostRpc<T>(method, params, timeoutMs)` helper).

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

Add (e.g. after the existing Esplora helpers — `subfrostRpc` is already defined in this file):

```ts
/** Current Bitcoin tip height from the Subfrost RPC esplora index. */
export async function getBtcHeight(): Promise<number> {
  const result = await subfrostRpc<number | string>('esplora_blocks:tip:height', [], 10_000);
  return Number(result);
}

/** Current metashrew indexer height (returned as a string by the node). */
export async function getMetashrewHeight(): Promise<number> {
  const result = await subfrostRpc<number | string>('metashrew_height', [], 10_000);
  return Number(result);
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

## Task 5: ESPO USD price source (DIESEL/FIRE)

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

## Task 6: Warm Redis + the durable store in `/api/prefetch`

**Files:**
- Modify: `app/api/prefetch/route.ts`

**Interfaces:**
- Consumes: `storeSet` (Task 1); `getBtcHeight`, `getMetashrewHeight` (Task 4); `getEspoUsdPrice`, `DIESEL_POOL`, `FIRE_POOL` (Task 5); the existing `getVolumeStats`, `getAlkanesBtcLocked`, `getBrc20BtcLocked`, `getBrc20TotalSupply`, `fetchAlkanesCirculating`.

> No new unit test: the warmer is an orchestration of already-tested fns + `cacheSet`/`storeSet`, verified by `tsc` + `next build` + the live post-deploy `/api/prefetch` run. Match the existing `run(key, fn)` pattern exactly. Every durable write stays inside the step's `try` (the `run` wrapper) so a failed fetch writes neither Redis nor the store (last-known-good).

- [ ] **Step 1: Extend the imports**

In `app/api/prefetch/route.ts`, update the imports:

```ts
import { cacheSet } from '@/lib/redis';
import { storeSet } from '@/lib/stats-store';
import {
  getAlkanesBtcLocked,
  getBrc20BtcLocked,
  getBrc20TotalSupply,
  getBtcHeight,
  getMetashrewHeight,
} from '@/lib/rpc-client';
import { fetchAlkanesCirculating } from '@/lib/alkanes-circulating';
import { getVolumeStats, getVolumeCandles } from '@/lib/volume-data';
import { getEspoUsdPrice, DIESEL_POOL, FIRE_POOL } from '@/lib/espo-price';
```

- [ ] **Step 2: Mirror the 5 existing card keys into the durable store**

Replace the existing `run('alkanes-btc-locked', …)`, `run('brc20-btc-locked', …)`, `run('alkanes-circulating', …)`, `run('brc20-circulating', …)`, and `run('btc-price', …)` blocks with versions that also `storeSet` the shape `getStats` reads (compute the payload once, write both):

```ts
    run('alkanes-btc-locked', async () => {
      const data = await getAlkanesBtcLocked();
      await cacheSet('alkanes-btc-locked', {
        btcLocked: data.btcLocked,
        satoshis: data.satoshis.toString(),
        utxoCount: data.utxoCount,
        address: data.address,
        timestamp: Date.now(),
      }, CACHE_TTL);
      await storeSet('alkanes-btc-locked', { btcLocked: data.btcLocked, address: data.address });
    }),

    run('brc20-btc-locked', async () => {
      const data = await getBrc20BtcLocked();
      await cacheSet('brc20-btc-locked', {
        btcLocked: data.btcLocked,
        satoshis: data.satoshis,
        utxoCount: data.utxoCount,
        address: data.address,
        timestamp: Date.now(),
      }, CACHE_TTL);
      await storeSet('brc20-btc-locked', { btcLocked: data.btcLocked, address: data.address });
    }),

    run('alkanes-circulating', async () => {
      const result = await fetchAlkanesCirculating();
      await cacheSet('alkanes-circulating', result, CACHE_TTL);
      await storeSet('alkanes-circulating', { circulatingBtc: result.circulatingBtc });
    }),

    run('brc20-circulating', async () => {
      const data = await getBrc20TotalSupply();
      await cacheSet('brc20-circulating', {
        circulatingSatoshis: data.totalSupply.toString(),
        circulatingBtc: data.totalSupplyBtc,
        contractAddress: FRBTC_CONTRACT_ADDRESS,
        timestamp: Date.now(),
      }, CACHE_TTL);
      await storeSet('brc20-circulating', { circulatingBtc: data.totalSupplyBtc });
    }),

    run('btc-price', async () => {
      // Subfrost subpricer (Uniswap V3 WBTC/USDC) — see app/api/btc-price/route.ts
      const base = (process.env.ALKANES_RPC_URL || 'https://mainnet.subfrost.io/v4/subfrost').replace(/\/$/, '');
      const response = await fetch(`${base}/api/v1/bitcoin-price`, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`subpricer responded ${response.status}`);
      const data = await response.json();
      const usd = typeof data.usd === 'number' ? data.usd : Number(data?.bitcoin?.usd);
      if (!usd || !Number.isFinite(usd)) throw new Error('subpricer returned no usd price');
      await cacheSet('btc-price', { btcPrice: usd }, CACHE_TTL);
      await storeSet('btc-price', { btcPrice: usd });
    }),
```

> `fetchAlkanesCirculating()` returns `{ circulatingBtc: number, ... }` (verified in `lib/alkanes-circulating.ts`), so `result.circulatingBtc` is the value to store.

- [ ] **Step 3: Add the new durable-store steps**

Inside the same `await Promise.allSettled([ … ])` array, add these steps (the `*-total-unwraps` reuse `getVolumeStats`, which is memo-cached so this is cheap):

```ts
    run('alkanes-total-unwraps', async () => {
      const stats = await getVolumeStats('alkanes');
      await storeSet('alkanes-total-unwraps', { totalUnwrapsBtc: Number(stats.unwrap_volume_sats || '0') / 1e8 });
    }),

    run('brc20-total-unwraps', async () => {
      const stats = await getVolumeStats('brc20');
      await storeSet('brc20-total-unwraps', { totalUnwrapsBtc: Number(stats.unwrap_volume_sats || '0') / 1e8 });
    }),

    run('btc-height', async () => {
      const height = await getBtcHeight();
      await cacheSet('btc-height', { height }, CACHE_TTL);
      await storeSet('btc-height', { height });
    }),

    run('metashrew-height', async () => {
      const height = await getMetashrewHeight();
      await cacheSet('metashrew-height', { height }, CACHE_TTL);
      await storeSet('metashrew-height', { height });
    }),

    run('diesel-price', async () => {
      const usd = await getEspoUsdPrice(DIESEL_POOL);
      await cacheSet('diesel-price', { usd }, CACHE_TTL);
      await storeSet('diesel-price', { usd });
    }),

    run('fire-price', async () => {
      const usd = await getEspoUsdPrice(FIRE_POOL);
      await cacheSet('fire-price', { usd }, CACHE_TTL);
      await storeSet('fire-price', { usd });
    }),
```

- [ ] **Step 4: Typecheck + build**

Run: `npx tsc --noEmit` → 0, then `npx next build` → 0.

- [ ] **Step 5: Commit**

```bash
git add app/api/prefetch/route.ts
git commit -m "feat(home): warm the durable store (cards + heights + diesel/fire) on success

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 7: SSR-from-store — `app/page.tsx` server shell + `components/HomeClient.tsx`

**Files:**
- Create: `components/HomeClient.tsx`
- Modify: `app/page.tsx`

**Interfaces:**
- Consumes: `getStats` + `HomeStats` (Task 2).
- Produces: `HomeClient` accepts `{ initialStats: HomeStats }`; the home is wrapped in `<SWRConfig value={{ fallback: { '/api/stats': initialStats } }}>`.

> No new unit test: this is a server/client boundary refactor verified by `tsc` + `next build` + the live post-deploy `view-source` check (Task 8 adds the MetricsBoxes test that exercises the fallback). Moving the body is mechanical — the JSX is unchanged.

- [ ] **Step 1: Create `components/HomeClient.tsx` from the current page body**

Move the **entire current contents** of `app/page.tsx` into a new `components/HomeClient.tsx`, with three changes:
1. Keep the `"use client"` directive at the top.
2. Rename the default export function (currently `Page`/`Home`) to `HomeClient` and give it the prop:
   ```ts
   import type { HomeStats } from '@/lib/stats'
   export default function HomeClient({ initialStats }: { initialStats: HomeStats }) {
   ```
   (`initialStats` hydrates SWR via the `SWRConfig` wrapper in `page.tsx`; it is accepted here so the prop type flows even if the body does not read it directly yet.)
3. Leave every import and all JSX exactly as they were (the journal comment header may move with it or be dropped — does not matter).

- [ ] **Step 2: Replace `app/page.tsx` with the server shell**

Overwrite `app/page.tsx` with:

```tsx
import { SWRConfig } from 'swr'
import HomeClient from '@/components/HomeClient'
import { getStats } from '@/lib/stats'

export const dynamic = 'force-dynamic'

// Server shell: read the full stat set from the durable store at request time and
// hand it to the client tree as the SWR fallback for '/api/stats', so the home is
// server-rendered WITH data on first paint (no '...' flash, no slow first load),
// even cold (the store is durable — survives deploys/restarts).
export default async function Page() {
  const initialStats = await getStats()
  return (
    <SWRConfig value={{ fallback: { '/api/stats': initialStats } }}>
      <HomeClient initialStats={initialStats} />
    </SWRConfig>
  )
}
```

- [ ] **Step 3: Typecheck + build**

Run: `npx tsc --noEmit` → 0, then `npx next build` → 0.
Expected: the home route builds (now `ƒ`/dynamic). Benign Windows `EINVAL` copy warnings are fine.

- [ ] **Step 4: Run the full suite (no regressions)**

Run: `CI=true npx vitest run`
Expected: green (MetricsBoxes still uses its current per-metric SWR calls at this point — unchanged behavior).

- [ ] **Step 5: Commit**

```bash
git add app/page.tsx components/HomeClient.tsx
git commit -m "feat(home): SSR-from-store server shell + extract HomeClient

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

## Task 8: `MetricsBoxes` — 7 SWR fetches → 1 `/api/stats` + loading-correctness (cards kept)

**Files:**
- Modify: `components/MetricsBoxes.tsx`
- Test: `tests/cms/metrics-boxes.test.tsx`

**Interfaces:**
- Consumes: `/api/stats` (Task 3) + the SSR `fallback` (Task 7); `HomeStats` (Task 2).

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

Replace the data-fetching block — the `METRIC_ENDPOINTS` array, the `useMetric(...)` calls, the per-endpoint `useSWR(...)` calls, the `useSWRConfig`/`handleRefresh` mutate-7 plumbing, and the derived `combinedBtcLocked`/`combinedFrbtcSupply`/`lifetime*` computations — with a single `/api/stats` read. Keep `useState`, the UI pieces (`Popover*`, `Switch`, `Label`), `useTranslation`, `LoadingDots`, `formatBtcValue`, `formatUsd`, `shortenAddress`, and the entire JSX render structure. Remove the now-dead `useMetric` import and the `AnimatedCountUp` component (no longer used).

Change the import line `import useSWR, { useSWRConfig } from 'swr';` to keep both (still used for `mutate`):

```tsx
import useSWR, { useSWRConfig } from 'swr';
import type { HomeStats } from '@/lib/stats';
```

Remove `import { useMetric } from '@/hooks/use-metric';`.

Inside the component, replace the hooks + derivation section (from `const { mutate } = useSWRConfig();` down through the `combinedBtcLocked` computation) with:

```tsx
  const { mutate } = useSWRConfig();
  const { data: stats } = useSWR<HomeStats>('/api/stats', fetcher, { refreshInterval: 900000 });
  const m = stats?.metrics;

  const handleRefresh = async () => {
    setIsRefreshing(true);
    try { await mutate('/api/stats'); } finally { setIsRefreshing(false); }
  };

  const num = (v: number | null | undefined): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null);
  const sumOrNull = (...vals: (number | null)[]): number | null =>
    vals.every((v) => v !== null) ? (vals as number[]).reduce((a, b) => a + b, 0) : null;

  const combinedBtcLockedVal = sumOrNull(num(m?.alkanesBtcLocked), num(m?.brc20BtcLocked));
  const combinedFrbtcSupplyVal = sumOrNull(num(m?.alkanesCirculating), num(m?.brc20Circulating));
  const lifetimeVal = sumOrNull(
    num(m?.alkanesTotalUnwraps), num(m?.brc20TotalUnwraps),
    num(m?.alkanesCirculating), num(m?.brc20Circulating),
  );

  const combinedBtcLocked: number | React.ReactNode = combinedBtcLockedVal ?? <LoadingDots />;
  const combinedFrbtcSupply: number | React.ReactNode = combinedFrbtcSupplyVal ?? <LoadingDots />;
  const lifetimeLoading = lifetimeVal === null;
  const lifetimeBtcTxValue: number | React.ReactNode =
    lifetimeVal !== null ? formatBtcValue(lifetimeVal) : <LoadingDots />;

  const btcPrice = num(m?.btcPrice);
  const alkanesAddress = m?.alkanesBtcLockedAddress ?? '';
  const brc20Address = m?.brc20BtcLockedAddress ?? '';
```

Update the value-consumers that previously read separate variables:

- `getDisplayValue` (USD toggle): replace `btcPriceError || !btcPriceData` / `btcPriceData.btcPrice` with `btcPrice`:
  ```tsx
  const getDisplayValue = (btcValue: number | string | React.ReactNode): string | React.ReactNode => {
    if (typeof btcValue !== 'number') return btcValue;
    if (currency === 'USD') {
      if (btcPrice === null) return <LoadingDots />;
      return formatUsd(btcValue * btcPrice);
    }
    return btcValue >= 10 ? btcValue.toFixed(3) : btcValue.toFixed(4);
  };
  ```
- The Current frBTC Supply popover lines:
  ```tsx
  <p>Alkanes: {num(m?.alkanesCirculating) !== null ? (m!.alkanesCirculating as number).toFixed(5) : '...'} <a href="https://espo.sh/alkane/32:0" target="_blank" rel="noopener noreferrer" className="underline">frBTC</a></p>
  <p>BRC20: {num(m?.brc20Circulating) !== null ? (m!.brc20Circulating as number).toFixed(5) : '...'} <a href="https://explorer.brc20.build/token/0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337" target="_blank" rel="noopener noreferrer" className="underline">fr-BTC</a></p>
  ```
- The Total BTC Locked popover lines:
  ```tsx
  <p>Alkanes: {num(m?.alkanesBtcLocked) !== null ? (m!.alkanesBtcLocked as number).toFixed(5) : '...'} {alkanesAddress && <a href={`https://mempool.space/address/${alkanesAddress}`} target="_blank" rel="noopener noreferrer" className="underline">{shortenAddress(alkanesAddress)}</a>}</p>
  <p>BRC20: {num(m?.brc20BtcLocked) !== null ? (m!.brc20BtcLocked as number).toFixed(5) : '...'} {brc20Address && <a href={`https://mempool.space/address/${brc20Address}`} target="_blank" rel="noopener noreferrer" className="underline">{shortenAddress(brc20Address)}</a>}</p>
  ```
- The Lifetime Tx Value popover lines:
  ```tsx
  <p>Alkanes: {num(m?.alkanesTotalUnwraps) !== null && num(m?.alkanesCirculating) !== null ? ((m!.alkanesTotalUnwraps as number) + (m!.alkanesCirculating as number)).toFixed(5) : '...'} <a href="https://espo.sh/alkane/32:0" target="_blank" rel="noopener noreferrer" className="underline">frBTC</a></p>
  <p>BRC20: {num(m?.brc20TotalUnwraps) !== null && num(m?.brc20Circulating) !== null ? ((m!.brc20TotalUnwraps as number) + (m!.brc20Circulating as number)).toFixed(5) : '...'} <a href="https://explorer.brc20.build/token/0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337" target="_blank" rel="noopener noreferrer" className="underline">fr-BTC</a></p>
  ```
- The BTC-price label under the toggle:
  ```tsx
  {t('metrics.btcPrice')}: {btcPrice !== null ? `$${Math.round(btcPrice).toLocaleString('en-US')}` : '...'}
  ```

Leave the entire JSX render structure (3 metric cards, toggle, refresh button) intact except for these value bindings.

- [ ] **Step 4: Run it to verify it passes**

Run: `CI=true npx vitest run tests/cms/metrics-boxes.test.tsx`
Expected: PASS (combined 100.600, lifetime 194.650, no partial sum when an input is null).

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
Expected: tsc 0 · vitest green (incl. new `stats-store`, `stats`, `api/stats`, `rpc-heights`, `espo-price`, `metrics-boxes` suites) · build 0.

- [ ] **Open the PR** (do NOT merge or bump `newTag` without Vitor's go):

```bash
git push -u origin feat/home-stats-data-layer
gh pr create --title "Home stats data layer: durable store + SSR + unified /api/stats (+marquee data)" --body "$(cat <<'EOF'
Builds the data layer behind the subfrost.io home (the marquee visual is Elon's separate PR, #96, which will consume /api/stats).

- **Durable store** — a new `HomeStat` Postgres table is the last-known-good source. `/api/prefetch` writes it (and the legacy Redis keys) only on a successful fetch, so a transient upstream outage never blanks the home.
- **`/api/stats`** — one store-backed call returns the full stat set (metrics + marquee). Store-only in the request path — never the live cascade.
- **SSR-from-store** — `app/page.tsx` is now a server shell that reads the store and hydrates the client tree via SWR `fallback`, so the home paints WITH data on first paint, even cold (post-deploy/restart).
- **`MetricsBoxes`** (3 cards kept) — 7 client fetches → 1 (`/api/stats`); the "Lifetime Tx Value" is computed only from a complete set (kills the "wrong number then refresh" flicker).
- **Marquee data points** — BTC/USD, BTC height (`esplora_blocks:tip:height`), metashrew height (`metashrew_height`), DIESEL & FIRE USD (ESPO `ammdata.get_candles`), all warmed by `/api/prefetch`.

Additive schema (`HomeStat` only), applied by the `prisma db push` init container. Gates: tsc 0 · vitest green · build 0.

🤖 Generated with [Claude Code](https://claude.com/claude-code)
EOF
)"
```

## Live verification (post-merge + deploy)
1. After deploy, run `/api/prefetch` once (or wait for the scheduler) to populate the durable rows, then `curl https://subfrost.io/api/stats` → one JSON with `metrics` + `marquee` (heights + diesel/fire USD present), fast (~0.5s, single DB read).
2. `curl -s https://subfrost.io/ | grep -o '100\.[0-9]*'` (or view-source) → the BTC-locked value appears in the **SSR HTML** (data on first paint, not `'...'`).
3. Watch the "Lifetime Tx Value" — it no longer flickers to a lower number then corrects.
4. Restart a pod (or just after a deploy) and load the home cold → the cards still paint with data immediately (durable store, not a cold cache).
