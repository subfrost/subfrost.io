# Financials › Period Reports Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add a "Reports" tab to the Accounting page showing issued USD + paid USD + DIESEL paid per month/quarter/year, with a payee filter and CSV export — for the 409A.

**Architecture:** All client-side over the data `AccountingManager` already loads (`accountingOverviewAction`). Enrich the orphaned pure `totalsByPeriod` aggregator in `shapes.ts`, add a pure `periodReportCsv`, and render a `ReportsView` sub-component in `AccountingManager`. No schema change, no new server action.

**Tech Stack:** React (client component), TypeScript, Tailwind, Vitest + @testing-library/react. Pure functions in `lib/financials/accounting/shapes.ts`.

## Global Constraints

- **No schema change, no migration, no new server action** — the Reports view computes in the browser from the already-loaded overview data.
- **Gate is unchanged** — the tab lives inside the already-gated `AccountingManager` (`FINANCIALS_PRIVILEGE`).
- **Single date axis = invoice `issuedAt`**; `dieselPaid` sums payments linked to invoices issued in the period.
- **Verification gates (before each TS commit):** `npx tsc --noEmit` 0, `CI=true npx vitest run <files>` green. Full suite + `npx next build` at the end (Task 3).
- **Code/UI in English; commit messages end with** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **branch → PR → merge, never main direct.** Branch `feat/financials-period-reports` (already created off main@32bee3d).

---

### Task 1: Enrich `totalsByPeriod` + add `periodReportCsv` (pure)

**Files:**
- Modify: `lib/financials/accounting/shapes.ts` (`PeriodTotals` ~96-100, `totalsByPeriod` ~110-122; add `periodReportCsv` after `toCsv`)
- Test: `tests/financials/accounting-shapes.test.ts` (the `periodKey / totalsByPeriod` describe ~41-52; add a `periodReportCsv` describe; import line ~2-5)

**Interfaces:**
- Consumes: `InvoiceRow`, `PaymentRow`, `PeriodGranularity`, `periodKey`, `round2`, `csvEscape` (all already in `shapes.ts`).
- Produces:
  - `PeriodTotals = { period: string; invoiceCount: number; issuedUsd: number; paidUsd: number; dieselPaid: number }`
  - `totalsByPeriod(invoices: InvoiceRow[], payments: PaymentRow[], g: PeriodGranularity): PeriodTotals[]` (newest period first)
  - `periodReportCsv(rows: PeriodTotals[]): string`

- [ ] **Step 1: Rewrite the failing tests**

In `tests/financials/accounting-shapes.test.ts`, add `periodReportCsv` to the existing top-of-file import from `@/lib/financials/accounting/shapes`. Then **replace** the existing `describe("periodKey / totalsByPeriod", ...)` block (it currently asserts the old `{ period, invoiceCount, totalUsd }` shape) with:

```ts
describe("periodKey / totalsByPeriod", () => {
  it("formats month, quarter, year keys (UTC)", () => {
    expect(periodKey("2026-02-10T00:00:00.000Z", "month")).toBe("2026-02")
    expect(periodKey("2026-05-20T00:00:00.000Z", "quarter")).toBe("2026-Q2")
    expect(periodKey("2026-05-20T00:00:00.000Z", "year")).toBe("2026")
  })
  it("aggregates issued/paid USD + DIESEL by month, newest first", () => {
    const rows = totalsByPeriod(invoices, payments, "month")
    expect(rows.map((r) => r.period)).toEqual(["2026-05", "2026-02"])
    // 2026-05: i2 (OPEN $500) + i3 (PAID $2000); p2 (4 DIESEL → i3)
    expect(rows[0]).toEqual({ period: "2026-05", invoiceCount: 2, issuedUsd: 2500, paidUsd: 2000, dieselPaid: 4 })
    // 2026-02: i1 (PAID $1000); p1 (2 DIESEL → i1)
    expect(rows[1]).toEqual({ period: "2026-02", invoiceCount: 1, issuedUsd: 1000, paidUsd: 1000, dieselPaid: 2 })
  })
  it("collapses to one row under year granularity", () => {
    expect(totalsByPeriod(invoices, payments, "year")).toEqual([
      { period: "2026", invoiceCount: 3, issuedUsd: 3500, paidUsd: 3000, dieselPaid: 6 },
    ])
  })
  it("respects a pre-filtered payee set (other payees' DIESEL excluded)", () => {
    const pe1 = invoices.filter((i) => i.payeeId === "pe1") // i1 (Feb, PAID, p1=2) + i2 (May, OPEN)
    expect(totalsByPeriod(pe1, payments, "month")).toEqual([
      { period: "2026-05", invoiceCount: 1, issuedUsd: 500, paidUsd: 0, dieselPaid: 0 },
      { period: "2026-02", invoiceCount: 1, issuedUsd: 1000, paidUsd: 1000, dieselPaid: 2 },
    ])
  })
})

describe("periodReportCsv", () => {
  it("emits a header + one row per period", () => {
    const csv = periodReportCsv(totalsByPeriod(invoices, payments, "month"))
    const lines = csv.split("\n")
    expect(lines[0]).toBe("Period,Invoices,Issued USD,Paid USD,DIESEL Paid")
    expect(lines).toHaveLength(3) // header + 2 periods
    expect(lines[1]).toBe("2026-05,2,2500,2000,4")
  })
})
```

