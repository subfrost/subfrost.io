# Financials + Compliance — Visualizations (design)

Date: 2026-06-23
Status: approved (brainstorming) — pending spec review
Branch: `feat/financials-compliance-viz`

## Context

Two small, contained visualizations to make the admin read better — both over data already
loaded by their pages, both using primitives already in the repo (recharts 2.15.0 +
`components/ui/chart.tsx`, the existing badge palettes). No new server actions, no schema.

1. **Period Reports chart** — turns the Reports tab's period table (shipped in the prior front)
   into a spend-over-time visual for the 409A.
2. **MTL status summary** — an at-a-glance "where do we stand on money-transmitter licensing
   across the US" strip on the MTL compliance page.

## Decisions (locked during brainstorming)

1. **Period chart = composed, dual-axis.** Grouped bars `issuedUsd` vs `paidUsd` on the left Y
   (USD/fiat) + a `dieselPaid` **line on a secondary right Y** (DIESEL/token). DIESEL gets its
   own axis because it is a different unit from USD — and because DIESEL is the real payment
   method, the line keeps it prominent and readable instead of flattened against USD bars.
2. **X axis chronological** (oldest→newest). The table is newest-first, so the chart consumes
   the same `rows` reversed.
3. **Chart reacts to the existing granularity toggle + payee filter** (same `rows` the table
   uses). Tooltip shows all three series. No rows → render nothing.
4. **MTL summary = non-interactive status chips.** One card per status with its count, in the
   existing badge colors. Clicking-to-filter is out of scope (possible later upgrade).
5. **Scope: Financials period chart + MTL summary only.** KYC chart deferred (the table is
   essentially empty today — intakes only just started via webhooks). Billing charts deferred
   (larger effort). US choropleth map deferred (needs states geo + a map lib).

## Architecture

Presentational components fed by data the pages already hold; one pure helper for the MTL
counts (DB-free, unit-tested). No server actions, no schema, no new data fetching.

- **Period chart** is pure presentation over `PeriodTotals[]` (produced by the already-tested
  `totalsByPeriod`). The only transform is reversing for chronological order — trivial, done at
  the call site. recharts' `ResponsiveContainer` renders nothing measurable under jsdom, so the
  chart's SVG is not unit-asserted; its data correctness is already covered by the
  `totalsByPeriod` tests, and the integration test mocks the chart to stay clean.
- **MTL summary** splits into a pure counts function (testable) + a presentational chips
  component (testable with fixtures, no action mocking needed).

## Components / data flow

### 1. Period Reports chart

**`components/cms/financials/PeriodReportChart.tsx`** (new, client):
- Props: `{ rows: PeriodTotals[] }`.
- If `rows.length === 0` → return `null`.
- Renders a recharts `ComposedChart` inside the shadcn `ChartContainer` (from
  `components/ui/chart.tsx`) over `[...rows].reverse()` (chronological):
  - `XAxis dataKey="period"`.
  - Left `YAxis` (USD): `Bar dataKey="issuedUsd"` + `Bar dataKey="paidUsd"` (grouped).
  - Right `YAxis yAxisId="diesel"` (DIESEL): `Line dataKey="dieselPaid"`.
  - `ChartTooltip` / `ChartTooltipContent`; a `ChartConfig` labels the three series (Issued USD,
    Paid USD, DIESEL paid) with theme colors (CSS-var driven, per the chart wrapper).
- No data fetching; purely the `rows` passed in.

**`components/cms/financials/AccountingManager.tsx`** — in `ReportsView`, render
`<PeriodReportChart rows={rows} />` above the existing period table (same `rows` already
computed from `totalsByPeriod(filtered, payments, granularity)`).

### 2. MTL status summary

**`lib/mtl/schema.ts`** — add a pure helper (the file already holds `MTL_STATUSES` +
`MTL_STATUS_LABELS`, no Prisma):

```ts
export function mtlStatusCounts(entries: { status: string }[]): Record<string, number>
// every status in MTL_STATUSES is present as a key (0 when none), plus any unknown status seen
```

**`components/cms/MtlStatusSummary.tsx`** (new, client, presentational):
- Props: `{ entries: MtlRow[] }`.
- Computes `mtlStatusCounts(entries)`; renders one chip/card per status in `MTL_STATUSES` order,
  showing `MTL_STATUS_LABELS[status]` + the count, colored with the existing MTL status palette
  (the `STATUS_CLS` map currently local to `MtlManager` — promote it to a shared export so both
  use one source of truth).

**`components/cms/MtlManager.tsx`** — render `<MtlStatusSummary entries={rows} />` above the
table; export the `STATUS_CLS` palette (or move it next to `MtlStatusSummary`) so it is shared,
not duplicated.

## Testing

- `tests/cms/mtl-summary.test.tsx` (new):
  - `mtlStatusCounts`: every `MTL_STATUSES` key present (0 when absent); counts correct across a
    mixed fixture; an unknown status still counted.
  - `MtlStatusSummary`: renders a chip per status with the right count from a fixture.
- `tests/financials/accounting-ui.test.tsx` — `vi.mock` `PeriodReportChart` to a stub so the
  existing Reports-tab test stays focused on table/filter behavior and free of recharts/jsdom
  noise. (The chart is presentational; its data comes from the already-tested `totalsByPeriod`.)

## Verification

`npx tsc --noEmit` 0 · `CI=true npx vitest run tests/financials tests/cms/mtl-summary.test.tsx`
green · `npx next build` 0 (confirms recharts compiles into the route). Live (post-deploy):
Reports tab shows the chart reacting to granularity + payee filter; MTL page shows the status
chips summing to 51.

## Constraints / gotchas (honored)

- No schema change, no migration, no new server action. Gates unchanged (both pages already
  gated — Reports inside `AccountingManager`/`financials.view`; MTL inside the `aml.read` page).
- `recharts` (2.15.0) and `components/ui/chart.tsx` already exist — no new dependency.
- recharts `ResponsiveContainer` does not render measurable SVG under jsdom — do not assert chart
  SVG; mock the chart in the integration test.
- branch → PR → merge, never main direct. Deploy: merge → Cloud Build (short-sha) → bump `newTag`
  via PR → Flux (in-place rollout strategy currently in effect). Branch is on latest main
  (`4488c08`, incl. flex's #56 blog redesign — no overlap with MTL/Reports).
