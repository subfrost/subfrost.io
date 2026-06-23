# Financials › Accounting — Payee Profiles (design)

Date: 2026-06-22
Status: approved (brainstorming) — pending spec review
Branch: `feat/financials-payee-profiles`

## Context

Extends the Accounting ledger (SP-1, live at `8739e8c`) with **per-payee profile pages** —
the internal "card" for a payee/contractor, mirroring the cross-cutting profile flex built for
FUEL (the per-address drawer). flex is writing a Rust CLI that maps page features 1:1 so an AI
agent can do the accounting; the server-action surface must stay clean and complete.

The ledger already has `Payee` (name, type PERSON/ORG, optional `KycIntake` link, notes),
`Invoice`, and `DieselPayment`, reconciled in a single tabbed `/admin/financials/accounting`
page. A payee today is just a row + a totals line. This adds a dedicated profile that gathers
everything about one payee: their invoices and statuses, the DIESEL payments that settled them,
totals, KYC, an optional contract PDF, and an **optional link to a team-member `User`** that
surfaces that user's author fields (avatar/bio/email/role) as the internal payable view.

Web-admin / data surface, **not** on-chain writes. pt-BR project, English code/UI.

## Decisions (locked during brainstorming)

1. **Topology — detail route + tab-as-index.** The profile is a new route
   `/admin/financials/payees/[id]`. The existing Accounting "Payees" tab stays the index; each
   payee name there links to the profile. **No new nav leaf** (the profile is reached by click).
2. **Profile = the editing center for a payee.** It edits name/type/notes, links/unlinks a
   `User`, links/unlinks a `KycIntake`, and attaches a contract PDF. The Accounting page keeps
   only quick creation + the lists. This gives the largest action surface for flex's CLI to map.
3. **Payee↔User link = optional 1:1.** `userId String? @unique` on `Payee` (a User maps to at
   most one Payee and vice-versa). Not every team member becomes a Payee; the link is optional
   enrichment. When linked, the profile shows the User's avatar/bio/email/role/status (read-only,
   mirroring the public author profile) plus the financial sections. Editing those author fields
   stays in the user's own `ProfileForm` — not here.
4. **Contract PDF in scope.** New field `agreementUrl String?` on `Payee`; upload reuses the
   existing `/api/admin/upload-pdf` endpoint (the same one invoices use).
5. **Gate on `FINANCIALS_PRIVILEGE`** (`financials.view`, restricted) — the profile route,
   the profile/update/list actions, all read the same constant Accounting already uses.

## Non-goals (explicitly out of scope)

- **No on-chain DIESEL ingestion** — that's SP-2 (separate spec/plan, needs the payer address).
- **No editing the linked User's author fields from here** — avatar/bio/twitter/status are
  edited in the user's own `ProfileForm`; the profile only displays them (Decision 3).
- **No profile for a User without a Payee** — the entity is the Payee; the User link is optional
  enrichment, not a second profile surface (Decision 1).
- **No new IAM/privilege/migration of our own** beyond the additive schema fields — gating
  reuses `FINANCIALS_PRIVILEGE`.
- **No moving DIESEL / no tx construction / no live pricing** — inherited from SP-1.

## Architecture

Mirror the SP-1 pattern: **pure aggregators in `shapes.ts` + a thin Prisma store + gated
actions**. The new read path is a pure function `assemblePayeeProfile(...)` (DB-free, unit
tested without Prisma); the store only fetches rows and calls it. Reuses `totalsByPayee` and
`listInvoices({ payeeId })` that already exist. (Alternative rejected: assembling the profile
with ad-hoc queries inside the store — harder to test, off-pattern.)

## Data model (additive migration — Prisma)

```prisma
model Payee {
  // ...existing: id, name, type, kycIntakeId?, kycIntake?, notes, createdAt, invoices[]...
  userId       String?  @unique                                  // optional 1:1 link to a User
  user         User?    @relation(fields: [userId], references: [id], onDelete: SetNull)
  agreementUrl String?                                           // contract PDF (CMS_BUCKET)
}

model User {
  // ...existing...
  payee Payee?                                                   // back-relation for the 1:1
}
```

`onDelete: SetNull` — deleting a User must **not** cascade-delete the payee or its invoices
(financial records survive); the link just clears.

Migration applies via the deploy `migrate` initContainer (additive, no data backfill).

## Components / data flow

### `lib/financials/accounting/shapes.ts` (pure, DB-free)
- Extend `PayeeRow` with `userId: string | null` and `agreementUrl: string | null`.
- New shapes:
  - `PayeeUserSummary` = `{ id, name, email, avatarUrl, bio, twitter, status, role }` (the
    author fields surfaced read-only when a User is linked).
  - `PayeeProfile` = `{ payee: PayeeRow; user: PayeeUserSummary | null; kyc: { id, customerName,
    status } | null; invoices: InvoiceRow[]; payments: PaymentRow[]; totals: PayeeTotals }`.
- New pure function `assemblePayeeProfile(payee, user, kyc, invoices, payments)` (where `user`
  and `kyc` are the already-shaped `PayeeUserSummary | null` and kyc summary `| null`):
  - Filters `payments` to those whose `invoiceId` belongs to one of this payee's invoices.
  - Computes `totals` by calling `totalsByPayee([payee], invoices, filteredPayments)[0]`.
  - Passes `user`/`kyc` through onto the result.
  - Returns the `PayeeProfile`. No Prisma, no dates-as-Date (rows are already ISO).