(The top-of-file fixtures `invoices` [i1 Feb/PAID/$1000/pe1, i2 May/OPEN/$500/pe1, i3 May/PAID/$2000/pe2] and `payments` [p1→i1 2 DIESEL, p2→i3 4 DIESEL, p3 unlinked 1.5] already exist — reuse them.)

- [ ] **Step 2: Run the tests — verify they fail**

Run: `CI=true npx vitest run tests/financials/accounting-shapes.test.ts`
Expected: FAIL — old `totalsByPeriod` takes `(invoices, g)` and returns `totalUsd`; `periodReportCsv` is not exported.

- [ ] **Step 3: Implement in `shapes.ts`**

Replace the `PeriodTotals` interface and the `totalsByPeriod` function with:

```ts
export interface PeriodTotals {
  period: string // "2026-06" | "2026-Q2" | "2026"
  invoiceCount: number
  issuedUsd: number // Σ amountUsd of invoices issued in the period (any status)
  paidUsd: number // Σ amountUsd of those whose status === "PAID"
  dieselPaid: number // Σ amountDiesel of payments linked to those invoices
}

export function totalsByPeriod(
  invoices: InvoiceRow[],
  payments: PaymentRow[],
  g: PeriodGranularity,
): PeriodTotals[] {
  const acc = new Map<string, { invoiceCount: number; issuedUsd: number; paidUsd: number; dieselPaid: number }>()
  const invoicePeriod = new Map<string, string>() // invoiceId -> period key
  for (const i of invoices) {
    const k = periodKey(i.issuedAt, g)
    invoicePeriod.set(i.id, k)
    const cur = acc.get(k) ?? { invoiceCount: 0, issuedUsd: 0, paidUsd: 0, dieselPaid: 0 }
    cur.invoiceCount += 1
    cur.issuedUsd += i.amountUsd
    if (i.status === "PAID") cur.paidUsd += i.amountUsd
    acc.set(k, cur)
  }
  for (const p of payments) {
    if (!p.invoiceId) continue
    const k = invoicePeriod.get(p.invoiceId)
    if (!k) continue
    const cur = acc.get(k)
    if (cur) cur.dieselPaid += p.amountDiesel
  }
  return [...acc.entries()]
    .map(([period, v]) => ({
      period,
      invoiceCount: v.invoiceCount,
      issuedUsd: round2(v.issuedUsd),
      paidUsd: round2(v.paidUsd),
      dieselPaid: round2(v.dieselPaid),
    }))
    .sort((a, b) => (a.period < b.period ? 1 : -1)) // newest first
}
```

Then add, after the `toCsv` function (end of file):

```ts
const PERIOD_CSV_HEADER = ["Period", "Invoices", "Issued USD", "Paid USD", "DIESEL Paid"]

export function periodReportCsv(rows: PeriodTotals[]): string {
  const lines = [PERIOD_CSV_HEADER.join(",")]
  for (const r of rows) {
    lines.push(
      [csvEscape(r.period), String(r.invoiceCount), String(r.issuedUsd), String(r.paidUsd), String(r.dieselPaid)].join(","),
    )
  }
  return lines.join("\n")
}
```

