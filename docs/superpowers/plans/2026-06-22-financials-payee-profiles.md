# Financials › Payee Profiles Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Add per-payee profile pages to the Financials › Accounting ledger — a dedicated route that gathers one payee's invoices, DIESEL payments, totals, KYC, an optional contract PDF, and an optional 1:1 link to a team-member User.

**Architecture:** Mirror the existing SP-1 accounting pattern — pure aggregators in `shapes.ts`, a thin Prisma store, gated/audited server actions, and a client component fed by a thin server page. The new read path is a pure `assemblePayeeProfile(...)` that reuses `totalsByPayee` + `listInvoices({payeeId})`. Schema change is additive (two nullable columns on `Payee` + a 1:1 back-relation on `User`).

**Tech Stack:** Next.js 16 (App Router, server components + server actions), Prisma/Postgres, React, Tailwind, lucide-react, Vitest + @testing-library/react.

## Global Constraints

- **Run `npx prisma generate` before `npx tsc --noEmit`** — the schema changes and the Prisma client must be regenerated first.
- **Additive migration only** — applied in prod via the deploy `migrate` initContainer; no data backfill.
- **Gate every new action/route on `FINANCIALS_PRIVILEGE`** (`"financials.view"`, restricted) imported from `@/lib/financials/privilege`.
- **Code/UI in English; commit messages end with** `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- **Verification gates (run before each commit that changes TS):** `npx prisma generate && npx tsc --noEmit` (0 errors), `CI=true npx vitest run <files>` (green). Full-suite + `npx next build` at the end (Task 9).
- **Reuse `/api/admin/upload-pdf`** for the contract PDF upload (already gated on `FINANCIALS_PRIVILEGE`, accepts any `application/pdf`).
- **Branch:** `feat/financials-payee-profiles` (already created off main@7b2b148, incl. flex's merged #68). PR → merge, never push main.

---

### Task 1: Schema — Payee.userId + agreementUrl + User back-relation

**Files:**
- Modify: `prisma/schema.prisma` (Payee model ~768-779; User model ~277-282)

**Interfaces:**
- Consumes: nothing.
- Produces: `Payee.userId: String?` (@unique), `Payee.user: User?`, `Payee.agreementUrl: String?`, and `User.payee: Payee?` — the regenerated Prisma client exposes these for later tasks.

- [ ] **Step 1: Add the two fields + relation to the `Payee` model**

In `prisma/schema.prisma`, inside `model Payee { ... }`, add after the `notes` line and before `createdAt`:

```prisma
  userId       String?    @unique // optional 1:1 link to a team-member User
  user         User?      @relation(fields: [userId], references: [id], onDelete: SetNull)
  agreementUrl String? // contract/agreement PDF (CMS_BUCKET)
```

- [ ] **Step 2: Add the back-relation to the `User` model**

In `model User { ... }`, in the relations block (after `auditLogs ... @relation("AuditActor")`), add:

```prisma
  payee Payee? @relation
