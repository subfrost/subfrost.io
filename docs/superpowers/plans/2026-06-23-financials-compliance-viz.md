# Financials + Compliance Visualizations Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a spend-over-time chart to the Accounting Reports tab and an at-a-glance status-count strip to the MTL compliance page — both over data the pages already hold.

**Architecture:** Presentational React components fed by existing data, plus one pure MTL counts helper. Uses recharts 2.15.0 + `components/ui/chart.tsx` (already in the repo). No schema, no server actions, no new dependencies.

**Tech Stack:** React (client components), TypeScript, Tailwind, recharts + shadcn chart wrapper, Vitest + @testing-library/react.

## Global Constraints

- **No schema change, no migration, no new server action, no new dependency** (recharts + `components/ui/chart.tsx` already exist).
- **Gates unchanged** — both pages are already gated (Reports inside `AccountingManager`/`financials.view`; MTL page behind `aml.read`).
- **recharts `ResponsiveContainer` renders no measurable SVG under jsdom** — do NOT assert chart SVG in tests; test the empty→null branch and the pure data only, and mock the chart in the AccountingManager integration test.
- **Single source of truth for the MTL status palette** — promote `STATUS_CLS` out of `MtlManager` into `lib/mtl/schema.ts` as `MTL_STATUS_CLS`; both consumers import it.
- **Code/UI in English; commit messages end with** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Verification gates (before each TS commit):** `npx tsc --noEmit` 0, `CI=true npx vitest run <files>` green. Full suite + `npx next build` at the end (Task 3).
- **branch → PR → merge, never main direct.** Branch `feat/financials-compliance-viz` (on latest main `4488c08`, incl. flex's #56 — no overlap).

---

### Task 1: MTL status summary

**Files:**
- Modify: `lib/mtl/schema.ts` (add `MTL_STATUS_CLS` after `MTL_STATUS_LABELS` ~16; add `mtlStatusCounts` at end)
- Create: `components/cms/MtlStatusSummary.tsx`
- Modify: `components/cms/MtlManager.tsx` (remove local `STATUS_CLS` ~27-34; import the shared one; render the summary in the main `return` ~131)
- Test: `tests/cms/mtl-summary.test.tsx`

**Interfaces:**
- Consumes: `MTL_STATUSES`, `MTL_STATUS_LABELS` (existing in `lib/mtl/schema.ts`); `MtlRow` (type, from `lib/mtl/admin.ts`).
- Produces: `mtlStatusCounts(entries: { status: string }[]): Record<string, number>`; `MTL_STATUS_CLS: Record<MtlStatusValue, string>`; `MtlStatusSummary({ entries: MtlRow[] })`.

- [ ] **Step 1: Write the failing tests**

Create `tests/cms/mtl-summary.test.tsx`:

```tsx
import { describe, it, expect, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { mtlStatusCounts } from "@/lib/mtl/schema"
import { MtlStatusSummary } from "@/components/cms/MtlStatusSummary"
import type { MtlRow } from "@/lib/mtl/admin"

const row = (over: Partial<MtlRow>): MtlRow => ({
  state: "CA", name: "California", status: "NOT_YET_NEEDED", nextFilingDue: null,
  portalUrl: null, notes: null, updatedAt: "2026-01-01T00:00:00.000Z", ...over,
})

beforeEach(() => cleanup())

describe("mtlStatusCounts", () => {
  it("zero-fills every status and counts a mixed set", () => {
    const c = mtlStatusCounts([{ status: "REGISTERED" }, { status: "REGISTERED" }, { status: "NEEDS_FILING" }, { status: "EXEMPT" }])
    expect(c.REGISTERED).toBe(2)
    expect(c.NEEDS_FILING).toBe(1)
    expect(c.EXEMPT).toBe(1)
    expect(c.AGENT_OF_STRIPE).toBe(0)
    expect(c.NOT_YET_NEEDED).toBe(0)
    expect(c.FILED_PENDING).toBe(0)
  })
  it("counts an unknown status too", () => {
    expect(mtlStatusCounts([{ status: "WEIRD" }]).WEIRD).toBe(1)
  })
})

describe("MtlStatusSummary", () => {
  it("renders a chip per status with its count", () => {
    const { getByText } = render(
      <MtlStatusSummary entries={[row({ status: "REGISTERED" }), row({ status: "REGISTERED" }), row({ status: "NEEDS_FILING" })]} />,
    )
    // all six labels present
    for (const label of ["Agent of Stripe", "Registered", "Filed — pending", "Exempt", "Not yet needed", "Needs filing"]) {
      expect(getByText(label)).toBeTruthy()
    }
    expect(getByText("2")).toBeTruthy() // REGISTERED count
    expect(getByText("1")).toBeTruthy() // NEEDS_FILING count
  })
})
```

- [ ] **Step 2: Run the tests — verify they fail**

Run: `CI=true npx vitest run tests/cms/mtl-summary.test.tsx`
Expected: FAIL — `mtlStatusCounts` and `MtlStatusSummary` are not exported/do not exist.

- [ ] **Step 3: Add `MTL_STATUS_CLS` + `mtlStatusCounts` to `lib/mtl/schema.ts`**

After the `MTL_STATUS_LABELS` block, add:

```ts
// Shared status → badge classes (single source of truth; consumed by MtlManager
// and MtlStatusSummary).
export const MTL_STATUS_CLS: Record<MtlStatusValue, string> = {
  AGENT_OF_STRIPE: "bg-blue-950/50 text-blue-300 border-blue-800/50",
  REGISTERED: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  FILED_PENDING: "bg-amber-950/50 text-amber-300 border-amber-800/50",
  EXEMPT: "bg-zinc-800 text-zinc-400 border-zinc-700",
  NOT_YET_NEEDED: "bg-zinc-800 text-zinc-500 border-zinc-700",
  NEEDS_FILING: "bg-red-950/50 text-red-300 border-red-800/50",
}
```

At the end of the file, add:

```ts
/** Count entries per status. Every MTL_STATUSES key is present (0 when none);
 *  an unknown status is still counted under its own key. Pure / DB-free. */
export function mtlStatusCounts(entries: { status: string }[]): Record<string, number> {
  const counts: Record<string, number> = {}
  for (const s of MTL_STATUSES) counts[s] = 0
  for (const e of entries) counts[e.status] = (counts[e.status] ?? 0) + 1
  return counts
}
```

- [ ] **Step 4: Create `components/cms/MtlStatusSummary.tsx`**

```tsx
"use client"

import { MTL_STATUSES, MTL_STATUS_LABELS, MTL_STATUS_CLS, mtlStatusCounts } from "@/lib/mtl/schema"
import type { MtlRow } from "@/lib/mtl/admin"

/** At-a-glance MTL licensing posture: one chip per status with its count,
 *  in the shared status palette. Presentational — pass all entries. */
export function MtlStatusSummary({ entries }: { entries: MtlRow[] }) {
  const counts = mtlStatusCounts(entries)
  return (
    <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-6">
      {MTL_STATUSES.map((s) => (
        <div key={s} className={`rounded-lg border px-3 py-2 ${MTL_STATUS_CLS[s]}`}>
          <div className="text-xl font-bold">{counts[s] ?? 0}</div>
          <div className="text-xs opacity-80">{MTL_STATUS_LABELS[s]}</div>
        </div>
      ))}
    </div>
  )
}
```

- [ ] **Step 5: Wire into `MtlManager.tsx` + dedupe the palette**

Remove the local `STATUS_CLS` const (the `const STATUS_CLS: Record<string, string> = { ... }` block, ~lines 27-34). Add to the imports near the top (the existing `import { MTL_STATUSES, MTL_STATUS_LABELS } from "@/lib/mtl/schema"` line — extend it, and alias the palette to keep existing usages):

```ts
import { MTL_STATUSES, MTL_STATUS_LABELS, MTL_STATUS_CLS as STATUS_CLS } from "@/lib/mtl/schema"
import { MtlStatusSummary } from "@/components/cms/MtlStatusSummary"
```

(If `MTL_STATUSES` is not currently imported there, just add the names that are missing — the existing line imports `MTL_STATUSES, MTL_STATUS_LABELS`.) The existing `STATUS_CLS[draft.status]` usage (~line 159) keeps working via the alias.

In the **main `return`** (the one starting `~line 131` with `<div className="space-y-4">`, NOT the empty-state return), insert the summary as the first child, right after the opening `<div className="space-y-4">`:

```tsx
  return (
    <div className="space-y-4">
      <MtlStatusSummary entries={rows} />
      <div className="flex flex-wrap items-center gap-3">
```

(`entries={rows}` — the full set, not the search-filtered `visible`, so the summary always reflects all 51 jurisdictions.)

- [ ] **Step 6: Run the tests + tsc — verify green**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/cms/mtl-summary.test.tsx`
Expected: tsc 0; PASS.

- [ ] **Step 7: Commit**

```bash
git add lib/mtl/schema.ts components/cms/MtlStatusSummary.tsx components/cms/MtlManager.tsx tests/cms/mtl-summary.test.tsx
git commit -m "feat(compliance): MTL status-count summary strip + shared status palette

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Period Reports chart

**Files:**
- Create: `components/cms/financials/PeriodReportChart.tsx`
- Modify: `components/cms/financials/AccountingManager.tsx` (import + render the chart in `ReportsView`, above the period table)
- Test: `tests/financials/period-report-chart.test.tsx` (new); `tests/financials/accounting-ui.test.tsx` (mock the chart)

**Interfaces:**
- Consumes: `PeriodTotals` (from `lib/financials/accounting/shapes.ts`); `ChartContainer`, `ChartTooltip`, `ChartTooltipContent`, `type ChartConfig` (from `components/ui/chart.tsx`); recharts `ComposedChart`/`Bar`/`Line`/`XAxis`/`YAxis`/`CartesianGrid`.
- Produces: `PeriodReportChart({ rows: PeriodTotals[] })` — returns `null` when `rows` is empty.

- [ ] **Step 1: Write the failing chart test**

Create `tests/financials/period-report-chart.test.tsx`:

```tsx
import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { PeriodReportChart } from "@/components/cms/financials/PeriodReportChart"

describe("PeriodReportChart", () => {
  it("renders nothing when there are no periods", () => {
    const { container } = render(<PeriodReportChart rows={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
```

(The non-empty render path uses recharts' `ResponsiveContainer`, which produces no measurable SVG under jsdom and logs width/height warnings — so it is intentionally not exercised in tests. The chart's data comes from the already-tested `totalsByPeriod`.)

- [ ] **Step 2: Run the test — verify it fails**

Run: `CI=true npx vitest run tests/financials/period-report-chart.test.tsx`
Expected: FAIL — the module does not exist.

- [ ] **Step 3: Create `components/cms/financials/PeriodReportChart.tsx`**

```tsx
"use client"

import { Bar, CartesianGrid, ComposedChart, Line, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { PeriodTotals } from "@/lib/financials/accounting/shapes"

const config: ChartConfig = {
  issuedUsd: { label: "Issued (USD)", color: "#38bdf8" }, // sky-400
  paidUsd: { label: "Paid (USD)", color: "#34d399" }, // emerald-400
  dieselPaid: { label: "DIESEL paid", color: "#fb923c" }, // orange-400
}

/** Spend-over-time for the 409A: grouped USD bars (issued vs paid) on the left
 *  axis + a DIESEL line on a secondary right axis (token is a different unit).
 *  Presentational — pass the period rows; chart reads oldest→newest. */
export function PeriodReportChart({ rows }: { rows: PeriodTotals[] }) {
  if (rows.length === 0) return null
  const data = [...rows].reverse() // rows are newest-first; chart reads chronological
  return (
    <ChartContainer config={config} className="h-[260px] w-full">
      <ComposedChart data={data}>
        <CartesianGrid vertical={false} />
        <XAxis dataKey="period" tickLine={false} axisLine={false} />
        <YAxis
          yAxisId="usd"
          tickLine={false}
          axisLine={false}
          width={64}
          tickFormatter={(v) => `$${Number(v).toLocaleString("en-US")}`}
        />
        <YAxis yAxisId="diesel" orientation="right" tickLine={false} axisLine={false} width={56} />
        <ChartTooltip content={<ChartTooltipContent />} />
        <Bar yAxisId="usd" dataKey="issuedUsd" fill="var(--color-issuedUsd)" radius={3} />
        <Bar yAxisId="usd" dataKey="paidUsd" fill="var(--color-paidUsd)" radius={3} />
        <Line yAxisId="diesel" type="monotone" dataKey="dieselPaid" stroke="var(--color-dieselPaid)" strokeWidth={2} dot={false} />
      </ComposedChart>
    </ChartContainer>
  )
}
```

- [ ] **Step 4: Run the chart test — verify it passes**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/financials/period-report-chart.test.tsx`
Expected: tsc 0; PASS.

- [ ] **Step 5: Render the chart in `ReportsView` + mock it in the integration test**

In `components/cms/financials/AccountingManager.tsx`, add the import near the top (with the other component/shape imports):

```ts
import { PeriodReportChart } from "@/components/cms/financials/PeriodReportChart"
```

In `ReportsView`, render the chart above the period table — between the controls row (granularity + payee filter + Export) and the `{rows.length === 0 ? <Empty>… table}` block:

```tsx
      <PeriodReportChart rows={rows} />
```

In `tests/financials/accounting-ui.test.tsx`, add a mock alongside the existing `vi.mock("@/actions/cms/accounting", …)` so the Reports-tab test renders no recharts:

```ts
vi.mock("@/components/cms/financials/PeriodReportChart", () => ({
  PeriodReportChart: () => null,
}))
```

- [ ] **Step 6: Run both financials UI tests + tsc — verify green**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/financials/period-report-chart.test.tsx tests/financials/accounting-ui.test.tsx`
Expected: tsc 0; PASS (the existing Reports-tab test still passes with the chart mocked).

- [ ] **Step 7: Commit**

```bash
git add components/cms/financials/PeriodReportChart.tsx components/cms/financials/AccountingManager.tsx tests/financials/period-report-chart.test.tsx tests/financials/accounting-ui.test.tsx
git commit -m "feat(financials): spend-over-time chart on the Reports tab (USD bars + DIESEL line)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Full verification + branch finish

**Files:** none (verification + PR).

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0; vitest all green (existing + new); `next build` 0 errors (confirms recharts compiles into the `/admin/financials/accounting` and `/admin/mtl` routes).

- [ ] **Step 2: Confirm no stray changes**

Run: `git status -s` (only `.claude/`, `.npmrc`, `.superpowers/` untracked — never staged) and `git diff main --stat` (only `lib/mtl/schema.ts`, `MtlManager.tsx`, `MtlStatusSummary.tsx`, `PeriodReportChart.tsx`, `AccountingManager.tsx`, the two new tests + the accounting-ui test, and the spec/plan docs).

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/financials-compliance-viz
gh pr create --base main --title "Financials + Compliance: charts" --body "Spend-over-time chart on the Accounting Reports tab (USD bars + DIESEL line, dual axis) + an MTL status-count summary strip. Presentational over existing data + a pure MTL counts helper; recharts/chart.tsx already in repo. No schema, no server action. See docs/superpowers/plans/2026-06-23-financials-compliance-viz.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Use the finishing-a-development-branch skill** for merge + deploy (human-owned: merge → Cloud Build short-sha → bump `newTag` via PR → Flux; in-place rollout strategy currently in effect).

---

## Notes for the implementer

- The MTL summary uses `entries={rows}` (all 51), not the search-filtered `visible` — the at-a-glance posture should not change as you type in the search box.
- The chart's `var(--color-issuedUsd)` etc. are set by `ChartContainer` from the `config` colors — that's the shadcn wrapper convention; don't hardcode the hex on the `Bar`/`Line` directly.
- Do NOT add assertions on the chart's rendered SVG — recharts needs real layout dimensions that jsdom doesn't provide. The empty→null test + the mocked integration test are the intended coverage.
- CI "Test" job can flake — re-run if a transient failure appears.
```