- [ ] **Step 4: Run the tests — verify they pass**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/financials/accounting-shapes.test.ts`
Expected: tsc 0; PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/financials/accounting/shapes.ts tests/financials/accounting-shapes.test.ts
git commit -m "feat(financials): enrich totalsByPeriod (issued/paid USD + DIESEL) + periodReportCsv

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Reports tab + `ReportsView` in `AccountingManager`

**Files:**
- Modify: `components/cms/financials/AccountingManager.tsx` (shapes import ~9-12; `View` type ~25; tab list ~101; render section ~128-227; add `ReportsView` near the other table sub-components)
- Test: `tests/financials/accounting-ui.test.tsx`

**Interfaces:**
- Consumes: `totalsByPeriod`, `periodReportCsv`, `PeriodGranularity` from `shapes.ts` (Task 1); existing `usd`, `dsl`, `Toolbtn`, `Empty`, `PayeeRow`, `InvoiceRow`, `PaymentRow`.
- Produces: a `"reports"` view tab rendering `ReportsView`.

- [ ] **Step 1: Write the failing UI test**

In `tests/financials/accounting-ui.test.tsx`, add (it already imports `render, cleanup, fireEvent` and has `payee`/`invoice`/`ok` factories):

```ts
it("Reports tab: shows periods, year granularity collapses, payee filter restricts", () => {
  const inv = [
    invoice({ id: "i1", ref: "INV-1", payeeId: "pe1", amountUsd: 1000, issuedAt: "2026-02-10T00:00:00.000Z", status: "PAID" }),
    invoice({ id: "i2", ref: "INV-2", payeeId: "pe2", amountUsd: 500, issuedAt: "2026-05-01T00:00:00.000Z", status: "OPEN" }),
  ]
  const { getByText, getByRole, queryByText } = render(
    <AccountingManager initial={ok({ payees: [payee({ id: "pe1", name: "Ada" }), payee({ id: "pe2", name: "Acme" })], invoices: inv })} />,
  )
  fireEvent.click(getByText("Reports"))
  expect(getByText("2026-02")).toBeTruthy()
  expect(getByText("2026-05")).toBeTruthy()

  fireEvent.click(getByText("Year"))
  expect(getByText("2026")).toBeTruthy()
  expect(queryByText("2026-02")).toBeNull()

  fireEvent.click(getByText("Month"))
  fireEvent.change(getByRole("combobox"), { target: { value: "pe1" } }) // only the Feb (pe1) invoice
  expect(getByText("2026-02")).toBeTruthy()
  expect(queryByText("2026-05")).toBeNull()
})
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `CI=true npx vitest run tests/financials/accounting-ui.test.tsx`
Expected: FAIL — there is no "Reports" tab (`getByText("Reports")` throws).

- [ ] **Step 3: Implement the tab + `ReportsView`**

In `components/cms/financials/AccountingManager.tsx`:

(a) Extend the shapes import to add `totalsByPeriod, periodReportCsv, type PeriodGranularity`:

```ts
import {
  totalsByPayee, totalsByPeriod, periodReportCsv, type InvoiceRow, type InvoiceStatus,
  type PayeeRow, type PayeeType, type PaymentRow, type PeriodGranularity,
} from "@/lib/financials/accounting/shapes"
```

(b) Add `"reports"` to the `View` type:

```ts
type View = "invoices" | "payees" | "payments" | "reports"
```

(c) Add `"reports"` to the tab list (the `(["invoices", "payees", "payments"] as View[]).map(...)` line):

```ts
        {(["invoices", "payees", "payments", "reports"] as View[]).map((v) => (
```

(d) Add the render branch after the `view === "payments"` block (before the closing `</div>` of the outer wrapper):

```tsx
      {view === "reports" ? <ReportsView payees={payees} invoices={invoices} payments={payments} /> : null}
```

(e) Add the `ReportsView` sub-component (near the other sub-components like `UnlinkedRow`):