```

- [ ] **Step 3: Regenerate the Prisma client and validate the schema**

Run: `npx prisma generate && npx prisma validate`
Expected: "The schema at prisma\schema.prisma is valid 🚀" and a successful client generation. No new TS yet, so `npx tsc --noEmit` must still report 0 errors — run it too.

- [ ] **Step 4: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(financials): payee.userId (1:1 User link) + agreementUrl schema

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 2: Widen `PayeeRow` (type + mapPayee + fixtures)

Adding two required fields to `PayeeRow` ripples through `mapPayee` and every `PayeeRow` fixture. Do it as one coherent, build-green change.

**Files:**
- Modify: `lib/financials/accounting/shapes.ts` (PayeeRow interface ~8-16)
- Modify: `lib/financials/accounting/store.ts` (mapPayee ~12-21)
- Test: `tests/financials/accounting-store.test.ts` (listPayees ~24-33, createPayee ~40-45)
- Modify (fixtures only): `tests/financials/accounting-shapes.test.ts` (payees ~7-10), `tests/financials/accounting-action.test.ts` (~93), `tests/financials/accounting-ui.test.tsx` (~18-20)

**Interfaces:**
- Consumes: Task 1's regenerated client (rows now carry `userId`/`agreementUrl`).
- Produces: `PayeeRow` gains `userId: string | null` and `agreementUrl: string | null`; `mapPayee` populates them.

- [ ] **Step 1: Update the store test to expect the new fields (failing test)**

In `tests/financials/accounting-store.test.ts`, replace the `listPayees` mock row + assertion and the `createPayee` mock so they carry the new columns:

```ts
describe("listPayees", () => {
  it("maps rows and resolves kycCustomerName", async () => {
    pe.findMany.mockResolvedValueOnce([
      { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", notes: null, userId: "u1", agreementUrl: "https://x/a.pdf", createdAt: D("2026-01-01T00:00:00Z"), kycIntake: { customerName: "Ada L" } },
    ])
    const rows = await listPayees()
    expect(pe.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" }, include: { kycIntake: { select: { customerName: true } } } })
    expect(rows[0]).toEqual({ id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", kycCustomerName: "Ada L", notes: null, userId: "u1", agreementUrl: "https://x/a.pdf", createdAt: "2026-01-01T00:00:00.000Z" })
  })
})

describe("createPayee", () => {
  it("rejects an empty name", async () => {
    await expect(createPayee({ name: "  ", type: "PERSON" })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.create).not.toHaveBeenCalled()
  })
  it("trims and creates", async () => {
    pe.create.mockResolvedValueOnce({ id: "pe2", name: "Acme", type: "ORG", kycIntakeId: null, notes: null, userId: null, agreementUrl: null, createdAt: D("2026-01-02T00:00:00Z"), kycIntake: null })
    const row = await createPayee({ name: " Acme ", type: "ORG" })
    expect(pe.create.mock.calls[0][0].data).toMatchObject({ name: "Acme", type: "ORG", kycIntakeId: null, notes: null })
    expect(row.kycCustomerName).toBeNull()
    expect(row.userId).toBeNull()
  })
})
```

- [ ] **Step 2: Run the store test — verify it fails**

Run: `CI=true npx vitest run tests/financials/accounting-store.test.ts`
Expected: FAIL — `rows[0]` lacks `userId`/`agreementUrl` (mapPayee doesn't emit them).

- [ ] **Step 3: Extend the `PayeeRow` type and `mapPayee`**

In `lib/financials/accounting/shapes.ts`, add to `interface PayeeRow` (after `notes`):

```ts
  userId: string | null
  agreementUrl: string | null
```

In `lib/financials/accounting/store.ts`, replace `mapPayee`:

```ts
function mapPayee(r: {
  id: string; name: string; type: string; kycIntakeId: string | null
  notes: string | null; userId: string | null; agreementUrl: string | null
  createdAt: Date; kycIntake?: { customerName: string } | null
}): PayeeRow {
  return {
    id: r.id, name: r.name, type: r.type as PayeeType, kycIntakeId: r.kycIntakeId,
    kycCustomerName: r.kycIntake?.customerName ?? null, notes: r.notes,
    userId: r.userId, agreementUrl: r.agreementUrl,
    createdAt: r.createdAt.toISOString(),
  }
}
```

- [ ] **Step 4: Update the other three PayeeRow fixtures so the suite compiles**

In `tests/financials/accounting-shapes.test.ts`, add `userId: null, agreementUrl: null,` to each of the two objects in the `payees` array (before `createdAt`).

In `tests/financials/accounting-action.test.ts` (~line 93), update the inline payee literal:

```ts
    const payee = { id: "pe1", name: "Ada", type: "PERSON" as const, kycIntakeId: null, kycCustomerName: null, notes: null, userId: null, agreementUrl: null, createdAt: "2026-01-01T00:00:00.000Z" }
```

In `tests/financials/accounting-ui.test.tsx` (~line 18-20), update the `payee` factory:

```ts
const payee = (over: Partial<PayeeRow> = {}): PayeeRow => ({
  id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: null, kycCustomerName: null, notes: null, userId: null, agreementUrl: null, createdAt: "2026-01-01T00:00:00.000Z", ...over,
})
```

- [ ] **Step 5: Run generate + tsc + the financials suite — verify green**

Run: `npx prisma generate && npx tsc --noEmit && CI=true npx vitest run tests/financials`
Expected: tsc 0 errors; all financials tests PASS.

- [ ] **Step 6: Commit**

```bash
git add lib/financials/accounting/shapes.ts lib/financials/accounting/store.ts tests/financials
git commit -m "feat(financials): carry userId + agreementUrl on PayeeRow

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 3: `assemblePayeeProfile` + profile shapes (pure)

**Files:**
- Modify: `lib/financials/accounting/shapes.ts` (add shapes + function after `totalsByPayee`)
- Test: `tests/financials/accounting-shapes.test.ts`

**Interfaces:**
- Consumes: `PayeeRow`, `InvoiceRow`, `PaymentRow`, `PayeeTotals`, `totalsByPayee` (all in shapes.ts).
- Produces:
  - `PayeeUserSummary = { id: string; name: string | null; email: string; avatarUrl: string | null; bio: string | null; twitter: string | null; status: string | null; role: string }`
  - `PayeeKycSummary = { id: string; customerName: string; status: string }`
  - `PayeeProfile = { payee: PayeeRow; user: PayeeUserSummary | null; kyc: PayeeKycSummary | null; invoices: InvoiceRow[]; payments: PaymentRow[]; totals: PayeeTotals }`
  - `assemblePayeeProfile(payee, user, kyc, invoices, payments): PayeeProfile` — filters payments to this payee's invoices, computes totals via `totalsByPayee`.

- [ ] **Step 1: Write the failing test**

In `tests/financials/accounting-shapes.test.ts`, extend the existing top-of-file import from `@/lib/financials/accounting/shapes` to also include `assemblePayeeProfile,` and `type PayeeUserSummary,` (do not add a second import line from the same module). Then append (it already defines `payees`, `invoices`, `payments` fixtures at the top — reuse them):

```ts
describe("assemblePayeeProfile", () => {
  const user: PayeeUserSummary = { id: "u1", name: "Ada Lovelace", email: "ada@x.io", avatarUrl: null, bio: "math", twitter: null, status: null, role: "AUTHOR" }

  it("keeps only payments tied to the payee's invoices and totals them", () => {
    // pe1 owns i1 (PAID, $1000, paid 2 DIESEL via p1) and i2 (OPEN, $500). p2/p3 belong elsewhere/unlinked.
    const prof = assemblePayeeProfile(payees[0], user, null, invoices.filter((i) => i.payeeId === "pe1"), payments)
    expect(prof.payments.map((p) => p.id)).toEqual(["p1"])
    expect(prof.totals).toEqual({ payeeId: "pe1", payeeName: "Ada", invoiceCount: 2, totalUsd: 1000, totalDiesel: 2 })
    expect(prof.user).toBe(user)
    expect(prof.kyc).toBeNull()
  })

  it("handles a payee with no invoices/payments", () => {
    const prof = assemblePayeeProfile(payees[1], null, { id: "k9", customerName: "Acme", status: "APPROVED" }, [], payments)
    expect(prof.payments).toEqual([])
    expect(prof.totals).toEqual({ payeeId: "pe2", payeeName: "Acme, Inc", invoiceCount: 0, totalUsd: 0, totalDiesel: 0 })
    expect(prof.kyc?.status).toBe("APPROVED")
  })
})
```

- [ ] **Step 2: Run the test — verify it fails**

Run: `CI=true npx vitest run tests/financials/accounting-shapes.test.ts`
Expected: FAIL — `assemblePayeeProfile` is not exported.

- [ ] **Step 3: Implement the shapes + function**

In `lib/financials/accounting/shapes.ts`, after the `totalsByPayee` function, add:

```ts
export interface PayeeUserSummary {
  id: string
  name: string | null
  email: string
  avatarUrl: string | null
  bio: string | null
  twitter: string | null
  status: string | null
  role: string
}

export interface PayeeKycSummary {
  id: string
  customerName: string
  status: string
}

export interface PayeeProfile {
  payee: PayeeRow
  user: PayeeUserSummary | null
  kyc: PayeeKycSummary | null
  invoices: InvoiceRow[]
  payments: PaymentRow[] // only those settling this payee's invoices
  totals: PayeeTotals
}

/** Pure profile assembler: filters `payments` to the ones tied to this payee's
 *  invoices, computes totals via totalsByPayee, and passes user/kyc through. */
export function assemblePayeeProfile(
  payee: PayeeRow,
  user: PayeeUserSummary | null,
  kyc: PayeeKycSummary | null,
  invoices: InvoiceRow[],
  payments: PaymentRow[],
): PayeeProfile {
  const invoiceIds = new Set(invoices.map((i) => i.id))
  const own = payments.filter((p) => p.invoiceId !== null && invoiceIds.has(p.invoiceId))
  const totals = totalsByPayee([payee], invoices, own)[0]
  return { payee, user, kyc, invoices, payments: own, totals }
}
```

- [ ] **Step 4: Run the test — verify it passes**

Run: `CI=true npx vitest run tests/financials/accounting-shapes.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/financials/accounting/shapes.ts tests/financials/accounting-shapes.test.ts
git commit -m "feat(financials): assemblePayeeProfile pure aggregator + profile shapes

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 4: store — `updatePayee` + `listLinkableUsers`

**Files:**
- Modify: `lib/financials/accounting/store.ts`
- Test: `tests/financials/accounting-store.test.ts` (extend the prisma mock + add cases)

**Interfaces:**
- Consumes: `prisma.payee.{findUnique,update}`, `prisma.kycIntake.findUnique`, `prisma.user.{findUnique,findMany}`, `mapPayee`.
- Produces:
  - `updatePayee(id, patch): Promise<PayeeRow>` where `patch: { name?: string; type?: PayeeType; notes?: string | null; kycIntakeId?: string | null; userId?: string | null; agreementUrl?: string | null }`. Only keys present in `patch` are written; explicit `null` clears. Throws `AccountingError` on: payee not found, empty name, kycIntake not found, user not found, user already linked to another payee.
  - `listLinkableUsers(): Promise<{ id: string; name: string | null; email: string; avatarUrl: string | null; role: string }[]>` — active users ordered by name.

- [ ] **Step 1: Extend the prisma mock + write failing tests**

In `tests/financials/accounting-store.test.ts`, extend the `vi.mock("@/lib/prisma", ...)` factory so it covers the new models/methods. Replace the factory body with:

```ts
vi.mock("@/lib/prisma", () => {
  const payee = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
  const invoice = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
  const dieselPayment = { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  const kycIntake = { findUnique: vi.fn() }
  const user = { findUnique: vi.fn(), findMany: vi.fn() }
  const client = { payee, invoice, dieselPayment, kycIntake, user }
  return { prisma: client, default: client }
})
```

Add accessors near the existing `pe`/`inv`/`pay` consts:

```ts
const kyc = prisma.kycIntake as unknown as Record<string, ReturnType<typeof vi.fn>>
const usr = prisma.user as unknown as Record<string, ReturnType<typeof vi.fn>>
```

Add `updatePayee, listLinkableUsers` to the import from `@/lib/financials/accounting/store`. Then add:

```ts
describe("updatePayee", () => {
  const baseRow = { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: null, notes: null, userId: null, agreementUrl: null, createdAt: D("2026-01-01T00:00:00Z"), kycIntake: null }

  it("throws when the payee does not exist", async () => {
    pe.findUnique.mockResolvedValueOnce(null)
    await expect(updatePayee("nope", { name: "x" })).rejects.toBeInstanceOf(AccountingError)
  })

  it("rejects an empty name when name is in the patch", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    await expect(updatePayee("pe1", { name: "   " })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.update).not.toHaveBeenCalled()
  })

  it("writes only the keys present in the patch (notes cleared with null)", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    pe.update.mockResolvedValueOnce({ ...baseRow, notes: null })
    await updatePayee("pe1", { notes: null })
    expect(pe.update.mock.calls[0][0].data).toEqual({ notes: null })
  })

  it("verifies a linked user exists and is not taken, then sets userId", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow) // the target payee
    usr.findUnique.mockResolvedValueOnce({ id: "u1" })
    pe.findUnique.mockResolvedValueOnce(null) // no other payee holds u1
    pe.update.mockResolvedValueOnce({ ...baseRow, userId: "u1" })
    const row = await updatePayee("pe1", { userId: "u1" })
    expect(pe.update.mock.calls[0][0].data).toEqual({ userId: "u1" })
    expect(row.userId).toBe("u1")
  })

  it("rejects linking a user already tied to another payee", async () => {
    pe.findUnique.mockResolvedValueOnce(baseRow)
    usr.findUnique.mockResolvedValueOnce({ id: "u1" })
    pe.findUnique.mockResolvedValueOnce({ id: "peOTHER" }) // u1 already linked
    await expect(updatePayee("pe1", { userId: "u1" })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.update).not.toHaveBeenCalled()
  })

  it("unlinks a user with explicit null without touching prisma.user", async () => {
    pe.findUnique.mockResolvedValueOnce({ ...baseRow, userId: "u1" })
    pe.update.mockResolvedValueOnce({ ...baseRow, userId: null })
    await updatePayee("pe1", { userId: null })
    expect(usr.findUnique).not.toHaveBeenCalled()
    expect(pe.update.mock.calls[0][0].data).toEqual({ userId: null })
  })
})

describe("listLinkableUsers", () => {
  it("returns active users mapped to {id,name,email,avatarUrl,role}", async () => {
    usr.findMany.mockResolvedValueOnce([
      { id: "u1", name: "Ada", email: "ada@x.io", avatarUrl: null, role: "AUTHOR" },
    ])
    const rows = await listLinkableUsers()
    expect(usr.findMany).toHaveBeenCalledWith({ where: { active: true }, orderBy: { name: "asc" }, select: { id: true, name: true, email: true, avatarUrl: true, role: true } })
    expect(rows[0]).toEqual({ id: "u1", name: "Ada", email: "ada@x.io", avatarUrl: null, role: "AUTHOR" })
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `CI=true npx vitest run tests/financials/accounting-store.test.ts`
Expected: FAIL — `updatePayee`/`listLinkableUsers` not exported.

- [ ] **Step 3: Implement in `store.ts`**

Append to `lib/financials/accounting/store.ts`:

```ts
export async function updatePayee(id: string, patch: {
  name?: string; type?: PayeeType; notes?: string | null
  kycIntakeId?: string | null; userId?: string | null; agreementUrl?: string | null
}): Promise<PayeeRow> {
  const existing = await prisma.payee.findUnique({ where: { id } })
  if (!existing) throw new AccountingError("Payee not found")

  const data: Record<string, unknown> = {}
  if ("name" in patch) {
    const name = (patch.name ?? "").trim()
    if (!name) throw new AccountingError("Payee name is required")
    data.name = name
  }
  if ("type" in patch) data.type = patch.type
  if ("notes" in patch) data.notes = patch.notes?.trim() || null
  if ("agreementUrl" in patch) data.agreementUrl = patch.agreementUrl || null
  if ("kycIntakeId" in patch) {
    if (patch.kycIntakeId) {
      const k = await prisma.kycIntake.findUnique({ where: { id: patch.kycIntakeId } })
      if (!k) throw new AccountingError("KYC intake not found")
    }
    data.kycIntakeId = patch.kycIntakeId || null
  }
  if ("userId" in patch) {
    if (patch.userId) {
      const u = await prisma.user.findUnique({ where: { id: patch.userId } })
      if (!u) throw new AccountingError("User not found")
      const taken = await prisma.payee.findUnique({ where: { userId: patch.userId } })
      if (taken && taken.id !== id) throw new AccountingError("That user is already linked to another payee")
    }
    data.userId = patch.userId || null
  }

  const row = await prisma.payee.update({
    where: { id }, data, include: { kycIntake: { select: { customerName: true } } },
  })
  return mapPayee(row)
}

export async function listLinkableUsers(): Promise<
  { id: string; name: string | null; email: string; avatarUrl: string | null; role: string }[]
> {
  const rows = await prisma.user.findMany({
    where: { active: true },
    orderBy: { name: "asc" },
    select: { id: true, name: true, email: true, avatarUrl: true, role: true },
  })
  return rows.map((u) => ({ id: u.id, name: u.name, email: u.email, avatarUrl: u.avatarUrl, role: String(u.role) }))
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/financials/accounting-store.test.ts`
Expected: tsc 0; PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/financials/accounting/store.ts tests/financials/accounting-store.test.ts
git commit -m "feat(financials): updatePayee (partial patch) + listLinkableUsers store fns

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 5: store — `loadPayeeProfile`

**Files:**
- Modify: `lib/financials/accounting/store.ts`
- Test: `tests/financials/accounting-store.test.ts`

**Interfaces:**
- Consumes: `prisma.payee.findUnique` (with `kycIntake` + `user` includes), `listInvoices`, `listPayments`, `assemblePayeeProfile`, `mapPayee`.
- Produces: `loadPayeeProfile(id): Promise<PayeeProfile | null>` — null when the payee doesn't exist.

- [ ] **Step 1: Write the failing test**

Add `loadPayeeProfile` to the store import. Add to `tests/financials/accounting-store.test.ts`:

```ts
describe("loadPayeeProfile", () => {
  it("returns null when the payee is missing", async () => {
    pe.findUnique.mockResolvedValueOnce(null)
    expect(await loadPayeeProfile("nope")).toBeNull()
  })

  it("shapes payee + user + kyc and assembles invoices/payments/totals", async () => {
    pe.findUnique.mockResolvedValueOnce({
      id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", notes: null, userId: "u1", agreementUrl: null,
      createdAt: D("2026-01-01T00:00:00Z"),
      kycIntake: { id: "k1", customerName: "Ada L", status: "APPROVED" },
      user: { id: "u1", name: "Ada", email: "ada@x.io", avatarUrl: null, bio: "math", twitter: null, status: null, role: "AUTHOR" },
    })
    inv.findMany.mockResolvedValueOnce([
      { id: "i1", ref: "INV-1", payeeId: "pe1", description: "w", amountUsd: 100, amountDiesel: null, issuedAt: D("2026-02-01T00:00:00Z"), status: "PAID", pdfUrl: null, createdAt: D("2026-02-01T00:00:00Z"), payee: { name: "Ada" } },
    ])
    pay.findMany.mockResolvedValueOnce([
      { id: "p1", txid: "t", vout: null, amountDiesel: 5, recipientAddress: "bc1", paidAt: D("2026-02-02T00:00:00Z"), blockHeight: null, invoiceId: "i1", source: "MANUAL", createdAt: D("2026-02-02T00:00:00Z"), invoice: { ref: "INV-1" } },
      { id: "p2", txid: "u", vout: null, amountDiesel: 9, recipientAddress: "bc1", paidAt: D("2026-02-03T00:00:00Z"), blockHeight: null, invoiceId: null, source: "MANUAL", createdAt: D("2026-02-03T00:00:00Z"), invoice: null },
    ])
    const prof = await loadPayeeProfile("pe1")
    expect(prof).not.toBeNull()
    expect(prof!.user?.email).toBe("ada@x.io")
    expect(prof!.kyc).toEqual({ id: "k1", customerName: "Ada L", status: "APPROVED" })
    expect(prof!.payments.map((p) => p.id)).toEqual(["p1"]) // p2 unlinked → excluded
    expect(prof!.totals.totalUsd).toBe(100)
    expect(prof!.totals.totalDiesel).toBe(5)
    expect(inv.findMany.mock.calls[0][0].where.payeeId).toBe("pe1")
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `CI=true npx vitest run tests/financials/accounting-store.test.ts -t loadPayeeProfile`
Expected: FAIL — `loadPayeeProfile` not exported.

- [ ] **Step 3: Implement in `store.ts`**

At the top of `store.ts`: add one value import line `import { assemblePayeeProfile } from "@/lib/financials/accounting/shapes"`, and extend the existing `import type { ... } from "@/lib/financials/accounting/shapes"` line to also include `PayeeProfile, PayeeUserSummary, PayeeKycSummary` (keep it to those two import statements from the module — one value, one type).

Append:

```ts
export async function loadPayeeProfile(id: string): Promise<PayeeProfile | null> {
  const row = await prisma.payee.findUnique({
    where: { id },
    include: {
      kycIntake: { select: { id: true, customerName: true, status: true } },
      user: { select: { id: true, name: true, email: true, avatarUrl: true, bio: true, twitter: true, status: true, role: true } },
    },
  })
  if (!row) return null
  const payee = mapPayee(row)
  const user: PayeeUserSummary | null = row.user
    ? {
        id: row.user.id, name: row.user.name, email: row.user.email,
        avatarUrl: row.user.avatarUrl, bio: row.user.bio, twitter: row.user.twitter,
        status: row.user.status, role: String(row.user.role),
      }
    : null
  const kyc: PayeeKycSummary | null = row.kycIntake
    ? { id: row.kycIntake.id, customerName: row.kycIntake.customerName, status: String(row.kycIntake.status) }
    : null
  const [invoices, payments] = await Promise.all([listInvoices({ payeeId: id }), listPayments()])
  return assemblePayeeProfile(payee, user, kyc, invoices, payments)
}
```

(Note: `mapPayee`'s param type accepts the richer `kycIntake` shape — it only reads `customerName`. Keep the existing top-of-file `import type { ... }` line for the row types; just add the two import lines above.)

- [ ] **Step 4: Run — verify it passes**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/financials/accounting-store.test.ts`
Expected: tsc 0; PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/financials/accounting/store.ts tests/financials/accounting-store.test.ts
git commit -m "feat(financials): loadPayeeProfile (payee + user + kyc + ledger)

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 6: server actions — profile / update / linkable-users

**Files:**
- Modify: `actions/cms/accounting.ts`
- Test: `tests/financials/accounting-action.test.ts`

**Interfaces:**
- Consumes: `gate()`, `audit`, `ip()`, `revalidatePath`, and `loadPayeeProfile`, `updatePayee`, `listLinkableUsers` from the store.
- Produces:
  - `payeeProfileAction(id): Promise<PayeeProfileResult>` where `PayeeProfileResult = { ok: true; profile: PayeeProfile } | { ok: false; error: "unauthorized" | "not_found" }`.
  - `updatePayeeAction(id, patch): Promise<MutResult<PayeeRow>>` (same `patch` type as `updatePayee`); audits `accounting_payee_update`; revalidates `/admin/financials/accounting` and `/admin/financials/payees/${id}`.
  - `listLinkableUsersAction(): Promise<LinkableUsersResult>` where `LinkableUsersResult = { ok: true; users: LinkableUser[] } | { ok: false; error: "unauthorized" }`, `LinkableUser = { id: string; name: string | null; email: string; avatarUrl: string | null; role: string }`.

- [ ] **Step 1: Add the new store fns to the action test's store mock + write failing tests**

In `tests/financials/accounting-action.test.ts`, add to the `vi.mock("@/lib/financials/accounting/store", ...)` object: `loadPayeeProfile: vi.fn(), updatePayee: vi.fn(), listLinkableUsers: vi.fn(),`. Add to the import from the actions module: `payeeProfileAction, updatePayeeAction, listLinkableUsersAction`. Then add:

```ts
describe("payeeProfileAction", () => {
  it("rejects a caller without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await payeeProfileAction("pe1")).toEqual({ ok: false, error: "unauthorized" })
    expect(store.loadPayeeProfile).not.toHaveBeenCalled()
  })
  it("returns not_found when the payee is missing", async () => {
    vi.mocked(store.loadPayeeProfile).mockResolvedValue(null)
    expect(await payeeProfileAction("nope")).toEqual({ ok: false, error: "not_found" })
  })
  it("returns the profile on the happy path", async () => {
    const profile = { payee: { id: "pe1" }, user: null, kyc: null, invoices: [], payments: [], totals: { payeeId: "pe1", payeeName: "Ada", invoiceCount: 0, totalUsd: 0, totalDiesel: 0 } } as never
    vi.mocked(store.loadPayeeProfile).mockResolvedValue(profile)
    expect(await payeeProfileAction("pe1")).toEqual({ ok: true, profile })
  })
})

describe("updatePayeeAction", () => {
  it("rejects a caller without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await updatePayeeAction("pe1", { name: "x" })).toEqual({ ok: false, error: "unauthorized" })
    expect(store.updatePayee).not.toHaveBeenCalled()
  })
  it("maps an AccountingError to { ok:false, error }", async () => {
    vi.mocked(store.updatePayee).mockRejectedValue(new AccountingError("That user is already linked to another payee"))
    expect(await updatePayeeAction("pe1", { userId: "u1" })).toEqual({ ok: false, error: "That user is already linked to another payee" })
  })
  it("updates, audits, and revalidates on the happy path", async () => {
    vi.mocked(store.updatePayee).mockResolvedValue({ id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: null, kycCustomerName: null, notes: null, userId: "u1", agreementUrl: null, createdAt: "2026-01-01T00:00:00.000Z" })
    const r = await updatePayeeAction("pe1", { userId: "u1" })
    expect(r).toEqual({ ok: true, value: expect.objectContaining({ userId: "u1" }) })
    expect(audit).toHaveBeenCalledWith("accounting_payee_update", expect.objectContaining({ actorId: "u1", target: "Ada" }))
  })
})

describe("listLinkableUsersAction", () => {
  it("rejects a caller without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await listLinkableUsersAction()).toEqual({ ok: false, error: "unauthorized" })
  })
  it("returns the users", async () => {
    vi.mocked(store.listLinkableUsers).mockResolvedValue([{ id: "u1", name: "Ada", email: "ada@x.io", avatarUrl: null, role: "AUTHOR" }])
    const r = await listLinkableUsersAction()
    expect(r).toEqual({ ok: true, users: [{ id: "u1", name: "Ada", email: "ada@x.io", avatarUrl: null, role: "AUTHOR" }] })
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `CI=true npx vitest run tests/financials/accounting-action.test.ts`
Expected: FAIL — the three actions are not exported.

- [ ] **Step 3: Implement in `actions/cms/accounting.ts`**

Extend the store import (line ~8-11) to include `listLinkableUsers, loadPayeeProfile, updatePayee`. Extend the shapes import (line ~12-15) to include `type PayeeProfile`. Then append:

```ts
export type PayeeProfileResult =
  | { ok: true; profile: PayeeProfile }
  | { ok: false; error: "unauthorized" | "not_found" }

export async function payeeProfileAction(id: string): Promise<PayeeProfileResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  const profile = await loadPayeeProfile(id)
  if (!profile) return { ok: false, error: "not_found" }
  return { ok: true, profile }
}

export async function updatePayeeAction(id: string, patch: {
  name?: string; type?: PayeeType; notes?: string | null
  kycIntakeId?: string | null; userId?: string | null; agreementUrl?: string | null
}): Promise<MutResult<PayeeRow>> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const payee = await updatePayee(id, patch)
    await audit("accounting_payee_update", { actorId: g.me.id, target: payee.name, ip: await ip() })
    revalidatePath(PATH)
    revalidatePath(`/admin/financials/payees/${id}`)
    return { ok: true, value: payee }
  } catch (e) {
    if (e instanceof AccountingError) return { ok: false, error: e.message }
    throw e
  }
}

export type LinkableUser = { id: string; name: string | null; email: string; avatarUrl: string | null; role: string }
export type LinkableUsersResult =
  | { ok: true; users: LinkableUser[] }
  | { ok: false; error: "unauthorized" }

export async function listLinkableUsersAction(): Promise<LinkableUsersResult> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  return { ok: true, users: await listLinkableUsers() }
}
```

- [ ] **Step 4: Run — verify it passes**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/financials/accounting-action.test.ts`
Expected: tsc 0; PASS.

- [ ] **Step 5: Commit**

```bash
git add actions/cms/accounting.ts tests/financials/accounting-action.test.ts
git commit -m "feat(financials): payeeProfile / updatePayee / listLinkableUsers actions

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 7: UI — `PayeeProfile` component + profile route

**Files:**
- Create: `components/cms/financials/PayeeProfile.tsx`
- Create: `app/admin/financials/payees/[id]/page.tsx`
- Test: `tests/financials/payee-profile-ui.test.tsx`

**Interfaces:**
- Consumes: `payeeProfileAction`, `updatePayeeAction` from `@/actions/cms/accounting`; `type PayeeProfile`, `type PayeeType`, `type InvoiceStatus` from shapes; `type LinkableUser` from the actions module.
- Produces: `PayeeProfile({ profile, linkableUsers })` client component; the server page at `/admin/financials/payees/[id]`.

- [ ] **Step 1: Write the failing component test**

Create `tests/financials/payee-profile-ui.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("@/actions/cms/accounting", () => ({
  payeeProfileAction: vi.fn(),
  updatePayeeAction: vi.fn(),
}))

import { PayeeProfile } from "@/components/cms/financials/PayeeProfile"
import type { PayeeProfile as PayeeProfileData } from "@/lib/financials/accounting/shapes"
import type { LinkableUser } from "@/actions/cms/accounting"

const base: PayeeProfileData = {
  payee: { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: null, kycCustomerName: null, notes: "vip", userId: null, agreementUrl: null, createdAt: "2026-01-01T00:00:00.000Z" },
  user: null,
  kyc: null,
  invoices: [],
  payments: [],
  totals: { payeeId: "pe1", payeeName: "Ada", invoiceCount: 0, totalUsd: 0, totalDiesel: 0 },
}
const users: LinkableUser[] = [{ id: "u1", name: "Ada Dev", email: "ada@x.io", avatarUrl: null, role: "AUTHOR" }]

beforeEach(() => cleanup())

describe("PayeeProfile", () => {
  it("renders the payee name and the link-user control when unlinked", () => {
    const { getByText, getByRole } = render(<PayeeProfile profile={base} linkableUsers={users} />)
    expect(getByText("Ada")).toBeTruthy()
    expect(getByText(/Link to a team member/i)).toBeTruthy()
    expect(getByRole("link", { name: /Back to Accounting/i })).toBeTruthy()
  })

  it("shows the linked user's details when linked", () => {
    const linked: PayeeProfileData = { ...base, user: { id: "u1", name: "Ada Dev", email: "ada@x.io", avatarUrl: null, bio: "math", twitter: null, status: null, role: "AUTHOR" } }
    const { getByText } = render(<PayeeProfile profile={linked} linkableUsers={users} />)
    expect(getByText("Ada Dev")).toBeTruthy()
    expect(getByText(/Unlink/i)).toBeTruthy()
  })

  it("reveals the edit form when Edit is clicked", () => {
    const { getByText } = render(<PayeeProfile profile={base} linkableUsers={users} />)
    fireEvent.click(getByText("Edit"))
    expect(getByText("Save")).toBeTruthy()
  })
})
```

- [ ] **Step 2: Run — verify it fails**

Run: `CI=true npx vitest run tests/financials/payee-profile-ui.test.tsx`
Expected: FAIL — the component module does not exist.

- [ ] **Step 3: Create the component**

Create `components/cms/financials/PayeeProfile.tsx`:

```tsx
"use client"

import { useState, useTransition, type ReactNode } from "react"
import Link from "next/link"
import { ArrowLeft, Pencil, Link2, Unlink, FileText } from "lucide-react"
import { payeeProfileAction, updatePayeeAction, type LinkableUser } from "@/actions/cms/accounting"
import type { InvoiceStatus, PayeeProfile as PayeeProfileData, PayeeType } from "@/lib/financials/accounting/shapes"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })
const dsl = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 8 })} DIESEL`
const short = (s: string, n = 8) => (s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-4)}` : s)

