# Marketing: OP_RETURN ingestion + Stat-card studio — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Ingest the public OP_RETURN decode CSV into Postgres and ship a Stat-card studio in the Marketing admin that renders branded shareable PNGs from on-chain metrics.

**Architecture:** Additive Prisma table `OpReturnDaily` fed by an idempotent CSV sync (manual button + daily CronJob reusing the app image). Pure derived-metric helpers turn rows into shares/USD over windows. A `next/og` route renders branded PNGs (mirroring `app/articles/opengraph-image.tsx`); a client studio picks metric/template/window/theme and previews live.

**Tech Stack:** Next.js (App Router) + TypeScript, Prisma 5.22 + Postgres, `next/og` (Satori), Zod, Vitest + React Testing Library, Tailwind. pnpm. Deploy: GKE + Flux.

## Global Constraints

- Package manager **pnpm**. Prisma **5.22.0**. Schema changes MUST be additive (`prisma db push --skip-generate`, no `--accept-data-loss`).
- Reuse **`marketing.view`** for all gating (page + render route + sync action). No new IAM.
- CSV source (primary): `https://vdto88.github.io/alkanes-opreturn-stats/history.csv` (fallback `https://raw.githubusercontent.com/Vdto88/alkanes-opreturn-stats/main/history.csv`). Header columns, in order: `date,fromHeight,toHeight,blocksScanned,totalTx,txWithOpReturn,txAlkanes,opReturnBytes,runestoneBytes,alkanesBytes,dieselMints,feeTotalSats,feeAlkanesSats,feeOpReturnSats,btcUsd`.
- Card render via `next/og` `ImageResponse`, **1200×675**, brand: Geist Medium font from `node_modules/geist/dist/fonts/geist-sans/Geist-Medium.ttf`, logomark from `public/brand/subfrost/Logos/svg/logomark/logomark.svg`, colors `#071224` (ink), `#51647f` (muted), `#ffffff` (bg); dark theme bg `#0b1220`, accent `#5dcaa5` (teal) / `#7aa2ff`.
- Windows: `latest | avg7 (default) | avg30 | avg60 | avg120 | full`. Metric ratios aggregate as **ratio-of-sums** over the window; USD-daily as **mean daily**; USD-cumulative as **sum**.
- Comparison template = **bytes composition** (Alkanes / Runes / other) — the CSV has no Runes tx count, only `runestoneBytes`.
- UI copy in English (matches the admin). Round every displayed number.
- Deploy: PR → merge → bump `newTag` **with quotes** → Flux; run one sync to backfill.

## File Structure

- `prisma/schema.prisma` — add `model OpReturnDaily`.
- `lib/marketing/opreturn-types.ts` — `OpReturnRow`, `MetricKey`, `WindowKey`, label maps.
- `lib/marketing/opreturn-sync.ts` — `fetchHistoryCsv`, `parseHistoryCsv`, `syncOpReturn`.
- `lib/marketing/opreturn-store.ts` — `listOpReturnDaily`, `opReturnMeta`.
- `lib/marketing/opreturn-metrics.ts` — `dayValue`, `computeMetric`, `computeBytesComposition`.
- `actions/marketing/opreturn.ts` — `syncOpReturnAction`.
- `scripts/sync-opreturn.mjs` — node script for the CronJob.
- `k8s/opreturn-sync-cronjob.yaml` + `k8s/kustomization.yaml` (add to resources).
- `app/admin/marketing/cards/page.tsx` — server page.
- `components/cms/marketing/StatCardStudio.tsx` — client UI.
- `app/admin/marketing/cards/render/route.tsx` — `next/og` GET route.
- `lib/cms/admin-nav.ts` — add nav leaf. `lib/cms/iam/registry.ts` — add route→priv.
- Tests: `tests/marketing/opreturn-sync.test.ts`, `tests/marketing/opreturn-metrics.test.ts`, `tests/cms/marketing-nav.test.ts` (extend), `tests/marketing/stat-card-studio.test.tsx`.

---

### Task 1: Data layer — schema, types, CSV sync, store

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/marketing/opreturn-types.ts`, `lib/marketing/opreturn-sync.ts`, `lib/marketing/opreturn-store.ts`
- Test: `tests/marketing/opreturn-sync.test.ts`

**Interfaces:**
- Produces: `OpReturnRow` (15 numeric fields + `date`); `parseHistoryCsv(text: string): OpReturnRow[]`; `syncOpReturn(): Promise<{ fetched: number; upserted: number; latestDate: string | null }>`; `listOpReturnDaily(): Promise<OpReturnRow[]>` (asc by date); `opReturnMeta(): Promise<{ count: number; latestDate: string | null; latestUpdatedAt: Date | null }>`.

- [ ] **Step 1: Write the failing parse test**

Create `tests/marketing/opreturn-sync.test.ts`:

```ts
import { it, expect } from "vitest"
import { parseHistoryCsv } from "@/lib/marketing/opreturn-sync"

const CSV = `date,fromHeight,toHeight,blocksScanned,totalTx,txWithOpReturn,txAlkanes,opReturnBytes,runestoneBytes,alkanesBytes,dieselMints,feeTotalSats,feeAlkanesSats,feeOpReturnSats,btcUsd
2025-12-29,930000,930090,11,38847,19132,1862,186773,164044,41320,1859,20479751,172670,1565961,87822.9
2026-06-28,955647,955790,24,125074,95833,94418,2038109,1992077,1985791,94277,34686939,9256009,9907915,60236.9`

