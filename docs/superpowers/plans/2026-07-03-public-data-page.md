# subfrost.io/data — Public Data Page Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Public, bilingual (EN/ZH) protocol-metrics page at `/data` with history charts and a branded shareable card per metric.

**Architecture:** A new lib module (`lib/marketing/public-data.ts`) assembles a public payload from the existing DAILY `MarketingSnapshot` series (via `listDailySnapshots` + `buildProtocolSeries`) plus live values from `lib/stats`. Consumed three ways: SSR page `app/data/page.tsx` (reads lib directly), cached public JSON at `app/api/data`, and per-metric `next/og` share cards at `app/data/card/[metric]`. Shared OG asset loading is extracted to `lib/og-assets.ts` and reused by the existing admin card renderer and articles OG.

**Tech Stack:** Next.js App Router (RSC), Prisma (read-only here), recharts (client), next/og ImageResponse (nodejs runtime), vitest + happy-dom, Tailwind.

**Spec:** `docs/superpowers/specs/2026-07-03-public-data-page-design.md` (committed alongside this plan).

## Global Constraints

- **NO OP_RETURN / decoder data anywhere public.** Only snapshot metrics: BTC locked, frBTC supply, DIESEL holders/price/market cap, FIRE price, BTC/DIESEL, BTC/FIRE.
- Only data already public on the home page may be exposed; never auth-gated fields. (No user data, no admin fields.)
- `/api/data` cache: `Cache-Control: public, max-age=300, stale-while-revalidate=600`. DB down → **503** (API) — the page itself must still render (values fall back to nulls → "—").
- Share cards: **1200×675**, dark theme `bg #0b1220`, ink `#ffffff`, muted `#aab8d6`, accent `#5dcaa5`, font Geist 500 via `fs.readFile` (NOT fetch), logomark from `public/brand/subfrost/Logos/svg/logomark/logomark.svg`. A card must NEVER 500: unknown metric → 404, missing data → render "—".
- Locale = query string `?lang=zh` (site convention; middleware redirects, never path prefix). Copy objects local to the page (`satisfies Record<Locale, …>`), mirroring `app/page.tsx`.
- With fewer than **7** series points: hide charts, show current values + "History building since {date}".
- Work ONLY in this worktree (`C:\Alkanes Geral Dev\wt-public-data-page`), branch `feat/public-data-page`, PR — never push to main. Package manager: **pnpm**. Tests: `pnpm vitest run <path>`.
- Pre-existing failures that are NOT ours: `tests/cms/admin-nav.test.ts` (3) and `tests/cms/admin-landing.test.ts` (1). Everything else must pass.

---

### Task 1: Public data payload — `lib/marketing/public-data.ts`

**Files:**
- Create: `lib/marketing/public-data.ts`
- Test: `tests/marketing/public-data.test.ts`

**Interfaces:**
- Consumes: `listDailySnapshots(): Promise<SnapshotRow[]>` from `@/lib/marketing/snapshot-store`; `buildProtocolSeries(rows: SnapshotRow[]): SeriesPoint[]` and `type SeriesPoint` from `@/lib/marketing/protocol-series`; `getStats()` + `normalizeHomeStats()` from `@/lib/stats` (flattened fields used: `totalBtcLocked`, `currentFrbtcSupply`, `dieselUsd`, `fireUsd`, `btcDieselPrice`, `btcFirePrice`).
- Produces (used by Tasks 2, 4, 5):
  - `type PublicMetricKey = "btc-locked" | "frbtc-supply" | "diesel-holders" | "diesel-price" | "diesel-marketcap" | "fire-price" | "btc-diesel" | "btc-fire"`
  - `interface PublicDataPayload { updatedAt: string | null; seriesDays: number; now: Record<PublicMetricKey, number | null>; deltas7d: Record<PublicMetricKey, number | null>; series: SeriesPoint[] }`
  - `async function getPublicData(): Promise<PublicDataPayload>`
  - `const CARD_METRICS: Record<PublicMetricKey, { label: string; kind: "btc" | "usd" | "int" | "ratio"; seriesField: keyof SeriesPoint }>`
  - `function isPublicMetricKey(v: string): v is PublicMetricKey`
  - `function formatMetricValue(key: PublicMetricKey, value: number | null): string`

- [ ] **Step 1: Write the failing test**

