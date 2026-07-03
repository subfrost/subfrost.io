# Protocol analytics tab Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a Protocol analytics tab to the `/admin` Marketing section that turns the existing on-demand protocol snapshot into a daily time-series and visualizes the protocol's growth (Layout A: 3 KPI heroes + trend chart + secondaries + history table).

**Architecture:** A new daily cron (Cloud Scheduler → a Bearer-protected route) calls the existing `captureSnapshot()` and stores a `MarketingSnapshot` row with `context: "DAILY"` (idempotent per UTC day). The new tab reads that series via a new query, runs it through pure helpers (`buildProtocolSeries`, `kpiDelta` — TDD'd, reusing the existing `diffSnapshots`), and renders it with recharts in the admin's dark style. No Prisma schema change — `context` is a free String column; only the TS union widens.

**Tech Stack:** Next.js 16 App Router (RSC + route handlers), Prisma, recharts 2.15.0 via the shadcn `@/components/ui/chart` wrapper, Tailwind (admin dark/zinc), Vitest (happy-dom), GCP Cloud Scheduler (configured in `deploy.yml`).

## Global Constraints

- **No Prisma schema/migration.** Reuse `MarketingSnapshot` as-is. `context` stays a free String; only `SnapshotContext` (TS union, `lib/marketing/types.ts`) widens with `"DAILY"`. Leave `SNAPSHOT_CONTEXTS` (manual-capture dropdown) unchanged — `"DAILY"` is system-generated.
- Reuse existing code: `captureSnapshot()` (`@/lib/marketing/snapshot`, never throws), `createSnapshot(input, payload, createdById)` + `SnapshotRow` (`@/lib/marketing/snapshot-store`), `diffSnapshots(before, after)` + `DiffRow` (`@/lib/marketing/diff`).
- `prisma` is the DEFAULT import: `import prisma from "@/lib/prisma"`. `@/` = repo root. Tests under `tests/marketing/`, run `pnpm exec vitest run <file>`.
- Page gating is INLINE (match `app/admin/marketing/snapshots/page.tsx` and the live Site-analytics/Schedule pages): `currentUser()` → `redirect("/admin/login")` if no user → `redirect("/admin")` if `!privileges.includes("marketing.view")`. New marketing pages do NOT add a `VIEW_GATES` entry in `registry.ts` (only the legacy `snapshots` route has one).
- The cron route mirrors `/api/prefetch`: `Authorization: Bearer <PREFETCH_SECRET>`; if the secret is unset (local dev) the route is unauthenticated. Reuse `PREFETCH_SECRET` — no new secret.
- The daily snapshot day-key is UTC. The Scheduler runs at `5 0 * * *` UTC (00:05, just after the 00:00 prefetch tick).
- Windows + pnpm; `next build` `EINVAL copyfile` warning is benign (build exits 0). If switching branches leaves stale `.next` route types, `rm -rf .next` before `tsc`.
- The full `pnpm test` has ~8 pre-existing offline live-RPC failures in `tests/integration/` — unrelated; never block on them.

---

### Task 1: `SnapshotContext` "DAILY" + daily store queries

**Files:**
- Modify: `lib/marketing/types.ts`
- Modify: `lib/marketing/snapshot-store.ts`
- Test: `tests/marketing/snapshot-store-daily.test.ts`

**Interfaces:**
- Produces: `listDailySnapshots(): Promise<SnapshotRow[]>` (rows with `context === "DAILY"`, ordered `createdAt asc`); `dailySnapshotExistsOn(day: Date): Promise<boolean>` (any DAILY row within the UTC day of `day`).
- Consumes: existing `SnapshotRow`, `INCLUDE`, `map`, `DbRow` in `snapshot-store.ts`.

- [ ] **Step 1: Write the failing test** — `tests/marketing/snapshot-store-daily.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { marketingSnapshot: { findMany: vi.fn(), findFirst: vi.fn() } },
}))

import { listDailySnapshots, dailySnapshotExistsOn } from "@/lib/marketing/snapshot-store"
import prisma from "@/lib/prisma"

beforeEach(() => vi.clearAllMocks())

const dbRow = (id: string, createdAt: string) => ({
  id, createdAt: new Date(createdAt), label: "Daily", context: "DAILY",
  refUrl: null, articleId: null, note: null, payload: {}, createdBy: null, article: null,
})

describe("listDailySnapshots", () => {
  it("queries DAILY rows ordered by createdAt asc and maps them", async () => {
    vi.mocked(prisma.marketingSnapshot.findMany).mockResolvedValueOnce([dbRow("s1", "2026-06-29T00:05:00Z")] as never)
    const rows = await listDailySnapshots()
    expect(prisma.marketingSnapshot.findMany).toHaveBeenCalledWith(
      expect.objectContaining({ where: { context: "DAILY" }, orderBy: { createdAt: "asc" } }),
    )
    expect(rows[0].id).toBe("s1")
    expect(rows[0].context).toBe("DAILY")
  })
})

describe("dailySnapshotExistsOn", () => {
  it("returns true when a DAILY row exists within the UTC day", async () => {
    vi.mocked(prisma.marketingSnapshot.findFirst).mockResolvedValueOnce({ id: "x" } as never)
    const got = await dailySnapshotExistsOn(new Date("2026-06-30T23:00:00Z"))
    expect(got).toBe(true)
    const arg = vi.mocked(prisma.marketingSnapshot.findFirst).mock.calls[0][0] as { where: { createdAt: { gte: Date; lt: Date } } }
    expect(arg.where.createdAt.gte.toISOString()).toBe("2026-06-30T00:00:00.000Z")
    expect(arg.where.createdAt.lt.toISOString()).toBe("2026-07-01T00:00:00.000Z")
  })
  it("returns false when none exists", async () => {
    vi.mocked(prisma.marketingSnapshot.findFirst).mockResolvedValueOnce(null as never)
    expect(await dailySnapshotExistsOn(new Date("2026-06-30T12:00:00Z"))).toBe(false)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/snapshot-store-daily.test.ts`
Expected: FAIL — `listDailySnapshots`/`dailySnapshotExistsOn` are not exported.

- [ ] **Step 3: Widen the union** — in `lib/marketing/types.ts`, change the `SnapshotContext` line (leave `SNAPSHOT_CONTEXTS` unchanged):

```ts
export type SnapshotContext = "GENERAL" | "X_POST" | "ARTICLE" | "DAILY"
```

- [ ] **Step 4: Implement the queries** — append to `lib/marketing/snapshot-store.ts` (after `deleteSnapshot`):

```ts
export async function listDailySnapshots(): Promise<SnapshotRow[]> {
  const rows = (await prisma.marketingSnapshot.findMany({
    where: { context: "DAILY" },
    orderBy: { createdAt: "asc" },
    include: INCLUDE,
  })) as DbRow[]
  return rows.map(map)
}

export async function dailySnapshotExistsOn(day: Date): Promise<boolean> {
  const gte = new Date(Date.UTC(day.getUTCFullYear(), day.getUTCMonth(), day.getUTCDate()))
  const lt = new Date(gte.getTime() + 24 * 60 * 60 * 1000)
  const row = await prisma.marketingSnapshot.findFirst({
    where: { context: "DAILY", createdAt: { gte, lt } },
    select: { id: true },
  })
  return row !== null
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/snapshot-store-daily.test.ts`
Expected: PASS (3 tests).

- [ ] **Step 6: Typecheck**

Run: `pnpm exec tsc --noEmit`
Expected: exits 0.

- [ ] **Step 7: Commit**

```bash
git add lib/marketing/types.ts lib/marketing/snapshot-store.ts tests/marketing/snapshot-store-daily.test.ts
git commit -m "feat(marketing): SnapshotContext DAILY + listDailySnapshots/dailySnapshotExistsOn"
```

---

### Task 2: Pure series + delta helpers

**Files:**
- Create: `lib/marketing/protocol-series.ts`
- Test: `tests/marketing/protocol-series.test.ts`

**Interfaces:**
- Produces: `SeriesPoint` (flat plottable shape, below); `buildProtocolSeries(rows: SnapshotRow[]): SeriesPoint[]`; `pickBaseline(rows: SnapshotRow[], days: number): SnapshotRow | null`; `kpiDelta(rows: SnapshotRow[], path: string, days: number): { deltaAbs: number | null; deltaPct: number | null }`.
- Consumes: `SnapshotRow` (`@/lib/marketing/snapshot-store`), `diffSnapshots` (`@/lib/marketing/diff`). Assumes `rows` are sorted `createdAt asc` (as `listDailySnapshots` returns them).

- [ ] **Step 1: Write the failing test** — `tests/marketing/protocol-series.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import type { SnapshotPayload } from "@/lib/marketing/types"
import { buildProtocolSeries, pickBaseline, kpiDelta } from "@/lib/marketing/protocol-series"

function payload(o: { holders?: number | null; price?: number | null; locked?: number | null }): SnapshotPayload {
  const tok = (over: Partial<SnapshotPayload["tokens"]["diesel"]> = {}) => ({
    id: "2:0", name: null, symbol: null, holders: null, priceUsd: null, supply: null,
    marketcapUsd: null, fdvUsd: null, volume24hUsd: null,
    priceChange24h: null, priceChange7d: null, priceChange30d: null, ...over,
  })
  return {
    capturedAt: "2026-06-30T00:05:00.000Z",
    protocol: { totalBtcLocked: o.locked ?? null, alkanesBtcLocked: null, brc20BtcLocked: null, btcUsd: 98000, btcHeight: null, metashrewHeight: null, source: "store" },
    tokens: { diesel: tok({ holders: o.holders ?? null, priceUsd: o.price ?? null, marketcapUsd: 36_000_000 }), fire: tok({ priceUsd: 0.9 }), frbtc: tok({ supply: "152" }) },
    ratios: { btcDiesel: 0.028, btcFire: 0.01 },
    partial: false,
  }
}
const row = (date: string, o: Parameters<typeof payload>[0]): SnapshotRow => ({
  id: date, createdAt: new Date(date), label: "Daily", context: "DAILY",
  refUrl: null, articleId: null, note: null, createdByName: null, articleSlug: null, payload: payload(o),
})

describe("buildProtocolSeries", () => {
  it("flattens rows to plottable points with a YYYY-MM-DD date, in order", () => {
    const out = buildProtocolSeries([
      row("2026-06-28T00:05:00Z", { holders: 12600, price: 2.6, locked: 144 }),
      row("2026-06-29T00:05:00Z", { holders: 12790, price: 2.71, locked: 147.9 }),
    ])
    expect(out.map((p) => p.date)).toEqual(["2026-06-28", "2026-06-29"])
    expect(out[1]).toMatchObject({ dieselHolders: 12790, dieselPrice: 2.71, btcLocked: 147.9, btcUsd: 98000 })
  })
  it("passes nulls through for missing fields (partial snapshot)", () => {
    const out = buildProtocolSeries([row("2026-06-29T00:05:00Z", { holders: null, price: null, locked: null })])
    expect(out[0]).toMatchObject({ dieselHolders: null, dieselPrice: null, btcLocked: null })
  })
})

describe("pickBaseline", () => {
  const rows = [
    row("2026-06-20T00:05:00Z", { holders: 12000 }),
    row("2026-06-23T00:05:00Z", { holders: 12300 }),
    row("2026-06-30T00:05:00Z", { holders: 12847 }),
  ]
  it("picks the nearest row on-or-before latest minus N days", () => {
    expect(pickBaseline(rows, 7)?.id).toBe("2026-06-23T00:05:00Z")
  })
  it("returns null when no row is old enough", () => {
    expect(pickBaseline(rows, 30)).toBeNull()
  })
  it("returns null for an empty series", () => {
    expect(pickBaseline([], 7)).toBeNull()
  })
})

describe("kpiDelta", () => {
  it("computes abs + pct delta of a diff path vs the baseline N days back", () => {
    const rows = [row("2026-06-23T00:05:00Z", { holders: 12300 }), row("2026-06-30T00:05:00Z", { holders: 12847 })]
    const d = kpiDelta(rows, "tokens.diesel.holders", 7)
    expect(d.deltaAbs).toBe(547)
    expect(d.deltaPct).toBeCloseTo(4.447, 2)
  })
  it("returns nulls when there is no baseline far enough back", () => {
    const rows = [row("2026-06-29T00:05:00Z", { holders: 12790 }), row("2026-06-30T00:05:00Z", { holders: 12847 })]
    expect(kpiDelta(rows, "tokens.diesel.holders", 7)).toEqual({ deltaAbs: null, deltaPct: null })
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm exec vitest run tests/marketing/protocol-series.test.ts`
Expected: FAIL — cannot find module `@/lib/marketing/protocol-series`.

- [ ] **Step 3: Implement** — `lib/marketing/protocol-series.ts`:

```ts
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import { diffSnapshots } from "@/lib/marketing/diff"

export interface SeriesPoint {
  date: string
  dieselHolders: number | null
  dieselPrice: number | null
  btcLocked: number | null
  firePrice: number | null
  frbtcSupply: number | null
  dieselMarketcap: number | null
  btcUsd: number | null
  btcDiesel: number | null
  btcFire: number | null
}

const fnum = (v: string | null): number | null => (v === null || v === "" ? null : Number(v))

export function buildProtocolSeries(rows: SnapshotRow[]): SeriesPoint[] {
  return rows.map((r) => {
    const p = r.payload
    return {
      date: r.createdAt.toISOString().slice(0, 10),
      dieselHolders: p.tokens.diesel.holders,
      dieselPrice: p.tokens.diesel.priceUsd,
      btcLocked: p.protocol.totalBtcLocked,
      firePrice: p.tokens.fire.priceUsd,
      frbtcSupply: fnum(p.tokens.frbtc.supply),
      dieselMarketcap: p.tokens.diesel.marketcapUsd,
      btcUsd: p.protocol.btcUsd,
      btcDiesel: p.ratios.btcDiesel,
      btcFire: p.ratios.btcFire,
    }
  })
}

export function pickBaseline(rows: SnapshotRow[], days: number): SnapshotRow | null {
  if (rows.length === 0) return null
  const cutoff = rows[rows.length - 1].createdAt.getTime() - days * 24 * 60 * 60 * 1000
  let chosen: SnapshotRow | null = null
  for (const r of rows) {
    if (r.createdAt.getTime() <= cutoff) chosen = r
    else break
  }
  return chosen
}

export function kpiDelta(
  rows: SnapshotRow[],
  path: string,
  days: number,
): { deltaAbs: number | null; deltaPct: number | null } {
  if (rows.length === 0) return { deltaAbs: null, deltaPct: null }
  const baseline = pickBaseline(rows, days)
  if (!baseline) return { deltaAbs: null, deltaPct: null }
  const latest = rows[rows.length - 1]
  const diff = diffSnapshots(baseline.payload, latest.payload).find((d) => d.path === path)
  return { deltaAbs: diff?.deltaAbs ?? null, deltaPct: diff?.deltaPct ?? null }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm exec vitest run tests/marketing/protocol-series.test.ts`
Expected: PASS (8 tests).

- [ ] **Step 5: Typecheck + commit**

```bash
pnpm exec tsc --noEmit
git add lib/marketing/protocol-series.ts tests/marketing/protocol-series.test.ts
git commit -m "feat(marketing): protocol-series helpers (buildProtocolSeries, pickBaseline, kpiDelta)"
```

---

### Task 3: Daily-capture cron route

**Files:**
- Create: `app/api/marketing/snapshot-cron/route.ts`

**Interfaces:**
- Consumes: `captureSnapshot` (`@/lib/marketing/snapshot`), `createSnapshot` + `dailySnapshotExistsOn` (`@/lib/marketing/snapshot-store`, Task 1).
- Produces: `GET /api/marketing/snapshot-cron` → `{ ok: true, id, partial }` on create, `{ ok: true, skipped: true }` if a DAILY row already exists today, `401` on bad auth.

> No unit test: this is a thin Next route handler. The repo has no route-handler tests (see `/api/prefetch`); the testable logic (idempotency, day-keying) lives in Task 1's `dailySnapshotExistsOn` and is already covered. This route is build-verified + manually smoked.

- [ ] **Step 1: Implement** — `app/api/marketing/snapshot-cron/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { captureSnapshot } from "@/lib/marketing/snapshot"
import { createSnapshot, dailySnapshotExistsOn } from "@/lib/marketing/snapshot-store"

export async function GET(request: NextRequest) {
  const secret = process.env.PREFETCH_SECRET
  if (secret) {
    const auth = request.headers.get("authorization")
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: "Unauthorized" }, { status: 401 })
    }
  }

  const now = new Date()
  if (await dailySnapshotExistsOn(now)) {
    return NextResponse.json({ ok: true, skipped: true })
  }

  const payload = await captureSnapshot()
  const row = await createSnapshot(
    { label: `Daily ${now.toISOString().slice(0, 10)}`, context: "DAILY", refUrl: null, articleId: null, note: null },
    payload,
    null,
  )
  return NextResponse.json({ ok: true, id: row.id, partial: payload.partial })
}
```

- [ ] **Step 2: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: tsc 0; build exits 0; the route list includes `/api/marketing/snapshot-cron`.

- [ ] **Step 3: Manual smoke (local `pnpm dev`)**

With `PREFETCH_SECRET` unset locally (route open): `curl -s localhost:3000/api/marketing/snapshot-cron` → `{ "ok": true, "id": "...", "partial": ... }`; run it again → `{ "ok": true, "skipped": true }`. (Capture this in the report.)

- [ ] **Step 4: Commit**

```bash
git add app/api/marketing/snapshot-cron/route.ts
git commit -m "feat(marketing): daily snapshot cron route (idempotent per UTC day)"
```

---

### Task 4: Protocol analytics tab (page + client + nav)

**Files:**
- Create: `app/admin/marketing/protocol/page.tsx`
- Create: `components/cms/marketing/ProtocolAnalyticsClient.tsx`
- Modify: `lib/cms/admin-nav.ts`

**Interfaces:**
- Consumes: `listDailySnapshots` (Task 1), `buildProtocolSeries` + `kpiDelta` + `SeriesPoint` (Task 2), `currentUser` (`@/lib/cms/authz`), recharts + `@/components/ui/chart` (pattern from `components/cms/marketing/AnalyticsClient.tsx`).
- Produces: the page at `/admin/marketing/protocol` and a "Protocol analytics" nav leaf.

- [ ] **Step 1: Create the page** — `app/admin/marketing/protocol/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listDailySnapshots } from "@/lib/marketing/snapshot-store"
import { buildProtocolSeries, kpiDelta } from "@/lib/marketing/protocol-series"
import { ProtocolAnalyticsClient } from "@/components/cms/marketing/ProtocolAnalyticsClient"

export const dynamic = "force-dynamic"

export default async function ProtocolAnalyticsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")

  const rows = await listDailySnapshots()
  const series = buildProtocolSeries(rows)
  const deltas = {
    dieselHolders: kpiDelta(rows, "tokens.diesel.holders", 7),
    dieselPrice: kpiDelta(rows, "tokens.diesel.priceUsd", 7),
    btcLocked: kpiDelta(rows, "protocol.totalBtcLocked", 7),
  }
  return <ProtocolAnalyticsClient series={series} deltas={deltas} />
}
```

- [ ] **Step 2: Create the client** — `components/cms/marketing/ProtocolAnalyticsClient.tsx`:

```tsx
"use client"

import { useState } from "react"
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"

type Delta = { deltaAbs: number | null; deltaPct: number | null }
type Deltas = { dieselHolders: Delta; dieselPrice: Delta; btcLocked: Delta }

const chartConfig: ChartConfig = {
  dieselHolders: { label: "DIESEL holders", color: "#38bdf8" },
  dieselPrice: { label: "DIESEL price", color: "#34d399" },
  btcLocked: { label: "BTC locked", color: "#fbbf24" },
  firePrice: { label: "FIRE price", color: "#f97316" },
  dieselMarketcap: { label: "DIESEL market cap", color: "#a78bfa" },
  btcUsd: { label: "BTC/USD", color: "#60a5fa" },
}
const METRICS = Object.keys(chartConfig) as (keyof typeof chartConfig)[]

const int = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"))
const usd = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`)
const btc = (n: number | null) => (n == null ? "—" : n.toFixed(2))
const pct = (d: Delta) => (d.deltaPct == null ? "—" : `${d.deltaPct >= 0 ? "+" : ""}${d.deltaPct.toFixed(1)}%`)
const tone = (d: Delta) => (d.deltaPct == null ? "text-zinc-500" : d.deltaPct >= 0 ? "text-emerald-400" : "text-red-400")