### `lib/financials/accounting/store.ts` (thin Prisma)
- Extend `mapPayee` to carry `userId` and `agreementUrl`.
- `loadPayeeProfile(id): Promise<PayeeProfile | null>` — `prisma.payee.findUnique({ where:{id},
  include:{ kycIntake, user } })`; if null → null. Shape the `PayeeUserSummary` / kyc summary
  from the includes, then `listInvoices({ payeeId: id })` + `listPayments()`, and call
  `assemblePayeeProfile`.
- `updatePayee(id, patch)` where `patch` is a partial of
  `{ name?, type?, notes?, kycIntakeId?, userId?, agreementUrl? }`:
  - Only keys **present** in `patch` are written (absent = unchanged; explicit `null` = clear).
  - If `name` present: trim, throw `AccountingError` if empty.
  - If `kycIntakeId` present and non-null: verify the `KycIntake` exists.
  - If `userId` present and non-null: verify the `User` exists. Uniqueness is enforced by the DB
    `@unique`; map the Prisma unique-violation to a friendly `AccountingError`
    ("That user is already linked to another payee").
  - Returns the mapped `PayeeRow`.
- `listLinkableUsers(): Promise<{ id, name, email, avatarUrl, role }[]>` — active users, ordered
  by name, for the link dropdown.

### `actions/cms/accounting.ts` (gated, audited) — all behind `FINANCIALS_PRIVILEGE`
- `payeeProfileAction(id)` → `{ ok: true; profile } | { ok: false; error: "unauthorized" |
  "not_found" }`.
- `updatePayeeAction(id, patch)` → `MutResult<PayeeRow>`; audits `accounting_payee_update`
  (target = payee name); `revalidatePath` both `/admin/financials/accounting` and
  `/admin/financials/payees/[id]`. AccountingError → `{ ok:false, error }`.
- `listLinkableUsersAction()` → `{ ok: true; users } | { ok: false; error: "unauthorized" }`.
- The contract PDF upload uses the existing `/api/admin/upload-pdf`; the returned URL is saved
  through `updatePayeeAction({ agreementUrl })`.

### UI
- `app/admin/financials/payees/[id]/page.tsx` — server component. `currentUser()`; redirect to
  `/admin/login` if no session, to `/admin` if missing `FINANCIALS_PRIVILEGE` (same guard as the
  Accounting page). Fetch the profile; `notFound()` if missing. Render `<PayeeProfile>`.
- `components/cms/financials/PayeeProfile.tsx` — client component:
  - Back link → `/admin/financials/accounting`.
  - Header: name, type badge, KYC badge.
  - Linked-user card: when linked → avatar + byline (name/email/role/bio/status, read-only) +
    "Unlink"; when not → a "Link to a team member" dropdown (`listLinkableUsersAction`).
  - Edit affordance (toggle, like `NoteEditor`): name, type, notes, KYC link, agreement PDF
    (upload + clear). Saves via `updatePayeeAction`.
  - Totals strip (invoiceCount, paid USD, paid DIESEL, open invoices).
  - Invoices table (ref, USD, status, settled-by txids) — reuse AccountingManager styling.
  - Payments table (txid → mempool.space, DIESEL, paid date, invoice ref).
- `components/cms/financials/AccountingManager.tsx` — in the Payees tab, the payee name becomes
  a `<Link href="/admin/financials/payees/{id}">`.
- `lib/cms/admin-nav.ts` — extend `isItemActive` so the Accounting leaf stays active on
  `/admin/financials/payees/*` (no new nav leaf).

## Testing

- `tests/financials/accounting-shapes.test.ts` — `assemblePayeeProfile`: payment filtering to
  the payee's invoices, totals via reuse, user/kyc summary present vs absent.
- `tests/financials/accounting-store.test.ts` (mocked Prisma) — `updatePayee` partial patch /
  empty-name rejection / explicit-null unlink / unique-violation mapping; `loadPayeeProfile`
  (found / not-found); `listLinkableUsers`. Extend the prisma mock with `user` + `payee.update`.
- `tests/financials/accounting-action.test.ts` — gating (unauthorized) for `payeeProfileAction`,
  `updatePayeeAction`, `listLinkableUsersAction`; not_found path for the profile action.
- `tests/financials/accounting-ui.test.tsx` — render `PayeeProfile` linked vs unlinked; the
  edit toggle reveals the form.

## Verification

`npx prisma generate && npx tsc --noEmit` 0 · `CI=true npx vitest run` green · `npx next build`
0. Live (post-deploy): the profile route is gated (307 without a session); from Accounting,
clicking a payee opens the profile; invoices/payments/totals reconcile; linking an optional User
shows the author fields; attaching a contract PDF persists.

## Constraints / gotchas (honored)

- `npx prisma generate` **before** `tsc` (schema changes).
- Additive migration only (applied via the deploy migrate initContainer).
- Gate everything on `FINANCIALS_PRIVILEGE` (= `financials.view`, restricted).
- branch → PR → merge, never main direct.
- flex PR #68 (session/device mgmt) MERGED `d4b56cd` (2026-06-22) and main was brought into this
  branch (`57be38b`). No overlap: #68 only added `Session.tlsFingerprint` (Session model, not
  Payee/User) and the `iam.manage_sessions` privilege (we don't touch the registry). Baseline is
  now main@7b2b148 incl. #68; this branch builds on it cleanly.