Create `tests/marketing/public-data.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

const snapshotStore = vi.hoisted(() => ({ listDailySnapshots: vi.fn() }))
vi.mock("@/lib/marketing/snapshot-store", () => snapshotStore)

const stats = vi.hoisted(() => ({
  getStats: vi.fn(),
  normalizeHomeStats: (v: unknown) => v, // pass-through; real one only fills nulls
}))
vi.mock("@/lib/stats", () => stats)

import { getPublicData, isPublicMetricKey, formatMetricValue, CARD_METRICS } from "@/lib/marketing/public-data"

function row(dayOffset: number, over: Partial<{ holders: number; priceUsd: number; btcLocked: number }> = {}) {
  const d = new Date(Date.UTC(2026, 5, 1 + dayOffset)) // 2026-06-01 + offset
  return {
    id: `s${dayOffset}`,
    createdAt: d,
    label: "daily",
    context: "DAILY",
    payload: {
      protocol: { totalBtcLocked: over.btcLocked ?? 90 + dayOffset, btcUsd: 60000 },
      tokens: {
        diesel: { holders: over.holders ?? 7000 + dayOffset, priceUsd: over.priceUsd ?? 50, marketcapUsd: 33000000 },
        fire: { priceUsd: 40 },
        frbtc: { supply: "9334766521" },
      },
      ratios: { btcDiesel: 1165.9, btcFire: 1420.3 },
    },
  }
}

beforeEach(() => {
  stats.getStats.mockResolvedValue({
    totalBtcLocked: 94.74, currentFrbtcSupply: 9334766521,
    dieselUsd: 50.13, fireUsd: 40.23, btcDieselPrice: 1165.9, btcFirePrice: 1420.3,
  })
})

describe("getPublicData", () => {
  it("assembles now-values from live stats and series from snapshots", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue(Array.from({ length: 10 }, (_, i) => row(i)))
    const p = await getPublicData()
    expect(p.seriesDays).toBe(10)
    expect(p.series[0].dieselHolders).toBe(7000)
    expect(p.now["btc-locked"]).toBe(94.74)
    expect(p.now["diesel-holders"]).toBe(7009) // holders come from latest snapshot, not live stats
    expect(p.updatedAt).toBe("2026-06-10T00:00:00.000Z")
  })

  it("computes 7d deltas from the series (latest vs >=7 days earlier)", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue(Array.from({ length: 10 }, (_, i) => row(i)))
    const p = await getPublicData()
    // holders: latest 7009 vs baseline 7002 (7 days earlier) => +0.1%
    expect(p.deltas7d["diesel-holders"]).toBeCloseTo(((7009 - 7002) / 7002) * 100, 5)
  })

  it("single point: series ok, deltas null", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue([row(0)])
    const p = await getPublicData()
    expect(p.seriesDays).toBe(1)
    expect(p.deltas7d["diesel-holders"]).toBeNull()
  })

  it("empty snapshots: nulls where live stats have no value, never throws", async () => {
    snapshotStore.listDailySnapshots.mockResolvedValue([])
    const p = await getPublicData()
    expect(p.seriesDays).toBe(0)
    expect(p.now["diesel-holders"]).toBeNull()
    expect(p.now["btc-locked"]).toBe(94.74)
    expect(p.updatedAt).toBeNull()
  })

  it("snapshot store throwing does not break the payload (falls back to live-only)", async () => {
    snapshotStore.listDailySnapshots.mockRejectedValue(new Error("db down"))
    const p = await getPublicData()
    expect(p.seriesDays).toBe(0)
    expect(p.now["btc-locked"]).toBe(94.74)
  })

  it("live stats throwing falls back to latest snapshot values", async () => {
    stats.getStats.mockRejectedValue(new Error("boom"))
    snapshotStore.listDailySnapshots.mockResolvedValue(Array.from({ length: 3 }, (_, i) => row(i)))
    const p = await getPublicData()
    expect(p.now["btc-locked"]).toBe(92) // 90 + 2 from latest snapshot
  })
})

describe("helpers", () => {
  it("isPublicMetricKey", () => {
    expect(isPublicMetricKey("btc-locked")).toBe(true)
    expect(isPublicMetricKey("nope")).toBe(false)
  })
  it("formatMetricValue by kind", () => {
    expect(formatMetricValue("diesel-holders", 7938)).toBe("7,938")
    expect(formatMetricValue("diesel-price", 50.13)).toBe("$50.13")
    expect(formatMetricValue("btc-locked", 94.74)).toBe("94.74 BTC")
    expect(formatMetricValue("btc-diesel", 1165.955)).toBe("1,165.96")
    expect(formatMetricValue("btc-locked", null)).toBe("—")
  })
  it("every metric maps to a real SeriesPoint field", () => {
    const fields = ["date","dieselHolders","dieselPrice","btcLocked","firePrice","frbtcSupply","dieselMarketcap","btcUsd","btcDiesel","btcFire"]
    for (const m of Object.values(CARD_METRICS)) expect(fields).toContain(m.seriesField)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/marketing/public-data.test.ts`
Expected: FAIL — `Cannot find module '@/lib/marketing/public-data'`

- [ ] **Step 3: Implement `lib/marketing/public-data.ts`**

