# Financials › Accounting — SP-1 ledger (design)

Date: 2026-06-22
Status: approved (brainstorming) — pending spec review
Branch: `feat/financials-accounting`

## Context

The third Financials page (after Treasury and Reserve) — the one flex called out as the
priority: a **full accounting dashboard** to *"associate all the DIESEL payments I make to an
invoice/identity"*, for the 409A. DIESEL is the alkanes gas token [2:0]; flex pays
contributors/vendors in DIESEL on-chain and needs each payment tied to **what it was for**
(an invoice) and **who got it** (an identity/payee).

Treasury (BSC holdings) is live; Reserve is effectively covered by flex's `/admin` Dashboard
(frBTC stats + wrap/unwrap, sound). This is the accounting ledger.

Web-admin / data surface, **not** on-chain writes (we read on-chain; we never move DIESEL).

## Decomposition (locked during brainstorming)

The accounting dashboard is two sub-projects:

- **SP-1 (this spec) — the ledger core.** Data model (Payee / Invoice / DieselPayment) +
  the `/admin/financials/accounting` UI to manage payees and invoices (with PDF), record
  payments, link payment ↔ invoice ↔ payee, and report/export for the 409A. Independently
  useful: flex can enter payments manually and reconcile.
- **SP-2 (separate spec/plan, later) — on-chain DIESEL ingestion.** Auto-discover DIESEL [2:0]
  transfers leaving the payer address (the pattern of flex's frBTC wrap/unwrap aggregator),
  create `DieselPayment` rows (source ONCHAIN, unlinked) for flex to annotate. Removes the
  manual payment entry. Deferred — needs the payer address from flex + his additional demands.

## Decisions (locked during brainstorming)

1. **Hybrid model** — payments are on-chain DIESEL transfers that flex *annotates* with
   invoice + payee (not a pure manual ledger). SP-1 supports MANUAL payment entry; SP-2 adds
   ONCHAIN ingestion. The `DieselPayment.source` enum distinguishes them.
2. **Identity = a new Payee entity** (name, type PERSON/ORG) with an **optional** link to a
   `KycIntake` (Stripe Identity) when the payee is KYC'd — DIESEL recipients aren't all KYC'd.
3. **Invoice = a full record** — ref, payee, description, amount USD, amount DIESEL, issued
   date, status, optional PDF. The dashboard tracks invoices and which payment(s) settled each.
4. **No DIESEL/USD oracle in v1** — flex enters `amountUsd` on the invoice (he knows the
   value of the work); `amountDiesel` comes from the on-chain payment. The implied rate is the
   ratio; we never price DIESEL live.
5. **Gate on `FINANCIALS_PRIVILEGE`** (the shared constant, currently `"audit.view"`) — same
   as Treasury; swaps to flex's dedicated financials privilege in one line when his IAM adds it.

## Non-goals (explicitly out of scope)

- **No on-chain DIESEL ingestion** — that's SP-2.
- **No moving DIESEL / no tx construction** — read + annotate only.
- **No live DIESEL pricing/oracle** — USD is entered on the invoice (Decision 4).
- **No double-entry / GL / tax computation** — this is a payments-to-invoices reconciliation
  ledger for the 409A, not full accounting software.
- **No IAM/privilege/migration of our own** beyond the additive models — gating reuses
  `FINANCIALS_PRIVILEGE`.
- **No multi-currency** — payments are DIESEL; invoices carry a USD figure.

## Data model (additive migration — Prisma)

```prisma
enum PayeeType { PERSON ORG }
enum InvoiceStatus { OPEN PAID VOID }
enum PaymentSource { ONCHAIN MANUAL }

model Payee {
  id           String    @id @default(cuid())
  name         String
  type         PayeeType @default(PERSON)
  kycIntakeId  String?   // optional link to a KYC'd identity (Stripe Identity)
  kycIntake    KycIntake? @relation(fields: [kycIntakeId], references: [id])
  notes        String?
  createdAt    DateTime  @default(now())
  invoices     Invoice[]
  @@index([name])
}

model Invoice {
  id           String         @id @default(cuid())
  ref          String         @unique        // human ref e.g. INV-014
  payeeId      String
  payee        Payee          @relation(fields: [payeeId], references: [id])
  description  String
  amountUsd    Float
  amountDiesel Float?                         // expected DIESEL (optional; actual comes from payments)
  issuedAt     DateTime
  status       InvoiceStatus  @default(OPEN)
  pdfUrl       String?                        // GCS object (CMS_BUCKET)
  createdAt    DateTime       @default(now())
  payments     DieselPayment[]
  @@index([payeeId])
  @@index([status])
}

model DieselPayment {
  id               String        @id @default(cuid())
  txid             String                      // bitcoin txid of the DIESEL transfer
  vout             Int?
  amountDiesel     Float
  recipientAddress String
  paidAt           DateTime                     // block time
  blockHeight      Int?
  invoiceId        String?
  invoice          Invoice?      @relation(fields: [invoiceId], references: [id])
  source           PaymentSource @default(MANUAL)
  createdAt        DateTime      @default(now())
  @@unique([txid, vout])                        // idempotent vs SP-2 ingestion
  @@index([invoiceId])
}
```

Relations: `Payee 1—N Invoice`, `Invoice 1—N DieselPayment` (an invoice may be settled by
more than one payment). `KycIntake` gains a back-relation `payees Payee[]` (additive). Marking
an invoice PAID is a manual flex action (or a derived helper) — v1 keeps `status` explicit.

## Architecture (mirrors the Treasury + existing CMS patterns)

- `lib/financials/accounting/shapes.ts` — types + **pure** aggregators (`totalsByPayee`,
  `totalsByPeriod`, `summaryMetrics`, `toCsv`) over plain rows, unit-tested without a DB.
- `lib/financials/accounting/store.ts` — Prisma reads/writes (list invoices/payees/payments
  with filters; create/update payee + invoice; link a payment to an invoice; the unlinked-
  payments query). Thin, typed.
- `actions/cms/accounting.ts` — gated server actions (`FINANCIALS_PRIVILEGE`): overview
  (metrics + unlinked + invoices), CRUD for payee/invoice, link payment, CSV export. All
  return discriminated unions; never throw.
- PDF upload: reuse the article-image upload path to `CMS_BUCKET` (GCS) — `lib/cms` media
  helpers; validate `application/pdf` + size cap.
- `app/admin/financials/accounting/page.tsx` (server, gated) + `components/cms/financials/
  AccountingManager.tsx` (client). Reconciliation-first layout (see UI).
- Nav: add an **"Accounting"** leaf under the existing **Financials** group, gated on
  `FINANCIALS_PRIVILEGE` → update `tests/cms/admin-nav.test.ts` (group gains a 2nd leaf).

## UI (approved — mockup in the brainstorm)

Matches the admin's dark aesthetic (flex's StatCards/pills), built with frontend-design.

