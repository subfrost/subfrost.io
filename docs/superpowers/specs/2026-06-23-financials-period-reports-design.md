# Financials › Accounting — Period Reports (design)

Date: 2026-06-23
Status: approved (brainstorming) — pending spec review
Branch: `feat/financials-period-reports`

## Context

The Financials section exists for the **409A** — it needs to show spend/compensation over
time. The accounting ledger (SP-1) already tracks invoices (USD) and DIESEL payments, and the
payee profiles surface per-payee lifetime totals. What is missing is a **time series**: how much
was billed and paid per month/quarter/year.

A pure aggregator for this — `totalsByPeriod` — already exists in
`lib/financials/accounting/shapes.ts` and is unit-tested, but it is **not surfaced anywhere** (no
action, no UI consumes it) and today only sums issued USD. This front turns that latent function
into a usable **Reports** view and enriches it to the metrics the 409A wants.

Web-admin / data surface, **not** on-chain. English code/UI, pt-BR project.

## Decisions (locked during brainstorming)

1. **Metric per period = issued USD + paid USD + DIESEL paid + invoice count.** Gives obligations
   (issued) and actual outflow (paid USD / DIESEL) — the full 409A picture.
2. **Single date axis = invoice `issuedAt`.** A period groups the invoices *issued* in it;
   `dieselPaid` sums the payments linked to those invoices (regardless of when the payment
   occurred). Rejected: keying DIESEL by payment `paidAt` — it mixes two date axes in one row and
   confuses the reading.
3. **Payee filter in v1.** A dropdown ("All payees" + each payee) lets you see one contractor's
   spend over time. The caller pre-filters invoices by `payeeId` before aggregating.
4. **CSV export of the report in v1.** A button downloads the period table as CSV.
5. **All client-side, no new server action, no schema change.** The `AccountingManager` already
   loads `payees/invoices/payments` via `accountingOverviewAction`; the Reports view computes from
   that in the browser (instant granularity/payee toggling) and generates the CSV client-side.

## Architecture

Keep the SP-1 pattern: **pure aggregators in `shapes.ts`**, consumed by the existing client
component. No server round-trip is added — the data is already in the client. The aggregation
logic lives in pure, unit-tested functions so the report is consistent and so flex's Rust CLI can
replicate the same aggregation from the data it already fetches via `accountingOverviewAction`.

Rejected alternative: a `periodReportAction` server action — it would re-fetch invoices/payments
the overview already holds (redundant) and, since the UI computes client-side, would be a
built-but-unused action (the exact smell that left `totalsByPeriod` orphaned in the first place).

## Components / data flow

### `lib/financials/accounting/shapes.ts` (pure, DB-free, serializable)

Enrich the existing `PeriodTotals` + `totalsByPeriod` (currently `{ period, invoiceCount,
totalUsd }` summing all invoices' `amountUsd`). The only consumer today is its own unit test, so
the signature change is safe.

```ts
export interface PeriodTotals {
  period: string      // "2026-06" | "2026-Q2" | "2026"
  invoiceCount: number
  issuedUsd: number   // Σ amountUsd of invoices issued in the period (any status)
  paidUsd: number     // Σ amountUsd of those whose status === "PAID"
  dieselPaid: number  // Σ amountDiesel of payments linked to those invoices
}

export function totalsByPeriod(
  invoices: InvoiceRow[],
  payments: PaymentRow[],
  g: PeriodGranularity,
): PeriodTotals[] // sorted newest period first
```

Aggregation:
- For each invoice: `k = periodKey(issuedAt, g)`; `invoiceCount++`, `issuedUsd += amountUsd`, and
  if `status === "PAID"` then `paidUsd += amountUsd`.
- Build an `invoiceId → period` map from those invoices. For each payment with a non-null
  `invoiceId` present in that map, add `amountDiesel` to that period's `dieselPaid`. Payments
  whose invoice is not in the set (unlinked, or — under a payee filter — belonging to another
  payee) are ignored.
- Round money with the existing `round2`. Sort newest period first (string-desc, as today).

`PeriodGranularity` and `periodKey` already exist and are unchanged.

New CSV helper (pure), mirroring `toCsv`/`csvEscape` already in the file:

```ts
export function periodReportCsv(rows: PeriodTotals[]): string
// header: Period,Invoices,Issued USD,Paid USD,DIESEL Paid
```

### `components/cms/financials/AccountingManager.tsx`

Add a 4th tab **"Reports"** (the `View` type and tab list grow from
`invoices|payees|payments` to include `reports`). A new `ReportsView` sub-component (same file,
alongside the existing table renderers) receives `payees`, `invoices`, `payments` and holds its
own local state:
- **Granularity** toggle: Month / Quarter / Year (`PeriodGranularity`).
- **Payee filter**: a `<select>` with "All payees" + each payee (by id).
- Computes `rows = totalsByPeriod(invoices filtered by payeeId, payments, granularity)`.
- Renders a table: Period · # Invoices · Issued (USD) · Paid (USD) · DIESEL Paid; empty state when
  no invoices.
- **Export CSV** button: `periodReportCsv(rows)` → Blob download (same client-side download
  pattern the existing `exportCsv` uses, but the CSV string is computed client-side rather than
  via a server action).

Reuse the existing `usd`/`dsl` formatters, `Toolbtn`, `Empty`, and table styling.

## Testing

- `tests/financials/accounting-shapes.test.ts` — update the existing `totalsByPeriod` test to the
  new signature/shape: assert `issuedUsd`/`paidUsd`/`dieselPaid`/`invoiceCount` per period across
  month/quarter/year, including a PAID-vs-OPEN split and DIESEL from linked payments; assert
  payee-filtered aggregation (pass invoices for one payee → DIESEL of other payees' payments
  excluded). Add a `periodReportCsv` test (header + a row, with `csvEscape` behavior).
- `tests/financials/accounting-ui.test.tsx` — the Reports tab renders a period row; switching
  granularity changes the periods shown; the payee filter restricts the rows.

## Verification

`npx tsc --noEmit` 0 · `CI=true npx vitest run tests/financials` green · `npx next build` 0.
Live (post-deploy): in `/admin/financials/accounting` → Reports tab, periods show issued/paid
USD + DIESEL; granularity + payee filter work; CSV export downloads the table.

## Constraints / gotchas (honored)

- No schema change, no migration, no new server action.
- Gate is unchanged — the Reports tab lives inside the already-gated `AccountingManager`
  (`FINANCIALS_PRIVILEGE`).
- `totalsByPeriod`'s signature change is safe: its only current consumer is its own unit test.
- branch → PR → merge, never main direct. Deploy: merge → Cloud Build (short-sha) → bump `newTag`
  via PR → Flux (the spot-pool capacity caveat from the payee-profiles deploy still applies; the
  in-place rollout strategy is currently in effect).
