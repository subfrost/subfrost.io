# OP_RETURN Charts on /data — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add the "Alkanes on-chain activity" section (9 charts from `OpReturnDaily`) to the public `/data` page, with a sampled-data methodology note.

**Architecture:** New assembler `lib/marketing/public-opreturn.ts` derives all chart series from `listOpReturnDaily()` (reusing `dayValue` from `lib/marketing/opreturn-metrics.ts` where a MetricKey exists). The `/data` RSC fetches it alongside `getPublicData()` and renders a new client component `components/data/OpReturnCharts.tsx` (recharts). No API change, no schema change.

**Tech Stack:** Next.js RSC, recharts (LineChart/AreaChart/PieChart), vitest.

**Spec:** `docs/superpowers/specs/2026-07-03-data-opreturn-charts-design.md`.

## Global Constraints

- Data ONLY from `OpReturnDaily` via the existing `listOpReturnDaily()` (`lib/marketing/opreturn-store.ts`, returns date-ascending `OpReturnRow[]`). No new ingestion, no schema change, no scanner-repo changes.
- The section renders nothing (returns null / omitted) when there are 0 rows; it must never make the page 500.
- Methodology note is REQUIRED, EN+ZH, linking `https://github.com/Vdto88/alkanes-opreturn-stats`, wording shape: "Sampled data from our open-source OP_RETURN scanner. An exact full-chain engine is in the works."
- `/api/data` and all existing `/data` behavior unchanged (metric cards, share buttons, locale, metadata).
- Visual language: same card container style as `MetricCard` (`rounded-2xl border p-6`, `var(--ed-*)` colors), accent line `#5dcaa5`, secondary series `#f0997b`.
- Percent values are fractions (0..1) in the payload; formatting to "x.xx%" happens in the client component only.
- Work in worktree `C:\Alkanes Geral Dev\wt-public-data-page`, branch `feat/data-opreturn-charts`, pnpm, PR-only.
- Allowed pre-existing test failures: 3 in tests/cms/admin-nav.test.ts + 1 in tests/cms/admin-landing.test.ts (run suite with `CI=true`).

---

### Task 1: Payload assembler — `lib/marketing/public-opreturn.ts`

**Files:**
- Create: `lib/marketing/public-opreturn.ts`
- Test: `tests/marketing/public-opreturn.test.ts`

**Interfaces:**
- Consumes: `listOpReturnDaily(): Promise<OpReturnRow[]>` from `@/lib/marketing/opreturn-store`; `dayValue(r, metric)` from `@/lib/marketing/opreturn-metrics`; `type OpReturnRow` from `@/lib/marketing/opreturn-types`.
- Produces (used by Task 2):

```ts
export interface OpReturnPoint { date: string; value: number | null }
export interface OpReturnStackedPoint { date: string; alkanes: number; rest: number }
export interface PublicOpReturnPayload {
  updatedAt: string | null      // latest row's date (YYYY-MM-DD)
  days: number
  latestDonut: { alkanes: number; other: number } | null   // latest day's OP_RETURN tx split
  lines: {
    alkanesTxShare: OpReturnPoint[]        // fraction of all BTC tx
    alkanesOpReturnShare: OpReturnPoint[]  // fraction of OP_RETURN tx
    dieselTxShare: OpReturnPoint[]         // fraction of all BTC tx
    opReturnBytesCum: OpReturnPoint[]      // cumulative bytes
    opReturnBytesPerTx: OpReturnPoint[]    // bytes per OP_RETURN tx
    feesTotalBtc: OpReturnPoint[]          // BTC per day
    alkanesFeeShare: OpReturnPoint[]       // fraction of fees
  }
  feesStacked: OpReturnStackedPoint[]      // BTC per day, alkanes + rest
}
export async function getPublicOpReturnData(): Promise<PublicOpReturnPayload>
```

- [ ] **Step 1: Write the failing test**

Create `tests/marketing/public-opreturn.test.ts`:

```ts
import { describe, it, expect, vi } from "vitest"

const store = vi.hoisted(() => ({ listOpReturnDaily: vi.fn() }))
vi.mock("@/lib/marketing/opreturn-store", () => store)

import { getPublicOpReturnData } from "@/lib/marketing/public-opreturn"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

function row(date: string, over: Partial<OpReturnRow> = {}): OpReturnRow {
  return {
    date, fromHeight: 900000, toHeight: 900100, blocksScanned: 100,
    totalTx: 300000, txWithOpReturn: 150000, txAlkanes: 24000,
    opReturnBytes: 1_500_000, runestoneBytes: 1_300_000, alkanesBytes: 500_000, dieselMints: 23000,
    feeTotalSats: 160_000_000, feeAlkanesSats: 1_600_000, feeOpReturnSats: 12_000_000, btcUsd: 60000,
    ...over,
  }
}

describe("getPublicOpReturnData", () => {
  it("derives all line series from the rows", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01"), row("2026-06-02", { txAlkanes: 30000, opReturnBytes: 2_000_000 })])
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(2)
    expect(p.updatedAt).toBe("2026-06-02")
    expect(p.lines.alkanesTxShare[0].value).toBeCloseTo(24000 / 300000, 10)
    expect(p.lines.alkanesOpReturnShare[1].value).toBeCloseTo(30000 / 150000, 10)
    expect(p.lines.dieselTxShare[0].value).toBeCloseTo(23000 / 300000, 10)
    expect(p.lines.opReturnBytesPerTx[0].value).toBeCloseTo(1_500_000 / 150000, 10)
    expect(p.lines.feesTotalBtc[0].value).toBeCloseTo(1.6, 10)
    expect(p.lines.alkanesFeeShare[0].value).toBeCloseTo(1_600_000 / 160_000_000, 10)
  })

  it("accumulates opReturnBytesCum as a running sum", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01"), row("2026-06-02", { opReturnBytes: 2_000_000 })])
    const p = await getPublicOpReturnData()
    expect(p.lines.opReturnBytesCum[0].value).toBe(1_500_000)
    expect(p.lines.opReturnBytesCum[1].value).toBe(3_500_000)
  })

  it("builds the stacked fees series and the latest-day donut", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01")])
    const p = await getPublicOpReturnData()
    expect(p.feesStacked[0]).toEqual({ date: "2026-06-01", alkanes: 1_600_000 / 1e8, rest: (160_000_000 - 1_600_000) / 1e8 })
    expect(p.latestDonut).toEqual({ alkanes: 24000, other: 150000 - 24000 })
  })

  it("yields null values where denominators are zero", async () => {
    store.listOpReturnDaily.mockResolvedValue([row("2026-06-01", { totalTx: 0, txWithOpReturn: 0, feeTotalSats: 0 })])
    const p = await getPublicOpReturnData()
    expect(p.lines.alkanesTxShare[0].value).toBeNull()
    expect(p.lines.alkanesOpReturnShare[0].value).toBeNull()
    expect(p.lines.opReturnBytesPerTx[0].value).toBeNull()
    expect(p.lines.alkanesFeeShare[0].value).toBeNull()
    expect(p.latestDonut).toBeNull() // txWithOpReturn 0 -> no meaningful donut
  })

  it("empty table: empty payload, never throws", async () => {
    store.listOpReturnDaily.mockResolvedValue([])
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(0)
    expect(p.updatedAt).toBeNull()
    expect(p.latestDonut).toBeNull()
    expect(p.lines.alkanesTxShare).toEqual([])
    expect(p.feesStacked).toEqual([])
  })

  it("store throwing: same empty payload, never throws", async () => {
    store.listOpReturnDaily.mockRejectedValue(new Error("db down"))
    const p = await getPublicOpReturnData()
    expect(p.days).toBe(0)
  })
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `pnpm vitest run tests/marketing/public-opreturn.test.ts`
Expected: FAIL — `Cannot find module '@/lib/marketing/public-opreturn'`

- [ ] **Step 3: Implement `lib/marketing/public-opreturn.ts`**

```ts
import { listOpReturnDaily } from "@/lib/marketing/opreturn-store"
import { dayValue } from "@/lib/marketing/opreturn-metrics"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