```ts
import { listDailySnapshots } from "@/lib/marketing/snapshot-store"
import { buildProtocolSeries, type SeriesPoint } from "@/lib/marketing/protocol-series"
import { getStats, normalizeHomeStats } from "@/lib/stats"

// Public payload for /data, /api/data and /data/card/[metric].
// HARD RULE: snapshot metrics only — nothing OP_RETURN/decoder related here.

export type PublicMetricKey =
  | "btc-locked" | "frbtc-supply" | "diesel-holders" | "diesel-price"
  | "diesel-marketcap" | "fire-price" | "btc-diesel" | "btc-fire"

export interface PublicDataPayload {
  updatedAt: string | null
  seriesDays: number
  now: Record<PublicMetricKey, number | null>
  deltas7d: Record<PublicMetricKey, number | null>
  series: SeriesPoint[]
}

export const CARD_METRICS: Record<PublicMetricKey, { label: string; kind: "btc" | "usd" | "int" | "ratio"; seriesField: keyof SeriesPoint }> = {
  "btc-locked": { label: "BTC locked", kind: "btc", seriesField: "btcLocked" },
  "frbtc-supply": { label: "frBTC supply", kind: "int", seriesField: "frbtcSupply" },
  "diesel-holders": { label: "DIESEL holders", kind: "int", seriesField: "dieselHolders" },
  "diesel-price": { label: "DIESEL price", kind: "usd", seriesField: "dieselPrice" },
  "diesel-marketcap": { label: "DIESEL market cap", kind: "usd", seriesField: "dieselMarketcap" },
  "fire-price": { label: "FIRE price", kind: "usd", seriesField: "firePrice" },
  "btc-diesel": { label: "BTC/DIESEL", kind: "ratio", seriesField: "btcDiesel" },
  "btc-fire": { label: "BTC/FIRE", kind: "ratio", seriesField: "btcFire" },
}

export function isPublicMetricKey(v: string): v is PublicMetricKey {
  return Object.prototype.hasOwnProperty.call(CARD_METRICS, v)
}

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const two = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMetricValue(key: PublicMetricKey, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  switch (CARD_METRICS[key].kind) {
    case "int": return int.format(value)
    case "usd": return `$${two.format(value)}`
    case "btc": return `${two.format(value)} BTC`
    case "ratio": return two.format(value)
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

function delta7d(series: SeriesPoint[], field: keyof SeriesPoint): number | null {
  if (series.length < 2) return null
  const latest = series[series.length - 1]
  const latestT = Date.parse(latest.date)
  let baseline: SeriesPoint | null = null
  for (const p of series) {
    if (latestT - Date.parse(p.date) >= 7 * DAY_MS) baseline = p
    else break
  }
  if (!baseline) return null
  const a = baseline[field], b = latest[field]
  if (typeof a !== "number" || typeof b !== "number" || a === 0) return null
  return ((b - a) / a) * 100
}

export async function getPublicData(): Promise<PublicDataPayload> {
  let series: SeriesPoint[] = []
  let updatedAt: string | null = null
  try {
    const rows = await listDailySnapshots()
    series = buildProtocolSeries(rows)
    updatedAt = rows.length ? rows[rows.length - 1].createdAt.toISOString() : null
  } catch (e) {
    console.error("[public-data] snapshot series unavailable", e)
  }

  const last = series.length ? series[series.length - 1] : null
  let live: { totalBtcLocked?: number | null; currentFrbtcSupply?: number | null; dieselUsd?: number | null; fireUsd?: number | null; btcDieselPrice?: number | null; btcFirePrice?: number | null } = {}
  try {
    live = normalizeHomeStats(await getStats())
  } catch (e) {
    console.error("[public-data] live stats unavailable", e)
  }

  const pick = (liveVal: number | null | undefined, seriesField: keyof SeriesPoint): number | null => {
    if (typeof liveVal === "number" && Number.isFinite(liveVal)) return liveVal
    const v = last?.[seriesField]
    return typeof v === "number" && Number.isFinite(v) ? v : null
  }

  const now: Record<PublicMetricKey, number | null> = {
    "btc-locked": pick(live.totalBtcLocked, "btcLocked"),
    "frbtc-supply": pick(live.currentFrbtcSupply, "frbtcSupply"),
    "diesel-holders": pick(null, "dieselHolders"), // holders exist only in snapshots
    "diesel-price": pick(live.dieselUsd, "dieselPrice"),
    "diesel-marketcap": pick(null, "dieselMarketcap"),
    "fire-price": pick(live.fireUsd, "firePrice"),
    "btc-diesel": pick(live.btcDieselPrice, "btcDiesel"),
    "btc-fire": pick(live.btcFirePrice, "btcFire"),
  }

  const deltas7d = Object.fromEntries(
    (Object.keys(CARD_METRICS) as PublicMetricKey[]).map((k) => [k, delta7d(series, CARD_METRICS[k].seriesField)]),
  ) as Record<PublicMetricKey, number | null>

  return { updatedAt, seriesDays: series.length, now, deltas7d, series }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/marketing/public-data.test.ts`