function Hero({ label, value, delta, metric, series }: { label: string; value: string; delta: Delta; metric: keyof typeof chartConfig; series: SeriesPoint[] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className={`text-sm ${tone(delta)}`}>{pct(delta)}</span>
      </div>
      <LineChart width={180} height={36} data={series} className="mt-2">
        <Line type="monotone" dataKey={metric} stroke={chartConfig[metric].color} dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </div>
  )
}

export function ProtocolAnalyticsClient({ series, deltas }: { series: SeriesPoint[]; deltas: Deltas }) {
  const [metric, setMetric] = useState<keyof typeof chartConfig>("dieselHolders")
  const last = series[series.length - 1]

  if (!last) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold text-white">Protocol analytics</h1>
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          No snapshots yet — the first daily capture runs at 00:05 UTC.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Protocol analytics</h1>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Hero label="DIESEL holders" value={int(last.dieselHolders)} delta={deltas.dieselHolders} metric="dieselHolders" series={series} />
        <Hero label="DIESEL price" value={usd(last.dieselPrice)} delta={deltas.dieselPrice} metric="dieselPrice" series={series} />
        <Hero label="BTC locked" value={btc(last.btcLocked)} delta={deltas.btcLocked} metric="btcLocked" series={series} />
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button key={m} onClick={() => setMetric(m)}
            className={`rounded-md px-3 py-1.5 text-sm ${metric === m ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
            {chartConfig[m].label}
          </button>
        ))}
      </div>

      <ChartContainer config={chartConfig} className="mb-6 h-[280px] w-full">
        <LineChart data={series}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={64} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey={metric} stroke={`var(--color-${metric})`} dot={false} strokeWidth={2} />
        </LineChart>
      </ChartContainer>

      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-800 pt-3 text-sm text-zinc-400">
        <div>FIRE price <span className="font-medium text-white">{usd(last.firePrice)}</span></div>
        <div>frBTC supply <span className="font-medium text-white">{int(last.frbtcSupply)}</span></div>
        <div>DIESEL market cap <span className="font-medium text-white">{usd(last.dieselMarketcap)}</span></div>
        <div>BTC/USD <span className="font-medium text-white">{usd(last.btcUsd)}</span></div>
        <div>BTC/DIESEL <span className="font-medium text-white">{last.btcDiesel ?? "—"}</span></div>
        <div>BTC/FIRE <span className="font-medium text-white">{last.btcFire ?? "—"}</span></div>
      </div>

      <section>
        <h2 className="mb-2 font-semibold text-white">History</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500"><tr><th className="py-1">Date</th><th>Holders</th><th>DIESEL $</th><th>BTC locked</th><th>Market cap</th></tr></thead>
          <tbody>
            {[...series].reverse().map((p) => (
              <tr key={p.date} className="border-t border-zinc-800 text-zinc-300">
                <td className="py-1">{p.date}</td><td>{int(p.dieselHolders)}</td><td>{usd(p.dieselPrice)}</td><td>{btc(p.btcLocked)}</td><td>{usd(p.dieselMarketcap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
```

> If `@/components/ui/chart` exports differ, open `components/cms/marketing/AnalyticsClient.tsx` — it imports the same names (`ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `ChartConfig`) and is the working reference.

- [ ] **Step 3: Add the nav leaf** — in `lib/cms/admin-nav.ts`, add `TrendingUp` to the `lucide-react` import line, then add the leaf to the `marketing` group's `items` right after "Protocol snapshots":

```ts
      { label: "Protocol analytics", href: "/admin/marketing/protocol", icon: TrendingUp, privilege: "marketing.view" },
```

- [ ] **Step 4: Typecheck + build**

Run: `pnpm exec tsc --noEmit && pnpm build`
Expected: tsc 0; build exits 0; the route list includes `/admin/marketing/protocol`.

- [ ] **Step 5: Commit**

```bash
git add app/admin/marketing/protocol/page.tsx components/cms/marketing/ProtocolAnalyticsClient.tsx lib/cms/admin-nav.ts
git commit -m "feat(marketing): protocol analytics tab (Layout A)"
```

---

### Task 5: Cloud Scheduler step (daily snapshot)

**Files:**
- Modify: `.github/workflows/deploy.yml`

**Interfaces:** none (CI/deploy config). Verified at deploy time.

- [ ] **Step 1: Add the step** — in `.github/workflows/deploy.yml`, right after the existing `Setup Prefetch Scheduler` step (ends with `echo "Prefetch scheduler job created/updated"`), add a sibling step (same indentation, same `env`/`if` pattern):

```yaml
      - name: Setup Daily Snapshot Scheduler
        if: ${{ env.PREFETCH_SECRET != '' }}
        # Non-fatal for the same reason as the prefetch scheduler (see above).
        continue-on-error: true
        run: |
          gcloud services enable cloudscheduler.googleapis.com --quiet

          if gcloud scheduler jobs describe subfrost-daily-snapshot --location=${{ env.REGION }} > /dev/null 2>&1; then
            gcloud scheduler jobs delete subfrost-daily-snapshot --location=${{ env.REGION }} --quiet
          fi

          SERVICE_URL=$(gcloud run services describe ${{ env.SERVICE_NAME }} \
            --region=${{ env.REGION }} \
            --format='value(status.url)')

          gcloud scheduler jobs create http subfrost-daily-snapshot \
            --location=${{ env.REGION }} \
            --schedule="5 0 * * *" \
            --uri="${SERVICE_URL}/api/marketing/snapshot-cron" \
            --http-method=GET \
            --headers="Authorization=Bearer ${{ secrets.PREFETCH_SECRET }}" \
            --time-zone="UTC" \
            --attempt-deadline="540s" \
            --description="Captures one protocol snapshot per day at 00:05 UTC"

          echo "Daily snapshot scheduler job created/updated"
```

- [ ] **Step 2: Validate YAML**

Run: `pnpm exec js-yaml .github/workflows/deploy.yml > /dev/null && echo OK` (or `python -c "import yaml,sys; yaml.safe_load(open('.github/workflows/deploy.yml')); print('OK')"`).
Expected: `OK` (the file parses).

- [ ] **Step 3: Commit**

```bash
git add .github/workflows/deploy.yml
git commit -m "ci(marketing): daily snapshot Cloud Scheduler job (00:05 UTC)"
```

---

### Task 6: Full gates + final review + PR + deploy

**Files:** none (verification + integration)

- [ ] **Step 1: Run the full gates**

Run: `pnpm exec tsc --noEmit && pnpm test && pnpm build`
Expected: tsc 0; vitest green except the ~8 pre-existing offline live-RPC `tests/integration` failures; build exits 0 with `/admin/marketing/protocol` and `/api/marketing/snapshot-cron` listed. (If `tsc` reports phantom errors from a stale `.next`, `rm -rf .next` and re-run.)

- [ ] **Step 2: Manual smoke (local `pnpm dev`)** as a `marketing.view` user:
- `curl localhost:3000/api/marketing/snapshot-cron` once → creates a DAILY row; again → `{ skipped: true }`.
- Open `/admin/marketing/protocol` → "Protocol analytics" appears in the Marketing nav; with ≥1 snapshot the heroes + chart + history render; the metric selector switches the line; with 0 snapshots the empty state shows.

- [ ] **Step 3: Final whole-branch review + open the PR.** Dispatch a whole-branch review (per superpowers:requesting-code-review), fix any Critical/Important, then:

```bash
git push -u origin feat/protocol-analytics
gh pr create --base main --title "feat(marketing): protocol analytics tab (daily snapshot series + Layout A)" --body "Implements docs/superpowers/specs/2026-06-30-protocol-analytics-design.md"
```

- [ ] **Step 4: Merge + deploy (agent-permitted this round).**
- Confirm CI core checks green (Netlify checks are legacy/ignored); `gh pr merge <#> --squash`.
- Wait for `deploy.yml` (the `migrate` job's `prisma db push` is a no-op — no schema change); the new `Setup Daily Snapshot Scheduler` step creates the job (non-fatal if the SA lacks `serviceusage`/`cloudscheduler` perms — same caveat as the prefetch scheduler).
- Verify the Cloud Build short-SHA image exists for the merge commit (AR tags via `gcp_token.py`); bump `newTag` (WITH QUOTES) in `k8s/kustomization.yaml` to that short SHA; push to `main`.
- Force Flux: annotate `gitrepository subfrost-io` then `kustomization subfrost-io` in `flux-system` with `reconcile.fluxcd.io/requestedAt=<ts>` via `kubectl-io.sh`; wait for `rollout status deploy/subfrost-io`.
- **Seed the first snapshot:** fire the scheduler once (`gcloud scheduler jobs run subfrost-daily-snapshot --location=<REGION>` via the io tooling) OR `curl` the live endpoint with the Bearer secret, so the tab isn't empty.
- Verify live: `/admin/marketing/protocol` 307→login (gated), `/feed.xml` 200, home 200.

---

## Self-Review

**Spec coverage:**
- §3 daily capture (cron + idempotency + `SnapshotContext` DAILY, no migration) → Tasks 1 (context + store) + 3 (route) + 5 (scheduler). ✓
- §4 the tab (Layout A: heroes + trend chart + selector + secondaries + history) → Task 4. ✓
- §5 data & deltas (`buildProtocolSeries`, delta via `diffSnapshots`, indefinite retention) → Task 2 (helpers) + Task 4 (page wires deltas). ✓
- §6 file changes → all present (types, snapshot-store, protocol-series, snapshot-cron route, page, client, admin-nav, deploy.yml). Registry `VIEW_GATES` intentionally skipped — matches the live Site-analytics/Schedule pages (inline gating only); noted in Global Constraints. ✓
- §7 error handling (partial → nulls/gaps, empty state, idempotency, Δ "—") → Task 1 (idempotency), Task 2 (null-safe series + null deltas), Task 4 (empty state). ✓
- §8 testing (pure helpers TDD'd; UI + route build-verified; gates) → Tasks 1, 2 (TDD), 3, 4 (build), 6 (gates). ✓
- §9 deploy → Task 5 (scheduler) + Task 6 (merge/deploy/seed). ✓

**Placeholder scan:** No TBD/TODO. Every code step has complete code. The two conditional notes (Command/chart export names; YAML validator choice) are bounded real fallbacks, not placeholders.

**Type consistency:** `SeriesPoint` (Task 2) is consumed by the page + client (Task 4). `kpiDelta`/`pickBaseline`/`buildProtocolSeries` signatures match between Task 2's definition and Task 4's usage. `listDailySnapshots`/`dailySnapshotExistsOn` (Task 1) are used by Task 3 (route) and Task 4 (page). `createSnapshot(input, payload, createdById)` call in Task 3 matches the existing signature (`context: "DAILY"` is now valid after Task 1's union widening). `chartConfig` keys equal the `SeriesPoint` numeric field names the selector plots (`dieselHolders`/`dieselPrice`/`btcLocked`/`firePrice`/`dieselMarketcap`/`btcUsd`). Delta paths passed in Task 4 (`tokens.diesel.holders`, `tokens.diesel.priceUsd`, `protocol.totalBtcLocked`) match `diffSnapshots`'s `FIELDS` paths.