// Public OP_RETURN chart series for /data. Chart-level aggregates only —
// source is the sampled scanner CSV ingested into OpReturnDaily (see the
// methodology note rendered next to these charts).

export interface OpReturnPoint { date: string; value: number | null }
export interface OpReturnStackedPoint { date: string; alkanes: number; rest: number }

export interface PublicOpReturnPayload {
  updatedAt: string | null
  days: number
  latestDonut: { alkanes: number; other: number } | null
  lines: {
    alkanesTxShare: OpReturnPoint[]
    alkanesOpReturnShare: OpReturnPoint[]
    dieselTxShare: OpReturnPoint[]
    opReturnBytesCum: OpReturnPoint[]
    opReturnBytesPerTx: OpReturnPoint[]
    feesTotalBtc: OpReturnPoint[]
    alkanesFeeShare: OpReturnPoint[]
  }
  feesStacked: OpReturnStackedPoint[]
}

const EMPTY: PublicOpReturnPayload = {
  updatedAt: null, days: 0, latestDonut: null,
  lines: {
    alkanesTxShare: [], alkanesOpReturnShare: [], dieselTxShare: [],
    opReturnBytesCum: [], opReturnBytesPerTx: [], feesTotalBtc: [], alkanesFeeShare: [],
  },
  feesStacked: [],
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den)

export async function getPublicOpReturnData(): Promise<PublicOpReturnPayload> {
  let rows: OpReturnRow[] = []
  try {
    rows = await listOpReturnDaily()
  } catch (e) {
    console.error("[public-opreturn] series unavailable", e)
    return EMPTY
  }
  if (rows.length === 0) return EMPTY

  let cum = 0
  const opReturnBytesCum: OpReturnPoint[] = rows.map((r) => {
    cum += r.opReturnBytes
    return { date: r.date, value: cum }
  })

  const last = rows[rows.length - 1]
  const latestDonut =
    last.txWithOpReturn === 0 ? null : { alkanes: last.txAlkanes, other: last.txWithOpReturn - last.txAlkanes }

  return {
    updatedAt: last.date,
    days: rows.length,
    latestDonut,
    lines: {
      alkanesTxShare: rows.map((r) => ({ date: r.date, value: dayValue(r, "alkanesTxShare") })),
      alkanesOpReturnShare: rows.map((r) => ({ date: r.date, value: dayValue(r, "alkanesOfOpReturnShare") })),
      dieselTxShare: rows.map((r) => ({ date: r.date, value: ratio(r.dieselMints, r.totalTx) })),
      opReturnBytesCum,
      opReturnBytesPerTx: rows.map((r) => ({ date: r.date, value: ratio(r.opReturnBytes, r.txWithOpReturn) })),
      feesTotalBtc: rows.map((r) => ({ date: r.date, value: r.feeTotalSats / 1e8 })),
      alkanesFeeShare: rows.map((r) => ({ date: r.date, value: dayValue(r, "alkanesFeeShare") })),
    },
    feesStacked: rows.map((r) => ({
      date: r.date,
      alkanes: r.feeAlkanesSats / 1e8,
      rest: (r.feeTotalSats - r.feeAlkanesSats) / 1e8,
    })),
  }
}
```

- [ ] **Step 4: Run test to verify it passes**

Run: `pnpm vitest run tests/marketing/public-opreturn.test.ts`
Expected: PASS (6/6)

- [ ] **Step 5: Commit**

```bash
git add lib/marketing/public-opreturn.ts tests/marketing/public-opreturn.test.ts
git commit -m "feat(data): public OP_RETURN chart series assembler"
```

---

### Task 2: Charts section — client component + page wiring + i18n

**Files:**
- Create: `components/data/OpReturnCharts.tsx`
- Modify: `app/data/page.tsx` (fetch payload, add copy, render section)
- Test: covered by Task 1 unit tests + Step 5 build/curl below (repo convention: pages are not unit-tested)

**Interfaces:**
- Consumes: `getPublicOpReturnData`, `type PublicOpReturnPayload` (Task 1).
- Produces: `<OpReturnCharts payload={...} copy={...} />` rendered inside `/data` below the metric grid; hidden when `payload.days === 0`.

- [ ] **Step 1: Create `components/data/OpReturnCharts.tsx`**

```tsx
"use client"