```tsx
function ReportsView({ payees, invoices, payments }: {
  payees: PayeeRow[]; invoices: InvoiceRow[]; payments: PaymentRow[]
}) {
  const [granularity, setGranularity] = useState<PeriodGranularity>("month")
  const [payeeId, setPayeeId] = useState("") // "" = all payees
  const filtered = payeeId ? invoices.filter((i) => i.payeeId === payeeId) : invoices
  const rows = totalsByPeriod(filtered, payments, granularity)

  function exportReport() {
    const blob = new Blob([periodReportCsv(rows)], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = `accounting-report-${granularity}${payeeId ? `-${payeeId}` : ""}.csv`
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {(["month", "quarter", "year"] as PeriodGranularity[]).map((g) => (
            <button
              key={g}
              onClick={() => setGranularity(g)}
              className={`rounded-md px-3 py-1.5 text-sm ${granularity === g ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
            >
              {g[0].toUpperCase() + g.slice(1)}
            </button>
          ))}
        </div>
        <select
          value={payeeId}
          onChange={(e) => setPayeeId(e.target.value)}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
        >
          <option value="">All payees</option>
          {payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
        </select>
        <div className="ml-auto"><Toolbtn onClick={exportReport}>Export CSV</Toolbtn></div>
      </div>
      {rows.length === 0 ? (
        <Empty>No invoices to report.</Empty>
      ) : (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-zinc-500">
              <th className="py-1.5">Period</th><th className="text-right">Invoices</th>
              <th className="text-right">Issued (USD)</th><th className="text-right">Paid (USD)</th>
              <th className="text-right">DIESEL Paid</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.period} className="border-t border-zinc-900">
                <td className="py-2 font-mono text-zinc-300">{r.period}</td>
                <td className="text-right text-zinc-300">{r.invoiceCount}</td>
                <td className="text-right text-zinc-200">{usd(r.issuedUsd)}</td>
                <td className="text-right text-zinc-200">{usd(r.paidUsd)}</td>
                <td className="text-right text-zinc-200">{dsl(r.dieselPaid)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/financials/accounting-ui.test.tsx`
Expected: tsc 0; PASS.

- [ ] **Step 5: Commit**

```bash
git add components/cms/financials/AccountingManager.tsx tests/financials/accounting-ui.test.tsx
git commit -m "feat(financials): Reports tab (period totals + payee filter + CSV) in Accounting

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: Full verification + branch finish

**Files:** none (verification + PR).

- [ ] **Step 1: Full gate**

Run: `npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0; vitest all green (existing + new); `next build` 0 errors.

- [ ] **Step 2: Confirm no stray changes**

Run: `git status -s` (only `.claude/` + `.npmrc` untracked — never staged) and `git diff main --stat` (only `shapes.ts`, `AccountingManager.tsx`, the two test files, and the spec/plan docs).

- [ ] **Step 3: Push + open PR**

```bash
git push -u origin feat/financials-period-reports
gh pr create --base main --title "Financials: period reports" --body "Reports tab in Accounting — issued/paid USD + DIESEL by month/quarter/year, payee filter, CSV export. Client-side over the existing overview data; enriches the orphaned totalsByPeriod aggregator. No schema, no new server action. See docs/superpowers/plans/2026-06-23-financials-period-reports.md.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Use the finishing-a-development-branch skill** for merge + deploy (human-owned: merge → Cloud Build short-sha → bump `newTag` via PR → Flux). Note the spot-pool capacity caveat (in-place rollout strategy currently in effect).

---

## Notes for the implementer

- `totalsByPeriod`'s signature change (adds `payments` param, new return shape) is safe — its only current consumer is its own unit test, which Task 1 updates.
- The Reports view does NOT call any server action — it computes from the `payees/invoices/payments` already in `AccountingManager`'s `result.overview`. The CSV is generated client-side via `periodReportCsv`.
- `getByRole("combobox")` in the UI test finds the single payee-filter `<select>` because no form is open and there are no unlinked payments in that fixture (the only other selects appear conditionally).
- CI "Test" job can flake — re-run if a transient failure appears.
