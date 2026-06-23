# Financials — cap table, SAFEs/token agreements, balance sheet (409A) — design

**Date:** 2026-06-23
**Context:** new construction (no admin source to port). Closes gap **C** from the
migration brief: "get all the SAFEs into this," "the Financials section will show
our balance sheet," and 409A prep. Builds on the existing `financials.view`
restricted privilege and the accounting/treasury surfaces.

## Surfaces (all gated on `financials.view`)

- `/admin/financials/cap-table` — share classes, shareholders, issued holdings,
  and issued-basis ownership. Seeded with a Common Stock class (10,000,000
  authorized) on demand for the founder 100%-common starting point.
- `/admin/financials/safes` — the register of every convertible / investment
  instrument: SAFEs, convertible notes, token warrants, SAFTs, side letters.
  Each carries its terms (cap, discount, MFN, pro-rata; token allocation %) and a
  **signed document** — either an uploaded PDF or a linked Track A e-sign
  envelope. Summary shows total SAFE raised + implied post-money ownership.
- `/admin/financials/balance-sheet` — computed lines (treasury USD, open-invoice
  AR, outstanding SAFEs, common stock at par) pulled live from the rest of
  Financials, plus manual GL line items, with an assets = liabilities + equity
  check. Satisfies the brief's "do both" — computed summary *and* manual GL.

## Data model

- `ShareClass` / `Shareholder` / `ShareHolding` — the cap table. `Shareholder`
  carries optional loose links to a `User`/`Payee` identity.
- `Instrument` — unified SAFE/token/note register with a `type` discriminator;
  SAFE-specific term fields are nullable for token agreements. Links to an
  optional `Shareholder` (investor identity), an uploaded `pdfUrl`, and/or a loose
  `envelopeId` (a Track A signed document).
- `BalanceSheetItem` — manual line items (section/label/amount/sortOrder). The
  computed lines are derived at render time, never stored.

Applied via `prisma db push` on deploy (no migrations dir).

## Math (pure, unit-tested — `lib/financials/equity/shapes.ts`, `balance-sheet/shapes.ts`)

- `summarizeCapTable` — issued shares, per-shareholder aggregation + ownership %.
- `summarizeInstruments` — total SAFE/note raised, per-SAFE implied post-money
  ownership (`amount / cap`), aggregate implied dilution, token-% totals. This is
  the headline 409A input; a full priced-round conversion modeler (cap vs.
  discount price, recursive multi-cap) is a deliberate follow-up.
- `assembleBalanceSheet` — groups computed + manual lines, rolls up section
  totals, computes the balance difference.

## Integration

- Balance-sheet computed lines read the treasury snapshot from the **same Redis
  cache** the treasury page populates (best-effort, last-good fallback, never
  forces a provider fetch), the accounting ledger's open invoices, the SAFE
  register, and the cap table's issued common.
- Instruments attach a signed document via the existing private-PDF upload route
  or by linking a Track A `Envelope` — so a SAFE sent for signature through the
  Documents system shows its signing status on the instrument.

## Follow-ups (out of scope here)

- Priced-round SAFE conversion modeler (shares issued per instrument at a given
  pre-money + new-money), option-pool top-up math, fully-diluted-with-SAFEs view.
- Cap-table CSV/PDF export for the 409A appraiser.
- Token cap table (token supply allocation table) beyond the per-instrument %.