import { LineChart, Line, AreaChart, Area, PieChart, Pie, Cell, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from "recharts"
import type { PublicOpReturnPayload, OpReturnPoint } from "@/lib/marketing/public-opreturn"

export interface OpReturnCopy {
  title: string
  note: string
  noteLink: string
  updated: string
  charts: {
    alkanesTxShare: string
    alkanesOpReturnShare: string
    latestDonut: string
    dieselTxShare: string
    opReturnBytesCum: string
    opReturnBytesPerTx: string
    feesTotalBtc: string
    feesStacked: string
    alkanesFeeShare: string
  }
}

const ACCENT = "#5dcaa5"
const SECOND = "#f0997b"
const HAIRLINE = "var(--ed-hairline, #22304a)"

const pct = (v: number) => `${(v * 100).toFixed(2)}%`
const btc = (v: number) => `${v.toFixed(4)} BTC`
const bytes = (v: number) => {
  if (v >= 1e9) return `${(v / 1e9).toFixed(2)} GB`
  if (v >= 1e6) return `${(v / 1e6).toFixed(2)} MB`
  if (v >= 1e3) return `${(v / 1e3).toFixed(1)} KB`
  return `${Math.round(v)} B`
}
const FORMATTERS = { pct, btc, bytes, num: (v: number) => v.toFixed(1) } as const
type Fmt = keyof typeof FORMATTERS

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div className="flex flex-col gap-3 rounded-2xl border p-6" style={{ borderColor: HAIRLINE, background: "var(--ed-card, transparent)" }}>
      <div className="text-sm" style={{ color: "var(--ed-muted)" }}>{title}</div>
      {children}
    </div>
  )
}

function LineCard({ title, series, fmt, area = false }: { title: string; series: OpReturnPoint[]; fmt: Fmt; area?: boolean }) {
  const data = series.filter((p) => p.value !== null)
  const f = FORMATTERS[fmt]
  const ChartTag = area ? AreaChart : LineChart
  return (
    <Card title={title}>
      <div className="h-[200px] w-full">
        <ResponsiveContainer width="100%" height="100%">
          <ChartTag data={data} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
            <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
            <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
            <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v: number) => f(v)} domain={["auto", "auto"]} />
            <Tooltip formatter={(v: number) => f(v)} labelStyle={{ color: "#334" }} />
            {area ? (
              <Area type="monotone" dataKey="value" stroke={ACCENT} fill={ACCENT} fillOpacity={0.18} strokeWidth={2} isAnimationActive={false} />
            ) : (
              <Line type="monotone" dataKey="value" stroke={ACCENT} strokeWidth={2} dot={false} isAnimationActive={false} />
            )}
          </ChartTag>
        </ResponsiveContainer>
      </div>
    </Card>
  )
}