Expected: PASS (all)

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/public-data.ts tests/marketing/public-data.test.ts
git commit -m "feat(data): public protocol-data payload assembler"
```

---

### Task 2: Public JSON API — `app/api/data/route.ts`

**Files:**
- Create: `app/api/data/route.ts`
- Test: `tests/api/data.test.ts`

**Interfaces:**
- Consumes: `getPublicData()` from Task 1.
- Produces: `GET /api/data` → 200 JSON `PublicDataPayload` with `Cache-Control: public, max-age=300, stale-while-revalidate=600`; 503 `{ error: "unavailable" }` if the assembler itself rejects (it normally contains errors internally — 503 is the outer safety net).

- [ ] **Step 1: Write the failing test**

Create `tests/api/data.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"

const mod = vi.hoisted(() => ({ getPublicData: vi.fn() }))
vi.mock("@/lib/marketing/public-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketing/public-data")>()
  return { ...actual, getPublicData: mod.getPublicData }
})

import { GET } from "@/app/api/data/route"

describe("GET /api/data", () => {
  it("returns payload with public cache headers", async () => {
    mod.getPublicData.mockResolvedValueOnce({ updatedAt: null, seriesDays: 0, now: {}, deltas7d: {}, series: [] })
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("Cache-Control")).toBe("public, max-age=300, stale-while-revalidate=600")
    const body = await res.json()
    expect(body.seriesDays).toBe(0)
  })

  it("returns 503 when the assembler rejects", async () => {
    mod.getPublicData.mockRejectedValueOnce(new Error("boom"))
    const res = await GET()
    expect(res.status).toBe(503)
    const body = await res.json()
    expect(body.error).toBe("unavailable")
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/api/data.test.ts`
Expected: FAIL — `Cannot find module '@/app/api/data/route'`

- [ ] **Step 3: Implement the route**

Create `app/api/data/route.ts`:

```ts
import { NextResponse } from "next/server"
import { getPublicData } from "@/lib/marketing/public-data"

export const dynamic = "force-dynamic"

const CACHE = "public, max-age=300, stale-while-revalidate=600"

export async function GET() {
  try {
    const payload = await getPublicData()
    return NextResponse.json(payload, { headers: { "Cache-Control": CACHE } })
  } catch (e) {
    console.error("[api/data] failed", e)
    return NextResponse.json({ error: "unavailable" }, { status: 503, headers: { "Cache-Control": "no-store" } })
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/api/data.test.ts`
Expected: PASS

- [ ] **Step 5: Commit**

```bash
git add app/api/data/route.ts tests/api/data.test.ts
git commit -m "feat(data): public cached /api/data endpoint"
```

---

### Task 3: Shared OG assets — `lib/og-assets.ts` (+ refactor two existing consumers)

**Files:**
- Create: `lib/og-assets.ts`
- Modify: `app/articles/opengraph-image.tsx` (replace its local `getLogomarkDataUrl`/`getGeistFont` with the lib)
- Modify: `app/admin/marketing/cards/render/route.tsx` (replace its local `assets()` loader with the lib)
- Test: `tests/lib/og-assets.test.ts`

**Interfaces:**
- Produces (used by Task 4 and both refactored files):
  - `async function loadOgLogomark(): Promise<string>` — data URL `data:image/svg+xml;base64,…`
  - `async function loadOgFont(): Promise<ArrayBuffer>` — Geist Medium (weight 500) bytes

- [ ] **Step 1: Write the failing test**

Create `tests/lib/og-assets.test.ts` (reads the real files — no mocks):

```ts
import { describe, it, expect } from "vitest"
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"

describe("og-assets", () => {
  it("loads the logomark as an svg data url", async () => {
    const url = await loadOgLogomark()
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true)
    expect(url.length).toBeGreaterThan(100)
  })
  it("loads the Geist Medium font bytes", async () => {
    const font = await loadOgFont()
    expect(font.byteLength).toBeGreaterThan(10_000)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/lib/og-assets.test.ts`
Expected: FAIL — `Cannot find module '@/lib/og-assets'`

- [ ] **Step 3: Implement `lib/og-assets.ts`** (extraction of the exact pattern used by `app/articles/opengraph-image.tsx` and `app/admin/marketing/cards/render/route.tsx`)

```ts
import { readFile } from "fs/promises"
import { join } from "path"

// Shared asset loaders for every ImageResponse producer (articles OG,
// admin stat-card renderer, public /data cards). fs.readFile, not fetch:
// these run on the nodejs runtime and must not depend on network/self-HTTP.

export async function loadOgLogomark(): Promise<string> {
  const svg = await readFile(join(process.cwd(), "public", "brand", "subfrost", "Logos", "svg", "logomark", "logomark.svg"))
  return `data:image/svg+xml;base64,${svg.toString("base64")}`
}

export async function loadOgFont(): Promise<ArrayBuffer> {
  const font = await readFile(join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans", "Geist-Medium.ttf"))
  return font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) as ArrayBuffer
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/lib/og-assets.test.ts`
Expected: PASS

- [ ] **Step 5: Refactor the two existing consumers (mechanical, no behavior change)**

In `app/articles/opengraph-image.tsx`: delete the local `getLogomarkDataUrl()` and `getGeistFont()` helpers and their `readFile`/`join` imports if now unused; replace call sites with `loadOgLogomark()` / `loadOgFont()` imported from `@/lib/og-assets`.

In `app/admin/marketing/cards/render/route.tsx`: replace the body of its `assets()` helper to delegate:

```ts
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"

async function assets() {
  const [logo, font] = await Promise.all([loadOgLogomark(), loadOgFont()])
  return { logo, font }
}
```

(Keep the `assets()` name so the rest of the route is untouched. Remove now-unused `readFile`/`join` imports.)

- [ ] **Step 6: Run the full related tests + typecheck**

Run: `pnpm vitest run tests/lib/og-assets.test.ts tests/marketing/ && npx tsc --noEmit`
Expected: PASS / 0 errors

- [ ] **Step 7: Commit**

```bash
git add lib/og-assets.ts tests/lib/og-assets.test.ts app/articles/opengraph-image.tsx app/admin/marketing/cards/render/route.tsx
git commit -m "refactor(og): shared logomark/Geist loaders in lib/og-assets"
```

---

### Task 4: Public share card — `app/data/card/[metric]/route.tsx`

**Files:**
- Create: `app/data/card/[metric]/route.tsx`
- Test: `tests/api/data-card.test.ts`

**Interfaces:**
- Consumes: `getPublicData`, `isPublicMetricKey`, `CARD_METRICS`, `formatMetricValue` (Task 1); `loadOgLogomark`, `loadOgFont` (Task 3).
- Produces: `GET /data/card/<metric>` → 200 `image/png` 1200×675 for the 8 valid keys; 404 otherwise. Values may be "—"; the route never 500s for missing data.

- [ ] **Step 1: Write the failing test**

Create `tests/api/data-card.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"

const mod = vi.hoisted(() => ({ getPublicData: vi.fn() }))
vi.mock("@/lib/marketing/public-data", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/marketing/public-data")>()
  return { ...actual, getPublicData: mod.getPublicData }
})

import { GET } from "@/app/data/card/[metric]/route"

const req = new Request("http://localhost/data/card/btc-locked")
const params = (metric: string) => ({ params: Promise.resolve({ metric }) })

describe("GET /data/card/[metric]", () => {
  it("404s for an unknown metric", async () => {
    const res = await GET(req, params("nope"))
    expect(res.status).toBe(404)
  })

  it("renders a png for a valid metric", async () => {
    mod.getPublicData.mockResolvedValueOnce({
      updatedAt: "2026-07-03T00:00:00.000Z", seriesDays: 10,
      now: { "btc-locked": 94.74 }, deltas7d: { "btc-locked": 1.2 }, series: [],
    })
    const res = await GET(req, params("btc-locked"))
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("image/png")
  })

  it("still renders (dash value) when data is missing", async () => {
    mod.getPublicData.mockResolvedValueOnce({ updatedAt: null, seriesDays: 0, now: {}, deltas7d: {}, series: [] })
    const res = await GET(req, params("btc-locked"))
    expect(res.status).toBe(200)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/api/data-card.test.ts`
Expected: FAIL — module not found

- [ ] **Step 3: Implement the route**

Create `app/data/card/[metric]/route.tsx`:

```tsx
import { ImageResponse } from "next/og"
import { getPublicData, isPublicMetricKey, CARD_METRICS, formatMetricValue, type PublicMetricKey } from "@/lib/marketing/public-data"
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const SIZE = { width: 1200, height: 675 }
const BG = "#0b1220"
const INK = "#ffffff"
const MUTED = "#aab8d6"
const ACCENT = "#5dcaa5"
const RED = "#f0997b"

const CACHE = "public, max-age=300, stale-while-revalidate=600"

export async function GET(_req: Request, ctx: { params: Promise<{ metric: string }> }) {
  const { metric } = await ctx.params
  if (!isPublicMetricKey(metric)) {
    return new Response("Not found", { status: 404 })
  }
  const key: PublicMetricKey = metric

  let value: number | null = null
  let deltaPct: number | null = null
  let asOf: string | null = null
  try {
    const data = await getPublicData()
    value = data.now[key] ?? null
    deltaPct = data.deltas7d[key] ?? null
    asOf = data.updatedAt
  } catch (e) {
    console.error("[data/card] payload failed, rendering dash", e)
  }

  const [logo, font] = await Promise.all([loadOgLogomark(), loadOgFont()])
  const { label } = CARD_METRICS[key]
  const deltaText = deltaPct === null ? null : `${deltaPct >= 0 ? "▲" : "▼"} ${Math.abs(deltaPct).toFixed(1)}% · 7d`
  const dateText = asOf ? asOf.slice(0, 10) : ""

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: BG, color: INK, fontFamily: "Geist", padding: 72 }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={56} height={56} />
          <div style={{ display: "flex", fontSize: 34, color: MUTED, letterSpacing: 2 }}>SUBFROST</div>
        </div>
        <div style={{ display: "flex", flexDirection: "column", gap: 10 }}>
          <div style={{ display: "flex", fontSize: 40, color: MUTED }}>{label}</div>
          <div style={{ display: "flex", fontSize: 132, fontWeight: 500, color: INK }}>{formatMetricValue(key, value)}</div>
          {deltaText ? (
            <div style={{ display: "flex", fontSize: 36, color: deltaPct !== null && deltaPct >= 0 ? ACCENT : RED }}>{deltaText}</div>
          ) : null}
        </div>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: MUTED }}>
          <div style={{ display: "flex" }}>subfrost.io/data</div>
          <div style={{ display: "flex" }}>{dateText}</div>
        </div>
      </div>
    ),
    { ...SIZE, headers: { "Cache-Control": CACHE }, fonts: [{ name: "Geist", data: font, style: "normal", weight: 500 }] },
  )
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/api/data-card.test.ts`
Expected: PASS. (If `ImageResponse` fails to render under happy-dom, re-run just that file with `// @vitest-environment node` as the first line of the test file — the route has no DOM dependency.)

- [ ] **Step 5: Commit**

```bash
git add app/data/card/ tests/api/data-card.test.ts
git commit -m "feat(data): public branded share card per metric (next/og)"
```

---

### Task 5: The `/data` page + middleware locale + sitemap

**Files:**
- Create: `app/data/page.tsx`
- Create: `components/data/DataPageClient.tsx`
- Modify: `middleware.ts:137-139` (add `/data` to `isEditorialLocalePath`)
- Modify: `app/sitemap.ts` (add `/data` + `?lang=zh` static entries, same `sitemapEntry` helper used by the other static routes)
- Test: manual render checks in Step 6 (page is RSC; repo convention does not unit-test pages)

**Interfaces:**
- Consumes: `getPublicData`, `CARD_METRICS`, `formatMetricValue`, `type PublicMetricKey` (Task 1); `EditorialShell` from `@/components/articles/EditorialShell`; `absoluteUrl` from `@/lib/seo`; recharts.
- Produces: public page at `/data` (EN default, `?lang=zh`), hero (BTC locked + frBTC supply) + 6-card grid, share buttons pointing at `/data/card/<metric>`, tweet intent links.

- [ ] **Step 1: Add `/data` to the locale middleware**

In `middleware.ts`, change:

```ts
function isEditorialLocalePath(pathname: string) {
  return pathname === "/" || pathname === "/articles" || pathname.startsWith("/articles/") || pathname.startsWith("/authors/")
}
```

to:

```ts
function isEditorialLocalePath(pathname: string) {
  return pathname === "/" || pathname === "/data" || pathname === "/articles" || pathname.startsWith("/articles/") || pathname.startsWith("/authors/")
}
```

- [ ] **Step 2: Create the client component `components/data/DataPageClient.tsx`**

Charts + share actions are client-side; data arrives as props from the RSC (same pattern as `components/cms/marketing/ProtocolAnalyticsClient.tsx` — open it and mirror its chart styling where convenient; the code below is complete and works standalone).

```tsx
"use client"

import { useMemo, useState } from "react"
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"
import { CARD_METRICS, formatMetricValue, type PublicMetricKey } from "@/lib/marketing/public-data"

export interface DataCardCopy {
  share: string
  copied: string
  post: string
  sevenDays: string
}

export function MetricCard({
  metric, value, deltaPct, series, showChart, copy, locale,
}: {
  metric: PublicMetricKey
  value: number | null
  deltaPct: number | null
  series: SeriesPoint[]
  showChart: boolean
  copy: DataCardCopy
  locale: "en" | "zh"
}) {
  const [copied, setCopied] = useState(false)
  const { label, seriesField } = CARD_METRICS[metric]

  const points = useMemo(
    () => series.map((p) => ({ date: p.date, v: p[seriesField] as number | null })).filter((p) => p.v !== null),
    [series, seriesField],
  )

  const cardUrl = `https://subfrost.io/data/card/${metric}`
  const pageUrl = `https://subfrost.io/data${locale === "zh" ? "?lang=zh" : ""}`
  const tweet = `https://twitter.com/intent/tweet?text=${encodeURIComponent(`${label}: ${formatMetricValue(metric, value)} @subfrost_news`)}&url=${encodeURIComponent(pageUrl)}`

  async function copyCard() {
    try {
      await navigator.clipboard.writeText(cardUrl)
      setCopied(true)
      setTimeout(() => setCopied(false), 1600)
    } catch { /* clipboard denied: no-op */ }
  }

  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-6" style={{ borderColor: "var(--ed-hairline, #22304a)", background: "var(--ed-card, transparent)" }}>
      <div className="text-sm" style={{ color: "var(--ed-muted)" }}>{label}</div>
      <div className="text-3xl font-medium" style={{ color: "var(--ed-ink)" }}>{formatMetricValue(metric, value)}</div>
      {deltaPct !== null ? (
        <div className="text-sm" style={{ color: deltaPct >= 0 ? "#3aa981" : "#c2633f" }}>
          {deltaPct >= 0 ? "▲" : "▼"} {Math.abs(deltaPct).toFixed(1)}% · {copy.sevenDays}
        </div>
      ) : null}
      {showChart && points.length >= 2 ? (
        <div className="h-[160px] w-full">
          <ResponsiveContainer width="100%" height="100%">
            <LineChart data={points} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
              <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
              <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={32} />
              <YAxis tick={{ fontSize: 11 }} width={64} domain={["auto", "auto"]} />
              <Tooltip formatter={(v: number) => formatMetricValue(metric, v)} labelStyle={{ color: "#334" }} />
              <Line type="monotone" dataKey="v" stroke="#5dcaa5" strokeWidth={2} dot={false} isAnimationActive={false} />
            </LineChart>
          </ResponsiveContainer>
        </div>
      ) : null}
      <div className="mt-auto flex gap-3 text-sm">
        <button type="button" onClick={copyCard} className="rounded-full border px-4 py-1.5" style={{ borderColor: "var(--ed-hairline, #22304a)", color: "var(--ed-ink)" }}>
          {copied ? copy.copied : copy.share}
        </button>
        <a href={tweet} target="_blank" rel="noopener noreferrer" className="rounded-full border px-4 py-1.5" style={{ borderColor: "var(--ed-hairline, #22304a)", color: "var(--ed-ink)" }}>
          {copy.post}
        </a>
      </div>
    </div>
  )
}
```

- [ ] **Step 3: Create the page `app/data/page.tsx`**

```tsx
import type { Metadata } from "next"
import { EditorialShell } from "@/components/articles/EditorialShell"
import { MetricCard } from "@/components/data/DataPageClient"
import { getPublicData, formatMetricValue, type PublicMetricKey } from "@/lib/marketing/public-data"
import { absoluteUrl } from "@/lib/seo"

export const dynamic = "force-dynamic"

type Locale = "en" | "zh"

const copy = {
  en: {
    title: "SUBFROST protocol data",
    subtitle: "Live metrics of the SUBFROST protocol on Bitcoin — updated daily, straight from the chain.",
    heroLabel: "BTC locked",
    heroSub: "frBTC supply",
    building: "History building since",
    updated: "Last updated",
    card: { share: "Copy card link", copied: "Copied!", post: "Post on X", sevenDays: "7d" },
  },
  zh: {
    title: "SUBFROST 协议数据",
    subtitle: "SUBFROST 比特币协议的实时指标——每日更新，直接来自链上。",
    heroLabel: "锁定的 BTC",
    heroSub: "frBTC 供应量",
    building: "历史数据积累开始于",
    updated: "最近更新",
    card: { share: "复制卡片链接", copied: "已复制!", post: "发布到 X", sevenDays: "7天" },
  },
} // one copy object per locale; keep both shapes identical (inference gives full typing)

const GRID: PublicMetricKey[] = ["diesel-holders", "diesel-price", "diesel-marketcap", "fire-price", "btc-diesel", "btc-fire"]

export async function generateMetadata({ searchParams }: { searchParams?: Promise<{ lang?: string }> }): Promise<Metadata> {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  return {
    title: `${c.title} — subfrost.io/data`,
    description: c.subtitle,
    alternates: {
      canonical: absoluteUrl("/data"),
      languages: { en: absoluteUrl("/data"), zh: absoluteUrl("/data?lang=zh"), "x-default": absoluteUrl("/data") },
    },
    openGraph: {
      title: c.title,
      description: c.subtitle,
      images: [{ url: absoluteUrl("/data/card/btc-locked"), width: 1200, height: 675 }],
    },
    twitter: { card: "summary_large_image" },
  }
}

export default async function DataPage({ searchParams }: { searchParams?: Promise<{ lang?: string }> }) {
  const params = searchParams ? await searchParams : {}
  const locale: Locale = params.lang === "zh" ? "zh" : "en"
  const c = copy[locale]
  const data = await getPublicData()
  const showCharts = data.seriesDays >= 7
  const firstDate = data.series.length ? data.series[0].date : null

  return (
    <EditorialShell>
      <main className="mx-auto w-full max-w-[1440px] px-6 pb-24 pt-16">
        <header className="flex flex-col gap-3">
          <h1 className="text-4xl font-medium" style={{ color: "var(--ed-ink)" }}>{c.title}</h1>
          <p className="max-w-2xl text-lg" style={{ color: "var(--ed-muted)" }}>{c.subtitle}</p>
        </header>

        <section className="mt-12 grid gap-6 md:grid-cols-2">
          <MetricCard metric="btc-locked" value={data.now["btc-locked"]} deltaPct={data.deltas7d["btc-locked"]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
          <MetricCard metric="frbtc-supply" value={data.now["frbtc-supply"]} deltaPct={data.deltas7d["frbtc-supply"]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
        </section>

        <section className="mt-6 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
          {GRID.map((m) => (
            <MetricCard key={m} metric={m} value={data.now[m]} deltaPct={data.deltas7d[m]} series={data.series} showChart={showCharts} copy={c.card} locale={locale} />
          ))}
        </section>

        <footer className="mt-12 text-sm" style={{ color: "var(--ed-muted)" }}>
          {!showCharts && firstDate ? <span>{c.building} {firstDate}. </span> : null}
          {data.updatedAt ? <span>{c.updated}: {data.updatedAt.slice(0, 10)}.</span> : null}
        </footer>
      </main>
    </EditorialShell>
  )
}
```

- [ ] **Step 4: Add sitemap entries**

In `app/sitemap.ts`, inside the `staticRoutes` array (next to the other public entries), add — using the same `sitemapEntry` helper and mirroring the exact option shape of the `/volume` entry that is already there:

```ts
sitemapEntry(absoluteUrl("/data"), { changeFrequency: "daily", priority: 0.8 }),
sitemapEntry(absoluteUrl("/data?lang=zh"), { changeFrequency: "daily", priority: 0.7 }),
```

(If `sitemapEntry` in this file takes different option keys, copy the exact shape used by its `/volume` line — the intent is: both locales, daily change frequency.)

- [ ] **Step 5: Typecheck + full test suite**

Run: `npx tsc --noEmit && pnpm vitest run`
Expected: tsc 0 errors; the only failures allowed are the 4 pre-existing ones in `tests/cms/admin-nav.test.ts` / `tests/cms/admin-landing.test.ts`.

- [ ] **Step 6: Build + manual render check**

Run: `rm -rf .next && pnpm next build 2>&1 | tail -30`
Expected: build succeeds; route list includes `/data`, `/api/data` and `/data/card/[metric]`.

Then: `pnpm next start -p 3100 &` and

```bash
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/data          # 200
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3100/data?lang=zh" # 200
curl -s http://localhost:3100/api/data | head -c 300                          # JSON payload
curl -s -o /dev/null -w "%{content_type} %{http_code}\n" http://localhost:3100/data/card/btc-locked  # image/png 200
curl -s -o /dev/null -w "%{http_code}\n" http://localhost:3100/data/card/nope # 404
```

(DB may be unreachable locally — the page must still return 200 with "—" values; that IS the resilience test.) Kill the server after.

- [ ] **Step 7: Commit**

```bash
git add app/data/page.tsx components/data/DataPageClient.tsx middleware.ts app/sitemap.ts
git commit -m "feat(data): public /data page with charts, share cards, locale + sitemap"
```

---

### Task 6: Gates, push, PR

- [ ] **Step 1: Final gates on the whole branch**

Run: `npx tsc --noEmit && pnpm vitest run && rm -rf .next && pnpm next build 2>&1 | tail -15`
Expected: tsc 0; vitest — only the 4 known pre-existing failures; build OK.

- [ ] **Step 2: Push branch (embedded token — plain `git push` hangs on this machine)**

```bash
TOKEN=$(gh auth token)
git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" feat/public-data-page
```

- [ ] **Step 3: Open the PR**

```bash
gh pr create --repo subfrost/subfrost.io --base main --head feat/public-data-page \
  --title "feat: public /data page — protocol metrics, charts and share cards" \
  --body "Implements docs/superpowers/specs/2026-07-03-public-data-page-design.md (plan: docs/superpowers/plans/2026-07-03-public-data-page.md).

- Public bilingual (EN/ZH via ?lang=) page at /data: hero BTC locked + frBTC supply, 6-metric grid, recharts history (hidden until the DAILY series has >=7 points), graceful dash fallbacks.
- GET /api/data: cached public JSON (max-age=300, swr=600), 503 on failure.
- GET /data/card/[metric]: branded 1200x675 next/og share card per metric, never 500s.
- lib/og-assets.ts: shared logomark/Geist loaders (articles OG + admin card renderer refactored to use it).
- middleware: /data added to locale-redirect paths; sitemap: /data (en/zh).

NO OP_RETURN/decoder data is exposed — snapshot metrics only, per spec.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Verify CI on the PR** — all green except the known-red `Test` job failures listed in Global Constraints (only those 4).