- **4 metric cards:** total paid (USD), total paid (DIESEL), open invoices, unlinked payments.
- **Reconciliation-first:** an **unlinked-payments** alert at the top — on-chain (or manual)
  payments not yet tied to an invoice, each with a one-click **Link to invoice** (the core
  annotation flow). Keeps the ledger reconciled.
- **Invoices ledger** (main table): ref · payee (with a KYC badge when linked) · USD · status
  pill (open/paid/void) · settling payment (txid → mempool link) · PDF. Filters: payee,
  period (month/quarter/year), status.
- **Payees** view: directory — name, type, KYC badge, # invoices, total paid → drill-down to
  that payee's invoices + payments.
- **Payments** view: the raw payment extract (txid, amount, recipient, date, linked invoice).
- **Actions:** New payee (name/type/optional KYC link) · New invoice (payee + USD + DIESEL +
  date + PDF upload) · Link payment → invoice · mark invoice PAID/VOID.
- **Export CSV** of the full ledger for the accountant.

## Reporting (409A)

Totals by payee and by period (month/quarter/year); unreconciled/unlinked alerts; per-payee
history; CSV export. All derived by the pure aggregators in `shapes.ts` (testable).

## Error handling

- Actions gated; unauthorized → `{ ok:false, error:"unauthorized" }` (page also redirects).
- PDF upload: reject non-`application/pdf` or over the size cap with a clear message.
- Store/DB errors caught in the action → `{ ok:false, error:"... }`; never 500 to the client.
- Linking enforces referential integrity (payment + invoice must exist; an invoice's payee is
  fixed at link time).

## Testing

- **`shapes.test.ts`** (pure, the core): `summaryMetrics` (totals USD/DIESEL, open/unlinked
  counts), `totalsByPayee`, `totalsByPeriod`, `toCsv` (header + rows + escaping). Fixtures of
  payees/invoices/payments.
- **`accounting.test.ts`** (actions): gating (unauthorized without the privilege), CRUD happy
  paths (mock store), link-payment updates the invoice, CSV export shape.
- **`store.test.ts`**: filter queries (by payee/period/status), the unlinked-payments query,
  idempotent payment upsert (`@@unique [txid, vout]`).
- UI: render states (empty, unlinked alert, paid/open/void pills, KYC badge) in
  `AccountingManager`.
- Gates: `tsc --noEmit` 0, `vitest` green, `next build` 0. Additive migration (`prisma db push`
  via the deploy migrate initContainer, like prior schema additions).

## Verification

- Unit/integration green; tsc 0; build 0; migration additive (no destructive change).
- Live (post-deploy): `/admin/financials/accounting` gated; create a payee + invoice (with
  PDF) + a manual payment, link them, see the metrics + CSV export reconcile.

## Open items (not blockers to SP-1)

1. **Payer address(es)** for SP-2 on-chain ingestion — flex provides.
2. **More flex demands** on the accounting dashboard — may refine reporting/fields; the model
   is extensible (additive).
3. **Privilege swap** — when flex's IAM adds a dedicated financials privilege, swap the one
   `FINANCIALS_PRIVILEGE` constant.
4. **PDF storage** — confirm the article-image GCS upload helper is reusable for PDFs (size
   cap + content-type); otherwise a thin parallel uploader.