const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const STATUS_STYLE: Record<InvoiceStatus, string> = {
  OPEN: "bg-sky-900/40 text-sky-300",
  PAID: "bg-emerald-900/40 text-emerald-300",
  VOID: "bg-zinc-800 text-zinc-400",
}

type Patch = Parameters<typeof updatePayeeAction>[1]

export function PayeeProfile({ profile: initial, linkableUsers }: { profile: PayeeProfileData; linkableUsers: LinkableUser[] }) {
  const [profile, setProfile] = useState(initial)
  const [editing, setEditing] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const { payee, user, kyc, invoices, payments, totals } = profile

  function run(patch: Patch, after?: () => void) {
    setError(null)
    startTransition(async () => {
      const r = await updatePayeeAction(payee.id, patch)
      if (!r.ok) { setError(r.error); return }
      after?.()
      const fresh = await payeeProfileAction(payee.id)
      if (fresh.ok) setProfile(fresh.profile)
    })
  }

  return (
    <div className="space-y-6">
      <Link href="/admin/financials/accounting" className="inline-flex items-center gap-1 text-sm text-zinc-400 hover:text-zinc-200">
        <ArrowLeft size={14} /> Back to Accounting
      </Link>

      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-white">{payee.name}</h1>
          <div className="mt-1 flex items-center gap-2">
            <span className="rounded bg-zinc-800 px-1.5 py-0.5 text-[10px] font-medium text-zinc-300">{payee.type}</span>
            {kyc ? <span className="rounded bg-emerald-900/40 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">KYC: {kyc.status}</span> : null}
          </div>
        </div>
        <button onClick={() => setEditing((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
          <Pencil size={13} /> {editing ? "Close" : "Edit"}
        </button>
      </div>

      {error ? <p className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {editing ? <EditForm payee={payee} disabled={pending} onSave={(patch) => run(patch, () => setEditing(false))} /> : null}

      <UserCard user={user} linkableUsers={linkableUsers} disabled={pending}
        onLink={(userId) => run({ userId })} onUnlink={() => run({ userId: null })} />

      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Invoices" value={String(totals.invoiceCount)} />
        <Metric label="Paid (USD)" value={usd(totals.totalUsd)} />
        <Metric label="Paid (DIESEL)" value={dsl(totals.totalDiesel)} />
        <Metric label="Open invoices" value={String(invoices.filter((i) => i.status === "OPEN").length)} />
      </div>

      <AgreementCard url={payee.agreementUrl} disabled={pending}
        onUploaded={(agreementUrl) => run({ agreementUrl })} onClear={() => run({ agreementUrl: null })} onError={setError} />

      <Section title={`Invoices (${invoices.length})`}>
        {invoices.length === 0 ? <Empty>No invoices for this payee.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Ref</th><th className="text-right">USD</th><th>Status</th><th>Settled by</th><th>PDF</th></tr></thead>
            <tbody>
              {invoices.map((i) => {
                const settling = payments.filter((p) => p.invoiceId === i.id)
                return (
                  <tr key={i.id} className="border-t border-zinc-900">
                    <td className="py-2 font-mono text-zinc-300">{i.ref}</td>
                    <td className="text-right text-zinc-200">{usd(i.amountUsd)}</td>
                    <td><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                    <td className="font-mono text-xs text-zinc-400">{settling.length === 0 ? "—" : settling.map((p) => <a key={p.id} href={`https://mempool.space/tx/${p.txid}`} target="_blank" rel="noreferrer" className="mr-1 underline">{short(p.txid)}</a>)}</td>
                    <td>{i.pdfUrl ? <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">PDF</a> : "—"}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )}
      </Section>

      <Section title={`Payments (${payments.length})`}>
        {payments.length === 0 ? <Empty>No DIESEL payments tied to this payee.</Empty> : (
          <table className="w-full text-sm">
            <thead><tr className="text-left text-xs text-zinc-500"><th className="py-1.5">Txid</th><th className="text-right">DIESEL</th><th>Paid</th><th>Invoice</th></tr></thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-zinc-900">
                  <td className="py-2 font-mono text-xs text-zinc-300"><a href={`https://mempool.space/tx/${p.txid}`} target="_blank" rel="noreferrer" className="underline">{short(p.txid)}</a></td>
                  <td className="text-right text-zinc-200">{p.amountDiesel.toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                  <td className="text-zinc-400">{p.paidAt.slice(0, 10)}</td>
                  <td className="text-zinc-300">{p.invoiceRef ?? "—"}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )}
      </Section>
    </div>
  )
}

function EditForm({ payee, onSave, disabled }: {
  payee: PayeeProfileData["payee"]
  onSave: (patch: { name: string; type: PayeeType; notes: string | null }) => void
  disabled: boolean
}) {
  const [name, setName] = useState(payee.name)
  const [type, setType] = useState<PayeeType>(payee.type)
  const [notes, setNotes] = useState(payee.notes ?? "")
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as PayeeType)}>
            <option value="PERSON">Person</option>
            <option value="ORG">Organization</option>
          </select>
        </Field>
      </div>
      <Field label="Notes"><input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button disabled={disabled || !name.trim()} onClick={() => onSave({ name, type, notes: notes.trim() || null })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Save</button>
    </div>
  )
}

function UserCard({ user, linkableUsers, onLink, onUnlink, disabled }: {
  user: PayeeProfileData["user"]; linkableUsers: LinkableUser[]
  onLink: (userId: string) => void; onUnlink: () => void; disabled: boolean
}) {
  const [sel, setSel] = useState("")
  if (user) {
    return (
      <div className="flex items-start justify-between rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
        <div className="flex items-start gap-3">
          {user.avatarUrl ? <img src={user.avatarUrl} alt="" className="h-12 w-12 rounded-full object-cover" /> : <div className="h-12 w-12 rounded-full bg-zinc-800" />}
          <div>
            <div className="font-semibold text-white">{user.name ?? user.email}</div>
            <div className="text-xs text-zinc-500">{user.email} · {user.role}</div>
            {user.bio ? <p className="mt-1 max-w-md text-sm text-zinc-400">{user.bio}</p> : null}
            {user.status ? <p className="mt-0.5 text-xs text-zinc-500">{user.status}</p> : null}
          </div>
        </div>
        <button disabled={disabled} onClick={onUnlink} className="inline-flex items-center gap-1 text-xs text-zinc-500 hover:text-red-300 disabled:opacity-40"><Unlink size={12} /> Unlink</button>
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-center gap-2 rounded-lg border border-dashed border-zinc-800 p-4">
      <span className="inline-flex items-center gap-1 text-sm text-zinc-400"><Link2 size={13} /> Link to a team member:</span>
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100">
        <option value="">Select a user…</option>
        {linkableUsers.map((u) => <option key={u.id} value={u.id}>{(u.name ?? u.email)} ({u.email})</option>)}
      </select>
      <button disabled={disabled || !sel} onClick={() => onLink(sel)} className="rounded bg-sky-700 px-2 py-1 text-sm text-white disabled:opacity-40">Link</button>
    </div>
  )
}

function AgreementCard({ url, onUploaded, onClear, onError, disabled }: {
  url: string | null; onUploaded: (url: string) => void; onClear: () => void; onError: (m: string) => void; disabled: boolean
}) {
  const [uploading, setUploading] = useState(false)
  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/upload-pdf", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Upload failed")
      onUploaded(json.url)
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }
  return (
    <div className="flex flex-wrap items-center gap-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
      <span className="inline-flex items-center gap-1 text-sm text-zinc-300"><FileText size={14} /> Contract / agreement</span>
      {url ? <a href={url} target="_blank" rel="noreferrer" className="text-sky-400 underline">View PDF</a> : <span className="text-sm text-zinc-500">None attached</span>}
      <label className="cursor-pointer text-xs text-zinc-400">
        <input type="file" accept="application/pdf" className="hidden" disabled={disabled || uploading} onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} />
        <span className="rounded border border-zinc-700 px-2 py-1 hover:bg-zinc-800">{uploading ? "Uploading…" : url ? "Replace" : "Upload"}</span>
      </label>
      {url ? <button disabled={disabled} onClick={onClear} className="text-xs text-zinc-500 hover:text-red-300 disabled:opacity-40">Remove</button> : null}
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}
function Field({ label, children }: { label: string; children: ReactNode }) {
  return <label className="block text-xs text-zinc-400">{label}<div className="mt-1">{children}</div></label>
}
function Section({ title, children }: { title: string; children: ReactNode }) {
  return <div><div className="mb-2 text-sm font-semibold text-zinc-300">{title}</div><div className="space-y-2">{children}</div></div>
}
function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">{children}</p>
}
```

- [ ] **Step 4: Run the component test — verify it passes**

Run: `CI=true npx vitest run tests/financials/payee-profile-ui.test.tsx`
Expected: PASS (all 3 cases).

- [ ] **Step 5: Create the server page**

Create `app/admin/financials/payees/[id]/page.tsx`:

```tsx
import { notFound, redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { payeeProfileAction, listLinkableUsersAction } from "@/actions/cms/accounting"
import { PayeeProfile } from "@/components/cms/financials/PayeeProfile"

export const dynamic = "force-dynamic"

export default async function PayeeProfilePage({ params }: { params: Promise<{ id: string }> }) {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  const { id } = await params
  const res = await payeeProfileAction(id)
  if (!res.ok) {
    if (res.error === "not_found") notFound()
    redirect("/admin")
  }

  const usersRes = await listLinkableUsersAction()
  const users = usersRes.ok ? usersRes.users : []

  return <PayeeProfile profile={res.profile} linkableUsers={users} />
}
```

- [ ] **Step 6: Run generate + tsc + the component test — verify green**

Run: `npx prisma generate && npx tsc --noEmit && CI=true npx vitest run tests/financials/payee-profile-ui.test.tsx`
Expected: tsc 0; PASS.

- [ ] **Step 7: Commit**

```bash
git add components/cms/financials/PayeeProfile.tsx "app/admin/financials/payees/[id]/page.tsx" tests/financials/payee-profile-ui.test.tsx
git commit -m "feat(financials): payee profile page + route /admin/financials/payees/[id]

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 8: Wire-up — link payee names + keep Accounting nav active

**Files:**
- Modify: `components/cms/financials/AccountingManager.tsx` (Payees tab cell ~187)
- Modify: `lib/cms/admin-nav.ts` (`isItemActive` ~93-103)
- Test: `tests/cms/admin-nav.test.ts` (`isItemActive` describe ~48); `tests/financials/accounting-ui.test.tsx`

**Interfaces:**
- Consumes: `isItemActive` from admin-nav; the profile route `/admin/financials/payees/[id]`.
- Produces: payee names in the Accounting Payees tab link to the profile; the Accounting nav leaf stays active on `/admin/financials/payees/*`.

- [ ] **Step 1: Write the failing nav test**

In `tests/cms/admin-nav.test.ts`, inside the `describe("isItemActive", ...)` block, add:

```ts
it("keeps Accounting active on a payee profile route", () => {
  expect(isItemActive("/admin/financials/accounting", "/admin/financials/payees/abc123")).toBe(true)
  expect(isItemActive("/admin/financials/accounting", "/admin/financials/accounting")).toBe(true)
  expect(isItemActive("/admin/financials/treasury", "/admin/financials/payees/abc123")).toBe(false)
})
```

- [ ] **Step 2: Write the failing AccountingManager link test**

In `tests/financials/accounting-ui.test.tsx`, change the existing `import { render, cleanup } from "@testing-library/react"` line to `import { render, cleanup, fireEvent } from "@testing-library/react"` (do not add a second import line). Then add (uses the existing `payee`/`ok` factories):

```ts
it("links a payee name to its profile in the Payees tab", () => {
  const { getByText, getByRole } = render(<AccountingManager initial={ok({ payees: [payee()] })} />)
  fireEvent.click(getByText("Payees"))
  const link = getByRole("link", { name: /Ada/ })
  expect(link.getAttribute("href")).toBe("/admin/financials/payees/pe1")
})
```

- [ ] **Step 3: Run — verify both fail**

Run: `CI=true npx vitest run tests/cms/admin-nav.test.ts tests/financials/accounting-ui.test.tsx`
Expected: FAIL — nav doesn't special-case payees; the payee name is plain text, not a link.

- [ ] **Step 4: Implement the nav branch**

In `lib/cms/admin-nav.ts`, in `isItemActive`, add before the final `return pathname === href`:

```ts
  if (href === "/admin/financials/accounting") {
    return pathname === "/admin/financials/accounting" || pathname.startsWith("/admin/financials/payees")
  }
```

- [ ] **Step 5: Implement the payee link**

In `components/cms/financials/AccountingManager.tsx`, add the import at the top:

```ts
import Link from "next/link"
```

In the Payees-tab table body, replace the name cell:

```tsx
                    <td className="py-2 text-zinc-200">{t.payeeName}{pe?.kycIntakeId ? <KycBadge /> : null}</td>
```

with:

```tsx
                    <td className="py-2 text-zinc-200">
                      <Link href={`/admin/financials/payees/${t.payeeId}`} className="text-sky-300 hover:underline">{t.payeeName}</Link>
                      {pe?.kycIntakeId ? <KycBadge /> : null}
                    </td>
```

- [ ] **Step 6: Run — verify both pass**

Run: `npx tsc --noEmit && CI=true npx vitest run tests/cms/admin-nav.test.ts tests/financials/accounting-ui.test.tsx`
Expected: tsc 0; PASS.

- [ ] **Step 7: Commit**

```bash
git add components/cms/financials/AccountingManager.tsx lib/cms/admin-nav.ts tests/cms/admin-nav.test.ts tests/financials/accounting-ui.test.tsx
git commit -m "feat(financials): link payee names to profile + keep Accounting nav active

Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>"
```

---

### Task 9: Full verification + branch finish

**Files:** none (verification + PR).

- [ ] **Step 1: Full gate**

Run: `npx prisma generate && npx tsc --noEmit && CI=true npx vitest run && npx next build`
Expected: tsc 0; vitest all green (existing + new); `next build` 0 errors.

- [ ] **Step 2: Sanity-check the migration is additive**

Run: `npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --script` is not needed; instead confirm the only schema delta vs main is the three additive lines:

Run: `git diff main -- prisma/schema.prisma`
Expected: only the `Payee.userId`/`user`/`agreementUrl` additions and `User.payee` back-relation — all nullable/relation (no column drops, no non-null without default).

- [ ] **Step 3: Push the branch and open the PR**

```bash
git push -u origin feat/financials-payee-profiles
gh pr create --title "Financials: payee profiles" --body "Per-payee profile pages for the Accounting ledger. See docs/superpowers/plans/2026-06-22-financials-payee-profiles.md. Additive migration (Payee.userId @unique, Payee.agreementUrl, User.payee). Gated on financials.view.

🤖 Generated with [Claude Code](https://claude.com/claude-code)"
```

- [ ] **Step 4: Use the finishing-a-development-branch skill** to decide merge + deploy (Cloud Build short-sha → bump `newTag` in `k8s/kustomization.yaml` via PR → Flux reconcile; the migrate initContainer applies the additive columns). The deploy mechanics are owned by the human (Vitor) — do not self-merge.

---

## Notes for the implementer

- **Prisma client first.** If `tsc` complains that `userId`/`agreementUrl`/`user`/`payee` don't exist on the Prisma types, you forgot `npx prisma generate` after Task 1.
- **`mapPayee` reads only `kycIntake.customerName`.** Passing the richer `{ id, customerName, status }` include from `loadPayeeProfile` is fine structurally.
- **Idempotent `revalidatePath` for a dynamic route:** calling `revalidatePath('/admin/financials/payees/${id}')` with the concrete id is correct and matches how the codebase revalidates dynamic admin pages.
- **No page-level test for the route** — consistent with the existing accounting page (only the manager component is unit-tested); the server guard + 307/notFound behavior is covered by live verification.
- **CI "Test" job can flake** — re-run if a transient failure appears (per project runbook).