export function OpReturnCharts({ payload, copy }: { payload: PublicOpReturnPayload; copy: OpReturnCopy }) {
  if (payload.days === 0) return null
  const donut = payload.latestDonut
  return (
    <section className="mt-16">
      <h2 className="text-2xl font-medium" style={{ color: "var(--ed-ink)" }}>{copy.title}</h2>
      <p className="mt-2 max-w-2xl text-sm" style={{ color: "var(--ed-muted)" }}>
        {copy.note}{" "}
        <a href="https://github.com/Vdto88/alkanes-opreturn-stats" target="_blank" rel="noopener noreferrer" className="underline">
          {copy.noteLink}
        </a>
      </p>
      <div className="mt-8 grid gap-6 md:grid-cols-2 xl:grid-cols-3">
        <LineCard title={copy.charts.alkanesTxShare} series={payload.lines.alkanesTxShare} fmt="pct" />
        <LineCard title={copy.charts.alkanesOpReturnShare} series={payload.lines.alkanesOpReturnShare} fmt="pct" />
        {donut ? (
          <Card title={copy.charts.latestDonut}>
            <div className="h-[200px] w-full">
              <ResponsiveContainer width="100%" height="100%">
                <PieChart>
                  <Pie data={[{ name: "Alkanes", value: donut.alkanes }, { name: "Other", value: donut.other }]} dataKey="value" innerRadius={55} outerRadius={80} isAnimationActive={false}>
                    <Cell fill={ACCENT} />
                    <Cell fill={HAIRLINE.startsWith("var") ? "#22304a" : HAIRLINE} />
                  </Pie>
                  <Tooltip formatter={(v: number) => v.toLocaleString("en-US")} />
                </PieChart>
              </ResponsiveContainer>
            </div>
            <div className="text-sm" style={{ color: "var(--ed-muted)" }}>
              Alkanes {pct(donut.alkanes / (donut.alkanes + donut.other))}
            </div>
          </Card>
        ) : null}
        <LineCard title={copy.charts.dieselTxShare} series={payload.lines.dieselTxShare} fmt="pct" />
        <LineCard title={copy.charts.opReturnBytesCum} series={payload.lines.opReturnBytesCum} fmt="bytes" area />
        <LineCard title={copy.charts.opReturnBytesPerTx} series={payload.lines.opReturnBytesPerTx} fmt="num" />
        <LineCard title={copy.charts.feesTotalBtc} series={payload.lines.feesTotalBtc} fmt="btc" />
        <Card title={copy.charts.feesStacked}>
          <div className="h-[200px] w-full">
            <ResponsiveContainer width="100%" height="100%">
              <AreaChart data={payload.feesStacked} margin={{ top: 8, right: 8, bottom: 0, left: 0 }}>
                <CartesianGrid strokeDasharray="3 3" strokeOpacity={0.25} />
                <XAxis dataKey="date" tick={{ fontSize: 11 }} minTickGap={40} />
                <YAxis tick={{ fontSize: 11 }} width={72} tickFormatter={(v: number) => btc(v)} />
                <Tooltip formatter={(v: number) => btc(v)} labelStyle={{ color: "#334" }} />
                <Area type="monotone" dataKey="rest" stackId="1" stroke={SECOND} fill={SECOND} fillOpacity={0.25} isAnimationActive={false} />
                <Area type="monotone" dataKey="alkanes" stackId="1" stroke={ACCENT} fill={ACCENT} fillOpacity={0.4} isAnimationActive={false} />
              </AreaChart>
            </ResponsiveContainer>
          </div>
        </Card>
        <LineCard title={copy.charts.alkanesFeeShare} series={payload.lines.alkanesFeeShare} fmt="pct" />
      </div>
      {payload.updatedAt ? (
        <div className="mt-4 text-sm" style={{ color: "var(--ed-muted)" }}>{copy.updated}: {payload.updatedAt}.</div>
      ) : null}
    </section>
  )
}
```

- [ ] **Step 2: Wire into `app/data/page.tsx`**

Three edits (keep everything else untouched):

(a) Add imports at the top:

```tsx
import { OpReturnCharts } from "@/components/data/OpReturnCharts"
import { getPublicOpReturnData } from "@/lib/marketing/public-opreturn"
```

(b) Extend the copy object — add an `opreturn` key to BOTH locales (identical shapes):

```ts
// inside copy.en:
opreturn: {
  title: "Alkanes on-chain activity",
  note: "Sampled data from our open-source OP_RETURN scanner. An exact full-chain engine is in the works.",
  noteLink: "View the scanner and raw data on GitHub.",
  updated: "Data through",
  charts: {
    alkanesTxShare: "Alkanes share of all Bitcoin transactions",
    alkanesOpReturnShare: "Alkanes share of OP_RETURN transactions",
    latestDonut: "Latest day — OP_RETURN transactions split",
    dieselTxShare: "DIESEL mints as share of all Bitcoin transactions",
    opReturnBytesCum: "OP_RETURN bytes, all time",
    opReturnBytesPerTx: "OP_RETURN bytes per transaction",
    feesTotalBtc: "Miner fee revenue per day",
    feesStacked: "Miner fees — Alkanes vs rest",
    alkanesFeeShare: "Alkanes share of miner fee revenue",
  },
},
// inside copy.zh:
opreturn: {
  title: "Alkanes 链上活动",
  note: "数据来自我们开源的 OP_RETURN 扫描器（抽样统计）。精确的全链引擎正在开发中。",
  noteLink: "在 GitHub 查看扫描器与原始数据。",
  updated: "数据截至",
  charts: {
    alkanesTxShare: "Alkanes 占全部比特币交易的份额",
    alkanesOpReturnShare: "Alkanes 占 OP_RETURN 交易的份额",
    latestDonut: "最新一天 — OP_RETURN 交易构成",
    dieselTxShare: "DIESEL 铸造占全部比特币交易的份额",
    opReturnBytesCum: "OP_RETURN 字节数（累计）",
    opReturnBytesPerTx: "每笔交易的 OP_RETURN 字节数",
    feesTotalBtc: "每日矿工手续费收入",
    feesStacked: "矿工手续费 — Alkanes 与其他",
    alkanesFeeShare: "Alkanes 占矿工手续费收入的份额",
  },
},
```

(c) In the component body, fetch both payloads in parallel (replace the single `const data = await getPublicData()` line):

```tsx
const [data, opreturn] = await Promise.all([getPublicData(), getPublicOpReturnData()])
```

and render the section after the existing metrics grid `</section>`, before the `<footer>`:

```tsx
<OpReturnCharts payload={opreturn} copy={c.opreturn} />
```

- [ ] **Step 3: Typecheck + full suite**

Run: `npx tsc --noEmit && CI=true pnpm vitest run 2>&1 | tail -4`
Expected: tsc 0; only the 4 allow-listed pre-existing failures.

- [ ] **Step 4: Build + render check**

Run: `rm -rf .next && pnpm next build 2>&1 | tail -20`
Expected: routes compile (`/data` present). The Windows standalone-symlink EPERM failure at the very end is a known environmental issue — compilation succeeding is the signal; CI Linux is the build gate.

Then `pnpm next start -p 3100`, and:

```bash
curl -s http://localhost:3100/data | grep -c "Alkanes on-chain activity"   # 1 (section SSR'd; local DB down -> section hidden is ALSO acceptable: if DB unreachable expect 0 and note it in the report)
curl -s -o /dev/null -w "%{http_code}\n" "http://localhost:3100/data?lang=zh"  # 200
```

Kill the server after (find PID via `netstat -ano | grep 3100`).

- [ ] **Step 5: Commit**

```bash
git add components/data/OpReturnCharts.tsx app/data/page.tsx
git commit -m "feat(data): Alkanes on-chain activity section — 9 OP_RETURN charts + methodology note"
```

---

### Task 3: Gates, push, PR

- [ ] **Step 1: Final gates**

Run: `npx tsc --noEmit && CI=true pnpm vitest run 2>&1 | tail -4`
Expected: tsc 0; only the 4 known failures.

- [ ] **Step 2: Push (embedded token — plain push hangs on this machine)**

```bash
TOKEN=$(gh auth token)
git push "https://x-access-token:${TOKEN}@github.com/subfrost/subfrost.io.git" feat/data-opreturn-charts
```

- [ ] **Step 3: PR**

```bash
gh pr create --repo subfrost/subfrost.io --base main --head feat/data-opreturn-charts \
  --title "feat: OP_RETURN activity charts on /data" \
  --body "Implements docs/superpowers/specs/2026-07-03-data-opreturn-charts-design.md (plan: docs/superpowers/plans/2026-07-03-data-opreturn-charts.md).

- New 'Alkanes on-chain activity' section on /data: 9 charts derived from the existing OpReturnDaily table (~187 days) — tx share, OP_RETURN share, latest-day donut, DIESEL share, cumulative bytes, bytes/tx, daily fees, fees Alkanes-vs-rest (stacked), fee share.
- Methodology note (EN/ZH) linking the open-source scanner; decision record in the spec: Vitor approved publishing chart-level sampled aggregates with the note.
- No schema change, no API change, no new ingestion. Section hides itself if the table is empty; never 500s.
- Skipped (source CSV lacks columns): block-space-by-weight and UNCOMMON•GOODS charts — join when the exact engine exports them.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Verify CI** — green except the 4 allow-listed Test failures.