it("parses each data row into a typed OpReturnRow", () => {
  const rows = parseHistoryCsv(CSV)
  expect(rows).toHaveLength(2)
  expect(rows[0]).toMatchObject({ date: "2025-12-29", totalTx: 38847, txAlkanes: 1862, btcUsd: 87822.9 })
  expect(rows[1].alkanesBytes).toBe(1985791)
  expect(typeof rows[1].feeAlkanesSats).toBe("number")
})

it("skips blank and malformed lines", () => {
  const rows = parseHistoryCsv(CSV + "\n\nbad,row,short\n")
  expect(rows).toHaveLength(2)
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/marketing/opreturn-sync.test.ts`
Expected: FAIL (`parseHistoryCsv` not exported).

- [ ] **Step 3: Add the Prisma model**

In `prisma/schema.prisma`, append a new model (near the other marketing models):

```prisma
model OpReturnDaily {
  date            String   @id
  fromHeight      Int
  toHeight        Int
  blocksScanned   Int
  totalTx         Int
  txWithOpReturn  Int
  txAlkanes       Int
  opReturnBytes   Int
  runestoneBytes  Int
  alkanesBytes    Int
  dieselMints     Int
  feeTotalSats    Int
  feeAlkanesSats  Int
  feeOpReturnSats Int
  btcUsd          Float
  updatedAt       DateTime @updatedAt
}
```

- [ ] **Step 4: Create the types module**

Create `lib/marketing/opreturn-types.ts`:

```ts
export interface OpReturnRow {
  date: string
  fromHeight: number; toHeight: number; blocksScanned: number
  totalTx: number; txWithOpReturn: number; txAlkanes: number
  opReturnBytes: number; runestoneBytes: number; alkanesBytes: number; dieselMints: number
  feeTotalSats: number; feeAlkanesSats: number; feeOpReturnSats: number; btcUsd: number
}

export const OPRETURN_COLUMNS: (keyof OpReturnRow)[] = [
  "date", "fromHeight", "toHeight", "blocksScanned", "totalTx", "txWithOpReturn", "txAlkanes",
  "opReturnBytes", "runestoneBytes", "alkanesBytes", "dieselMints",
  "feeTotalSats", "feeAlkanesSats", "feeOpReturnSats", "btcUsd",
]

export type MetricKey =
  | "alkanesTxShare" | "alkanesOfOpReturnShare" | "opReturnTxShare"
  | "alkanesBytesShare" | "runesBytesShare" | "dieselShareOfAlkanes"
  | "alkanesFeeShare" | "alkanesFeeUsdDaily" | "alkanesFeeUsdCumulative"

export type WindowKey = "latest" | "avg7" | "avg30" | "avg60" | "avg120" | "full"

export const WINDOW_DAYS: Record<WindowKey, number | null> = {
  latest: 1, avg7: 7, avg30: 30, avg60: 60, avg120: 120, full: null,
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  alkanesTxShare: "Alkanes share of Bitcoin transactions",
  alkanesOfOpReturnShare: "Alkanes share of OP_RETURN transactions",
  opReturnTxShare: "OP_RETURN share of Bitcoin transactions",
  alkanesBytesShare: "Alkanes share of OP_RETURN bytes",
  runesBytesShare: "Runes share of OP_RETURN bytes",
  dieselShareOfAlkanes: "DIESEL share of Alkanes activity",
  alkanesFeeShare: "Alkanes share of Bitcoin fees",
  alkanesFeeUsdDaily: "Daily Bitcoin fees paid by Alkanes (USD)",
  alkanesFeeUsdCumulative: "Total Bitcoin fees paid by Alkanes (USD)",
}

export const WINDOW_LABELS: Record<WindowKey, string> = {
  latest: "Latest day", avg7: "7-day average", avg30: "30-day average",
  avg60: "60-day average", avg120: "120-day average", full: "Full tracked period",
}
```

- [ ] **Step 5: Create the sync module (make the test pass)**

Create `lib/marketing/opreturn-sync.ts`:

```ts
import prisma from "@/lib/prisma"
import { OPRETURN_COLUMNS, type OpReturnRow } from "./opreturn-types"

const PRIMARY = "https://vdto88.github.io/alkanes-opreturn-stats/history.csv"
const FALLBACK = "https://raw.githubusercontent.com/Vdto88/alkanes-opreturn-stats/main/history.csv"

export async function fetchHistoryCsv(): Promise<string> {
  for (const url of [PRIMARY, FALLBACK]) {
    try {
      const res = await fetch(url, { cache: "no-store", signal: AbortSignal.timeout(15000) })
      if (res.ok) {
        const text = await res.text()
        if (text.includes("date,") && text.includes("alkanesBytes")) return text
      }
    } catch { /* try next */ }
  }
  throw new Error("Could not fetch history.csv from the decoder dashboard")
}

// Header is fixed and values are plain numbers/ISO dates — a simple split is safe.
export function parseHistoryCsv(text: string): OpReturnRow[] {
  const lines = text.split(/\r?\n/).map((l) => l.trim()).filter(Boolean)
  const out: OpReturnRow[] = []
  for (const line of lines) {
    const cells = line.split(",")
    if (cells.length !== OPRETURN_COLUMNS.length) continue
    if (cells[0] === "date") continue // header
    if (!/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue
    const row = { date: cells[0] } as OpReturnRow
    let ok = true
    for (let i = 1; i < OPRETURN_COLUMNS.length; i++) {
      const n = Number(cells[i])
      if (!Number.isFinite(n)) { ok = false; break }
      ;(row as unknown as Record<string, number>)[OPRETURN_COLUMNS[i]] = n
    }
    if (ok) out.push(row)
  }
  return out
}

export async function syncOpReturn(): Promise<{ fetched: number; upserted: number; latestDate: string | null }> {
  const rows = parseHistoryCsv(await fetchHistoryCsv())
  let upserted = 0
  for (const r of rows) {
    const { date, ...rest } = r
    await prisma.opReturnDaily.upsert({ where: { date }, create: { date, ...rest }, update: rest })
    upserted++
  }
  const latestDate = rows.length ? rows[rows.length - 1].date : null
  return { fetched: rows.length, upserted, latestDate }
}
```

- [ ] **Step 6: Create the store module**

Create `lib/marketing/opreturn-store.ts`:

```ts
import prisma from "@/lib/prisma"
import { OPRETURN_COLUMNS, type OpReturnRow } from "./opreturn-types"

type DbRow = Record<string, unknown>

function map(r: DbRow): OpReturnRow {
  const out = { date: String(r.date) } as OpReturnRow
  for (let i = 1; i < OPRETURN_COLUMNS.length; i++) {
    ;(out as unknown as Record<string, number>)[OPRETURN_COLUMNS[i]] = Number(r[OPRETURN_COLUMNS[i]])
  }
  return out
}

export async function listOpReturnDaily(): Promise<OpReturnRow[]> {
  const rows = (await prisma.opReturnDaily.findMany({ orderBy: { date: "asc" } })) as DbRow[]
  return rows.map(map)
}

export async function opReturnMeta(): Promise<{ count: number; latestDate: string | null; latestUpdatedAt: Date | null }> {
  const [count, latest] = await Promise.all([
    prisma.opReturnDaily.count(),
    prisma.opReturnDaily.findFirst({ orderBy: { date: "desc" }, select: { date: true, updatedAt: true } }),
  ])
  return { count, latestDate: latest?.date ?? null, latestUpdatedAt: latest?.updatedAt ?? null }
}
```

- [ ] **Step 7: Regenerate Prisma client + run tests**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec prisma generate && pnpm exec vitest run tests/marketing/opreturn-sync.test.ts && pnpm exec tsc --noEmit`
Expected: parse tests PASS; tsc 0 errors.

- [ ] **Step 8: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add prisma/schema.prisma lib/marketing/opreturn-types.ts lib/marketing/opreturn-sync.ts lib/marketing/opreturn-store.ts tests/marketing/opreturn-sync.test.ts
git commit -m "feat(marketing): OpReturnDaily model + CSV sync + store"
```

---

### Task 2: Derived metrics

**Files:**
- Create: `lib/marketing/opreturn-metrics.ts`
- Test: `tests/marketing/opreturn-metrics.test.ts`

**Interfaces:**
- Consumes: `OpReturnRow`, `MetricKey`, `WindowKey`, `WINDOW_DAYS` (Task 1).
- Produces:
  - `dayValue(r: OpReturnRow, metric: MetricKey): number | null`
  - `computeMetric(rows: OpReturnRow[], metric: MetricKey, window: WindowKey): { value: number | null; kind: "ratio" | "usd"; series: { date: string; value: number | null }[] }` — ratio aggregates as sum(num)/sum(den); `alkanesFeeUsdDaily` as mean daily; `alkanesFeeUsdCumulative` as sum; `series` = trailing ≤60 daily values.
  - `computeBytesComposition(rows: OpReturnRow[], window: WindowKey): { alkanes: number; runes: number; other: number }` — shares of `opReturnBytes` (ratio-of-sums), clamped ≥0, null-safe (returns zeros if no bytes).

- [ ] **Step 1: Write the failing tests**

Create `tests/marketing/opreturn-metrics.test.ts`:

```ts
import { it, expect } from "vitest"
import { computeMetric, computeBytesComposition, dayValue } from "@/lib/marketing/opreturn-metrics"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

const row = (over: Partial<OpReturnRow>): OpReturnRow => ({
  date: "2026-01-01", fromHeight: 0, toHeight: 0, blocksScanned: 1,
  totalTx: 100, txWithOpReturn: 80, txAlkanes: 50, opReturnBytes: 1000,
  runestoneBytes: 200, alkanesBytes: 700, dieselMints: 49,
  feeTotalSats: 1000, feeAlkanesSats: 100, feeOpReturnSats: 500, btcUsd: 100000, ...over,
})

it("dayValue computes a share and guards divide-by-zero", () => {
  expect(dayValue(row({ txAlkanes: 50, totalTx: 100 }), "alkanesTxShare")).toBeCloseTo(0.5)
  expect(dayValue(row({ totalTx: 0 }), "alkanesTxShare")).toBeNull()
})

it("computeMetric ratio uses ratio-of-sums over the window", () => {
  const rows = [row({ date: "2026-01-01", txAlkanes: 10, totalTx: 100 }), row({ date: "2026-01-02", txAlkanes: 90, totalTx: 100 })]
  // avg7 covers both days: (10+90)/(100+100) = 0.5
  expect(computeMetric(rows, "alkanesTxShare", "avg7").value).toBeCloseTo(0.5)
  // latest = last day only: 90/100 = 0.9
  expect(computeMetric(rows, "alkanesTxShare", "latest").value).toBeCloseTo(0.9)
})

it("computeMetric usd cumulative sums daily USD over the window", () => {
  const rows = [row({ feeAlkanesSats: 100_000_000, btcUsd: 50000 }), row({ date: "2026-01-02", feeAlkanesSats: 200_000_000, btcUsd: 50000 })]
  // 1 BTC*50k + 2 BTC*50k = 150000
  expect(computeMetric(rows, "alkanesFeeUsdCumulative", "full").value).toBeCloseTo(150000)
  expect(computeMetric(rows, "alkanesFeeUsdCumulative", "full").kind).toBe("usd")
})

it("computeBytesComposition splits alkanes/runes/other by ratio-of-sums", () => {
  const c = computeBytesComposition([row({ opReturnBytes: 1000, alkanesBytes: 700, runestoneBytes: 200 })], "full")
  expect(c.alkanes).toBeCloseTo(0.7)
  expect(c.runes).toBeCloseTo(0.2)
  expect(c.other).toBeCloseTo(0.1)
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/marketing/opreturn-metrics.test.ts`
Expected: FAIL (module not found).

- [ ] **Step 3: Implement the metrics module**

Create `lib/marketing/opreturn-metrics.ts`:

```ts
import { WINDOW_DAYS, type MetricKey, type OpReturnRow, type WindowKey } from "./opreturn-types"

const NUM: Record<MetricKey, (r: OpReturnRow) => number> = {
  alkanesTxShare: (r) => r.txAlkanes,
  alkanesOfOpReturnShare: (r) => r.txAlkanes,
  opReturnTxShare: (r) => r.txWithOpReturn,
  alkanesBytesShare: (r) => r.alkanesBytes,
  runesBytesShare: (r) => r.runestoneBytes,
  dieselShareOfAlkanes: (r) => r.dieselMints,
  alkanesFeeShare: (r) => r.feeAlkanesSats,
  alkanesFeeUsdDaily: (r) => (r.feeAlkanesSats / 1e8) * r.btcUsd,
  alkanesFeeUsdCumulative: (r) => (r.feeAlkanesSats / 1e8) * r.btcUsd,
}

const DEN: Record<MetricKey, ((r: OpReturnRow) => number) | null> = {
  alkanesTxShare: (r) => r.totalTx,
  alkanesOfOpReturnShare: (r) => r.txWithOpReturn,
  opReturnTxShare: (r) => r.totalTx,
  alkanesBytesShare: (r) => r.opReturnBytes,
  runesBytesShare: (r) => r.opReturnBytes,
  dieselShareOfAlkanes: (r) => r.txAlkanes,
  alkanesFeeShare: (r) => r.feeTotalSats,
  alkanesFeeUsdDaily: null,
  alkanesFeeUsdCumulative: null,
}

export function metricKind(metric: MetricKey): "ratio" | "usd" {
  return DEN[metric] ? "ratio" : "usd"
}

export function dayValue(r: OpReturnRow, metric: MetricKey): number | null {
  const den = DEN[metric]
  if (!den) return NUM[metric](r)
  const d = den(r)
  return d === 0 ? null : NUM[metric](r) / d
}

function windowRows(rows: OpReturnRow[], window: WindowKey): OpReturnRow[] {
  const n = WINDOW_DAYS[window]
  return n === null ? rows : rows.slice(-n)
}

export function computeMetric(rows: OpReturnRow[], metric: MetricKey, window: WindowKey) {
  const kind = metricKind(metric)
  const win = windowRows(rows, window)
  let value: number | null = null
  if (kind === "ratio") {
    const den = DEN[metric]!
    const numSum = win.reduce((s, r) => s + NUM[metric](r), 0)
    const denSum = win.reduce((s, r) => s + den(r), 0)
    value = denSum === 0 ? null : numSum / denSum
  } else if (metric === "alkanesFeeUsdCumulative") {
    value = win.reduce((s, r) => s + NUM[metric](r), 0)
  } else {
    value = win.length ? win.reduce((s, r) => s + NUM[metric](r), 0) / win.length : null
  }
  const series = rows.slice(-60).map((r) => ({ date: r.date, value: dayValue(r, metric) }))
  return { value, kind, series }
}

export function computeBytesComposition(rows: OpReturnRow[], window: WindowKey): { alkanes: number; runes: number; other: number } {
  const win = windowRows(rows, window)
  const total = win.reduce((s, r) => s + r.opReturnBytes, 0)
  if (total === 0) return { alkanes: 0, runes: 0, other: 0 }
  const a = win.reduce((s, r) => s + r.alkanesBytes, 0) / total
  const ru = win.reduce((s, r) => s + r.runestoneBytes, 0) / total
  return { alkanes: a, runes: ru, other: Math.max(0, 1 - a - ru) }
}
```

- [ ] **Step 4: Run the tests to verify they pass**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/marketing/opreturn-metrics.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc 0 errors.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add lib/marketing/opreturn-metrics.ts tests/marketing/opreturn-metrics.test.ts
git commit -m "feat(marketing): OP_RETURN derived metrics (shares, USD, windows, bytes composition)"
```

---

### Task 3: Sync action, cron script + manifest, nav, route-priv

**Files:**
- Create: `actions/marketing/opreturn.ts`, `scripts/sync-opreturn.mjs`, `k8s/opreturn-sync-cronjob.yaml`
- Modify: `k8s/kustomization.yaml`, `lib/cms/admin-nav.ts`, `lib/cms/iam/registry.ts`
- Test: `tests/cms/marketing-nav.test.ts` (extend)

**Interfaces:**
- Consumes: `syncOpReturn` (Task 1).
- Produces: `syncOpReturnAction(): Promise<{ ok: true; value: { fetched: number; upserted: number; latestDate: string | null } } | { ok: false; error: string }>` (gated `marketing.view`, audited).

- [ ] **Step 1: Extend the nav test (failing)**

In `tests/cms/marketing-nav.test.ts`, add a case asserting the Stat-cards leaf exists under Marketing for `marketing.view`. Append inside the existing `describe`/file:

```ts
import { NAV_GROUPS } from "@/lib/cms/admin-nav"

it("exposes the Stat cards leaf under Marketing gated by marketing.view", () => {
  const mk = NAV_GROUPS.find((g) => g.key === "marketing")!
  const leaf = mk.items.find((i) => i.href === "/admin/marketing/cards")
  expect(leaf).toBeTruthy()
  expect(leaf!.privilege).toBe("marketing.view")
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/cms/marketing-nav.test.ts`
Expected: FAIL (leaf not found).

- [ ] **Step 3: Add the nav leaf + route→priv**

In `lib/cms/admin-nav.ts`, add `Image` to the lucide import line (line 1-7 block), then add a leaf to the `marketing` group's `items` (after Site analytics, line 62):

```ts
      { label: "Stat cards", href: "/admin/marketing/cards", icon: Image, privilege: "marketing.view" },
```

In `lib/cms/iam/registry.ts`, after the `"/admin/marketing/snapshots"` entry (line 237), add:

```ts
  "/admin/marketing/cards": { view: "marketing.view" },
```

- [ ] **Step 4: Create the sync action**

Create `actions/marketing/opreturn.ts`:

```ts
"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { currentUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { syncOpReturn } from "@/lib/marketing/opreturn-sync"

const PATH = "/admin/marketing/cards"
const PRIV = "marketing.view"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

export async function syncOpReturnAction(): Promise<
  { ok: true; value: { fetched: number; upserted: number; latestDate: string | null } } | { ok: false; error: string }
> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(PRIV)) return { ok: false, error: "unauthorized" }
  try {
    const value = await syncOpReturn()
    await audit("marketing_opreturn_sync", { actorId: me.id, details: value, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed" }
  }
}
```

- [ ] **Step 5: Create the cron script**

Create `scripts/sync-opreturn.mjs`:

```js
/**
 * Daily CronJob entrypoint: fetch the OP_RETURN decoder CSV and upsert into
 * OpReturnDaily. Idempotent. Run with the app image: node scripts/sync-opreturn.mjs
 */
import { PrismaClient } from "@prisma/client"

if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is not set")

const PRIMARY = "https://vdto88.github.io/alkanes-opreturn-stats/history.csv"
const COLS = ["date","fromHeight","toHeight","blocksScanned","totalTx","txWithOpReturn","txAlkanes","opReturnBytes","runestoneBytes","alkanesBytes","dieselMints","feeTotalSats","feeAlkanesSats","feeOpReturnSats","btcUsd"]

const prisma = new PrismaClient()
try {
  const res = await fetch(PRIMARY, { cache: "no-store" })
  if (!res.ok) throw new Error("fetch failed " + res.status)
  const text = await res.text()
  let n = 0
  for (const line of text.split(/\r?\n/)) {
    const cells = line.trim().split(",")
    if (cells.length !== COLS.length || !/^\d{4}-\d{2}-\d{2}$/.test(cells[0])) continue
    const data = {}
    let ok = true
    for (let i = 1; i < COLS.length; i++) { const v = Number(cells[i]); if (!Number.isFinite(v)) { ok = false; break } data[COLS[i]] = v }
    if (!ok) continue
    const { ...rest } = data
    await prisma.opReturnDaily.upsert({ where: { date: cells[0] }, create: { date: cells[0], ...rest }, update: rest })
    n++
  }
  console.log(`[sync-opreturn] upserted ${n} day(s)`)
} finally {
  await prisma.$disconnect()
}
```

- [ ] **Step 6: Create the CronJob manifest + register it**

Create `k8s/opreturn-sync-cronjob.yaml`:

```yaml
apiVersion: batch/v1
kind: CronJob
metadata:
  name: opreturn-sync
  namespace: subfrost
spec:
  schedule: "30 6 * * *"
  concurrencyPolicy: Forbid
  successfulJobsHistoryLimit: 1
  failedJobsHistoryLimit: 2
  jobTemplate:
    spec:
      backoffLimit: 2
      template:
        spec:
          restartPolicy: Never
          containers:
            - name: sync
              image: us-central1-docker.pkg.dev/night-wolves-jogging/subfrost-docker/subfrost-io
              command: ["node", "scripts/sync-opreturn.mjs"]
              envFrom:
                - secretRef:
                    name: subfrost-io-secrets
```

In `k8s/kustomization.yaml`, add to the `resources:` list:

```yaml
  - opreturn-sync-cronjob.yaml
```

(Note: confirm the env secret name the deployment uses — mirror `k8s/deployment.yaml`'s env source for `DATABASE_URL`; adjust `secretRef.name`/`envFrom` to match before applying.)

- [ ] **Step 7: Run the nav test + tsc**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/cms/marketing-nav.test.ts && pnpm exec tsc --noEmit`
Expected: PASS; tsc 0 errors.

- [ ] **Step 8: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add actions/marketing/opreturn.ts scripts/sync-opreturn.mjs k8s/opreturn-sync-cronjob.yaml k8s/kustomization.yaml lib/cms/admin-nav.ts lib/cms/iam/registry.ts tests/cms/marketing-nav.test.ts
git commit -m "feat(marketing): sync action + daily CronJob + Stat cards nav/route-priv"
```

---

### Task 4: Card render route (next/og)

**Files:**
- Create: `app/admin/marketing/cards/render/route.tsx`

**Interfaces:**
- Consumes: `listOpReturnDaily` (Task 1), `computeMetric`/`computeBytesComposition`/`metricKind` (Task 2), `METRIC_LABELS`/`WINDOW_LABELS` (Task 1), `currentUser` (gating).
- Produces: `GET(req)` → `image/png` (1200×675) for `?metric=&template=&window=&theme=`.

- [ ] **Step 1: Implement the route**

Create `app/admin/marketing/cards/render/route.tsx`:

```tsx
import { ImageResponse } from "next/og"
import { readFile } from "node:fs/promises"
import { join } from "node:path"
import { NextRequest } from "next/server"
import { currentUser } from "@/lib/cms/authz"
import { listOpReturnDaily } from "@/lib/marketing/opreturn-store"
import { computeMetric, computeBytesComposition } from "@/lib/marketing/opreturn-metrics"
import { METRIC_LABELS, WINDOW_LABELS, type MetricKey, type WindowKey } from "@/lib/marketing/opreturn-types"

export const runtime = "nodejs"
const SIZE = { width: 1200, height: 675 }

async function assets() {
  const [logo, font] = await Promise.all([
    readFile(join(process.cwd(), "public", "brand", "subfrost", "Logos", "svg", "logomark", "logomark.svg")),
    readFile(join(process.cwd(), "node_modules", "geist", "dist", "fonts", "geist-sans", "Geist-Medium.ttf")),
  ])
  return { logo: `data:image/svg+xml;base64,${logo.toString("base64")}`, font: font.buffer.slice(font.byteOffset, font.byteOffset + font.byteLength) }
}

const fmtPct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`)
const fmtUsd = (v: number | null) => (v === null ? "—" : new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 }).format(v))

function sparkline(series: { value: number | null }[], stroke: string) {
  const pts = series.filter((p) => p.value !== null) as { value: number }[]
  if (pts.length < 2) return null
  const max = Math.max(...pts.map((p) => p.value)), min = Math.min(...pts.map((p) => p.value))
  const span = max - min || 1
  const w = 900, h = 120
  const d = pts.map((p, i) => `${(i / (pts.length - 1)) * w},${h - ((p.value - min) / span) * h}`).join(" ")
  return (
    <svg width={w} height={h} viewBox={`0 0 ${w} ${h}`} style={{ display: "flex" }}>
      <polyline points={d} fill="none" stroke={stroke} strokeWidth={5} />
    </svg>
  )
}

export async function GET(req: NextRequest) {
  const me = await currentUser()
  if (!me || !me.privileges.includes("marketing.view")) return new Response("Unauthorized", { status: 401 })

  const sp = req.nextUrl.searchParams
  const metric = (sp.get("metric") ?? "alkanesTxShare") as MetricKey
  const template = sp.get("template") === "compare" ? "compare" : "hero"
  const window = (sp.get("window") ?? "avg7") as WindowKey
  const dark = sp.get("theme") !== "light"

  const rows = await listOpReturnDaily()
  const { logo, font } = await assets()
  const bg = dark ? "#0b1220" : "#ffffff"
  const ink = dark ? "#ffffff" : "#071224"
  const muted = dark ? "#aab8d6" : "#51647f"
  const accent = "#5dcaa5"

  let inner: React.ReactNode
  if (template === "compare") {
    const c = computeBytesComposition(rows, window)
    const bar = (label: string, v: number, color: string) => (
      <div style={{ display: "flex", flexDirection: "column", gap: 8, width: "100%" }}>
        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 30, color: ink }}><span>{label}</span><span>{fmtPct(v)}</span></div>
        <div style={{ display: "flex", width: "100%", height: 28, background: dark ? "#1b2740" : "#eef2f8" }}>
          <div style={{ display: "flex", width: `${Math.round(v * 100)}%`, height: 28, background: color }} />
        </div>
      </div>
    )
    inner = (
      <div style={{ display: "flex", flexDirection: "column", gap: 24, width: "100%" }}>
        <div style={{ display: "flex", fontSize: 40, color: ink }}>OP_RETURN bytes composition</div>
        {bar("Alkanes", c.alkanes, accent)}
        {bar("Runes", c.runes, "#f0997b")}
        {bar("Other", c.other, muted)}
      </div>
    )
  } else {
    const { value, kind, series } = computeMetric(rows, metric, window)
    inner = (
      <div style={{ display: "flex", flexDirection: "column", width: "100%" }}>
        <div style={{ display: "flex", fontSize: 150, fontWeight: 500, color: ink, lineHeight: 1 }}>{kind === "usd" ? fmtUsd(value) : fmtPct(value)}</div>
        <div style={{ display: "flex", fontSize: 38, color: muted, marginTop: 14 }}>{METRIC_LABELS[metric]}</div>
        <div style={{ display: "flex", marginTop: 24 }}>{sparkline(series, accent)}</div>
      </div>
    )
  }

  return new ImageResponse(
    (
      <div style={{ width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", background: bg, padding: 72, fontFamily: "Geist" }}>
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src={logo} alt="" width={64} height={64} />
          <span style={{ display: "flex", fontSize: 30, letterSpacing: 4, color: muted }}>SUBFROST</span>
          <span style={{ display: "flex", marginLeft: "auto", fontSize: 26, color: muted }}>{WINDOW_LABELS[window]}</span>
        </div>
        <div style={{ display: "flex" }}>{inner}</div>
        <div style={{ display: "flex", fontSize: 24, color: muted }}>subfrost.io · decoded from Bitcoin OP_RETURN, daily</div>
      </div>
    ),
    { ...SIZE, fonts: [{ name: "Geist", data: font, style: "normal", weight: 500 }] },
  )
}
```

- [ ] **Step 2: Verify it compiles and builds**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec tsc --noEmit && pnpm build`
Expected: tsc 0 errors; build completes (route `/admin/marketing/cards/render` listed as dynamic ƒ).

- [ ] **Step 3: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add app/admin/marketing/cards/render/route.tsx
git commit -m "feat(marketing): next/og render route for branded stat cards (hero + compare)"
```

---

### Task 5: Stat-card studio page + client

**Files:**
- Create: `app/admin/marketing/cards/page.tsx`, `components/cms/marketing/StatCardStudio.tsx`
- Test: `tests/marketing/stat-card-studio.test.tsx`

**Interfaces:**
- Consumes: `opReturnMeta` (Task 1), `syncOpReturnAction` (Task 3), `METRIC_LABELS`/`WINDOW_LABELS`/`MetricKey`/`WindowKey` (Task 1), the render route (Task 4).

- [ ] **Step 1: Write the failing studio test**

Create `tests/marketing/stat-card-studio.test.tsx`:

```tsx
import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("@/actions/marketing/opreturn", () => ({ syncOpReturnAction: vi.fn().mockResolvedValue({ ok: true, value: { fetched: 1, upserted: 1, latestDate: "2026-06-28" } }) }))

import { StatCardStudio } from "@/components/cms/marketing/StatCardStudio"

beforeEach(() => cleanup())

it("renders a live preview whose src reflects the chosen metric and window", () => {
  const { getByLabelText, getByAltText } = render(<StatCardStudio meta={{ count: 183, latestDate: "2026-06-28", latestUpdatedAt: null }} />)
  fireEvent.change(getByLabelText("Metric"), { target: { value: "alkanesBytesShare" } })
  fireEvent.change(getByLabelText("Window"), { target: { value: "avg60" } })
  const img = getByAltText("Card preview") as HTMLImageElement
  expect(img.src).toContain("metric=alkanesBytesShare")
  expect(img.src).toContain("window=avg60")
})

it("shows an empty-state hint when no data has been synced", () => {
  const { getByText } = render(<StatCardStudio meta={{ count: 0, latestDate: null, latestUpdatedAt: null }} />)
  expect(getByText(/Sync now/i)).toBeTruthy()
})
```

- [ ] **Step 2: Run it to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/marketing/stat-card-studio.test.tsx`
Expected: FAIL (module not found).

- [ ] **Step 3: Build the client component**

Create `components/cms/marketing/StatCardStudio.tsx`:

```tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Camera, RefreshCw, Download } from "lucide-react"
import { METRIC_LABELS, WINDOW_LABELS, type MetricKey, type WindowKey } from "@/lib/marketing/opreturn-types"
import { syncOpReturnAction } from "@/actions/marketing/opreturn"

const METRICS = Object.keys(METRIC_LABELS) as MetricKey[]
const WINDOWS = Object.keys(WINDOW_LABELS) as WindowKey[]

export function StatCardStudio({ meta }: { meta: { count: number; latestDate: string | null; latestUpdatedAt: Date | null } }) {
  const router = useRouter()
  const [metric, setMetric] = useState<MetricKey>("alkanesTxShare")
  const [template, setTemplate] = useState<"hero" | "compare">("hero")
  const [window, setWindow] = useState<WindowKey>("avg7")
  const [theme, setTheme] = useState<"dark" | "light">("dark")
  const [busy, setBusy] = useState(false)
  const [msg, setMsg] = useState<string | null>(null)

  const src = useMemo(() => {
    const q = new URLSearchParams({ metric, template, window, theme })
    return `/admin/marketing/cards/render?${q.toString()}`
  }, [metric, template, window, theme])

  async function sync() {
    setBusy(true); setMsg(null)
    const r = await syncOpReturnAction()
    setBusy(false)
    setMsg(r.ok ? `Synced ${r.value.upserted} days (latest ${r.value.latestDate})` : r.error)
    if (r.ok) router.refresh()
  }

  const select = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none"
  const label = "text-[11px] font-medium uppercase tracking-wide text-zinc-500"

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white"><Camera size={20} className="text-zinc-400" /> Stat cards</h1>
        <div className="flex items-center gap-3">
          <span className="text-xs text-zinc-500">{meta.count > 0 ? `${meta.count} days · latest ${meta.latestDate}` : "No data yet"}</span>
          <button onClick={sync} disabled={busy} className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50"><RefreshCw size={15} className={busy ? "animate-spin" : ""} /> Sync now</button>
        </div>
      </div>
      {msg && <p className="text-xs text-zinc-400">{msg}</p>}
      {meta.count === 0 && <p className="rounded-md border border-amber-500/30 bg-amber-500/5 px-3 py-2 text-sm text-amber-300">No on-chain data yet. Click Sync now to pull the decoder history.</p>}

      <div className="grid grid-cols-1 gap-5 md:grid-cols-[260px_1fr]">
        <div className="space-y-3">
          <div className="flex flex-col gap-1"><label className={label} htmlFor="m">Metric</label>
            <select id="m" aria-label="Metric" value={metric} onChange={(e) => setMetric(e.target.value as MetricKey)} className={select}>
              {METRICS.map((m) => <option key={m} value={m}>{METRIC_LABELS[m]}</option>)}
            </select></div>
          <div className="flex flex-col gap-1"><label className={label} htmlFor="t">Template</label>
            <select id="t" aria-label="Template" value={template} onChange={(e) => setTemplate(e.target.value as "hero" | "compare")} className={select}>
              <option value="hero">Hero stat</option><option value="compare">Bytes composition</option>
            </select></div>
          <div className="flex flex-col gap-1"><label className={label} htmlFor="w">Window</label>
            <select id="w" aria-label="Window" value={window} onChange={(e) => setWindow(e.target.value as WindowKey)} className={select}>
              {WINDOWS.map((w) => <option key={w} value={w}>{WINDOW_LABELS[w]}</option>)}
            </select></div>
          <div className="flex flex-col gap-1"><label className={label} htmlFor="th">Theme</label>
            <select id="th" aria-label="Theme" value={theme} onChange={(e) => setTheme(e.target.value as "dark" | "light")} className={select}>
              <option value="dark">Dark</option><option value="light">Light</option>
            </select></div>
          <a href={src} download className="inline-flex w-full items-center justify-center gap-1.5 rounded-md border border-sky-500/40 px-3 py-2 text-sm text-sky-300 hover:bg-sky-500/10"><Download size={15} /> Download PNG</a>
        </div>
        <div className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img key={src} src={src} alt="Card preview" className="w-full rounded-md" style={{ aspectRatio: "1200 / 675" }} />
        </div>
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create the server page**

Create `app/admin/marketing/cards/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { opReturnMeta } from "@/lib/marketing/opreturn-store"
import { StatCardStudio } from "@/components/cms/marketing/StatCardStudio"

export const dynamic = "force-dynamic"

export default async function StatCardsPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("marketing.view")) redirect("/admin")
  const meta = await opReturnMeta()
  return <StatCardStudio meta={meta} />
}
```

- [ ] **Step 5: Run the studio test + tsc**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/marketing/stat-card-studio.test.tsx && pnpm exec tsc --noEmit`
Expected: PASS; tsc 0 errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add app/admin/marketing/cards/page.tsx components/cms/marketing/StatCardStudio.tsx tests/marketing/stat-card-studio.test.tsx
git commit -m "feat(marketing): Stat-card studio page + client (controls, live preview, sync, download)"
```

---

### Task 6: Full gates

**Files:** none (verification only)

- [ ] **Step 1: Generate, typecheck, test, build**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
pnpm exec prisma generate
pnpm exec tsc --noEmit
pnpm test
pnpm build
```
Expected: prisma generate OK; tsc 0 errors; vitest green except the ~8 pre-existing live-RPC `tests/integration/**` failures (network-dependent, unrelated); `next build` completes with `/admin/marketing/cards` and `/admin/marketing/cards/render` listed.

- [ ] **Step 2: Commit (if any incidental fixes)**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add -A
git commit -m "chore(marketing): stat-card studio gate fixes" || echo "nothing to commit"
```

---

## Deploy (after the plan, human-owned)

1. PR → review → merge to `main`.
2. Bump `newTag` **with quotes** in `k8s/kustomization.yaml`; confirm `opreturn-sync-cronjob.yaml` `envFrom` matches the deployment's secret for `DATABASE_URL` before/at merge.
3. Flux reconciles (source before Kustomization). Init-container `prisma db push` creates `OpReturnDaily` (additive).
4. Backfill: open `/admin/marketing/cards` → **Sync now** (or run `node scripts/sync-opreturn.mjs` in-pod) → confirms ~183 days.
5. Verify: preview renders for hero + compare across windows; Download PNG returns a 1200×675 branded image; CronJob `opreturn-sync` is scheduled.

## Self-Review

- **Spec coverage:** ingestion (model+sync+store) → Task 1; metrics+windows+comparison → Task 2; sync button+action+cron → Task 3; render route (hero+compare, next/og, 1200×675, brand) → Task 4; studio UI+page+nav+gating → Tasks 3+5; tests/gates → Tasks 1,2,3,5,6; deploy → Deploy section. All spec sections map to a task.
- **Placeholder scan:** none — every code step has full code; the one judgement note (CronJob secret name) is an explicit verify-before-apply, not a code placeholder.
- **Type consistency:** `OpReturnRow`/`MetricKey`/`WindowKey`/`METRIC_LABELS`/`WINDOW_LABELS` defined in Task 1 and consumed identically in Tasks 2/4/5; `computeMetric`/`computeBytesComposition`/`metricKind` signatures match between Task 2 and the render route; `syncOpReturnAction` return shape matches the studio's usage; render query params (`metric|template|window|theme`) match the studio's `URLSearchParams`.
