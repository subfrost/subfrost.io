# Financials › Accounting (DIESEL ledger) Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Build the third Financials page — `/admin/financials/accounting` — to associate DIESEL payments with invoices and payees for the 409A (data model + reconciliation UI).

**Architecture:** Mirrors the Treasury feature. A pure shapes module (types + aggregators, DB-free) under `lib/financials/accounting/shapes.ts`, a thin Prisma store under `lib/financials/accounting/store.ts`, gated server actions in `actions/cms/accounting.ts` (discriminated unions, never throw), a server page + a client `AccountingManager` component, and one new nav leaf. PDFs upload to GCS (`CMS_BUCKET`) via a small parallel helper + route. Additive Prisma migration only.

**Tech Stack:** Next.js 16 (App Router, server actions), React 19, Prisma/Postgres, TypeScript (strict), Tailwind (admin dark theme), Vitest + happy-dom + Testing Library.

## Global Constraints

- **Run `npx prisma generate` before any `tsc`/`vitest`/`build`** — the schema changed (in #59 and again in this task); generated types must be current.
- **Gate everything on `FINANCIALS_PRIVILEGE`** (`@/lib/financials/privilege`, currently `"audit.view"`). One constant; swaps in one line when flex's IAM adds a dedicated financials privilege.
- **Additive migration only** — no destructive schema change. Production applies it via the deploy migrate initContainer (`prisma db push`), like prior schema additions. Do NOT run `prisma db push` locally (no dev DB) — verify with `npx prisma validate` + `npx prisma generate`.
- **branch → PR → merge, never push to `main` directly.** Branch `feat/financials-accounting` already exists and is checked out.
- **Style of the financials/cms files:** double quotes, **no semicolons** (match `lib/financials/treasury/*`, `actions/cms/kyc.ts`, `tests/financials/treasury-*.test.ts`).
- **Never `git add` `.claude/` or `.npmrc`** (untracked, intentional).
- **Verification gates per task:** `npx tsc --noEmit` → 0 errors; `CI=true npx vitest run <file>` → green; final `npx next build` → 0.
- **Windows + Git Bash:** quote paths with spaces (`cd "C:/Alkanes Geral Dev/subfrost.io"`).

---

## File Structure

| File | Responsibility | Task |
|---|---|---|
| `prisma/schema.prisma` | +3 enums, +3 models (Payee/Invoice/DieselPayment), KycIntake back-relation | 1 |
| `lib/financials/accounting/shapes.ts` | Pure row types + aggregators (`summaryMetrics`, `totalsByPayee`, `totalsByPeriod`, `toCsv`) | 2 |
| `tests/financials/accounting-shapes.test.ts` | Unit tests for the pure aggregators | 2 |
| `lib/financials/accounting/store.ts` | Thin Prisma reads/writes → plain rows; `AccountingError` | 3 |
| `tests/financials/accounting-store.test.ts` | Store tests (mock `@/lib/prisma`) | 3 |
| `lib/cms/gcs.ts` | +`uploadPdf` helper (application/pdf, 10MB cap) | 4 |
| `app/api/admin/upload-pdf/route.ts` | Session+privilege-gated PDF upload → `{ url }` | 4 |
| `tests/cms/gcs-pdf.test.ts` | `uploadPdf` validation tests | 4 |
| `lib/cms/audit.ts` | +5 accounting audit action codes | 5 |
| `actions/cms/accounting.ts` | Gated server actions (overview, CRUD, link, CSV) | 5 |
| `tests/financials/accounting-action.test.ts` | Action tests (mock authz/audit/next-cache/store) | 5 |
| `app/admin/financials/accounting/page.tsx` | Server page, gated, renders manager | 6 |
| `components/cms/financials/AccountingManager.tsx` | Client UI (metrics, unlinked alert, ledger, forms, CSV) | 6 |
| `tests/financials/accounting-ui.test.tsx` | Component render-state tests | 6 |
| `lib/cms/admin-nav.ts` | +"Accounting" leaf in the Financials group | 7 |
| `tests/cms/admin-nav.test.ts` | Assert Financials now has 2 leaves | 7 |

---

## Task 1: Prisma data model (additive migration)

**Files:**
- Modify: `prisma/schema.prisma` (add a back-relation line inside `model KycIntake`, append a new section at EOF)

**Interfaces:**
- Consumes: existing `model KycIntake` (line ~538).
- Produces: Prisma models `Payee`, `Invoice`, `DieselPayment` with enums `PayeeType`, `InvoiceStatus`, `PaymentSource`. Generated client types `Payee`, `Invoice`, `DieselPayment` consumed by Task 3.

- [ ] **Step 1: Add the KycIntake back-relation**

In `prisma/schema.prisma`, inside `model KycIntake { … }` (the block starting at ~line 538), add this line right after `dispositions  KycDisposition[]`:

```prisma
  payees        Payee[]
```

- [ ] **Step 2: Append the accounting models at EOF**

Append to the very end of `prisma/schema.prisma`:

```prisma

// ============================================
// FINANCIALS — Accounting (SP-1: DIESEL ledger)
// ============================================

enum PayeeType {
  PERSON
  ORG
}

enum InvoiceStatus {
  OPEN
  PAID
  VOID
}

enum PaymentSource {
  ONCHAIN
  MANUAL
}

model Payee {
  id          String     @id @default(cuid())
  name        String
  type        PayeeType  @default(PERSON)
  kycIntakeId String? // optional link to a KYC'd identity (Stripe Identity)
  kycIntake   KycIntake? @relation(fields: [kycIntakeId], references: [id])
  notes       String?
  createdAt   DateTime   @default(now())
  invoices    Invoice[]

  @@index([name])
}

model Invoice {
  id           String          @id @default(cuid())
  ref          String          @unique // human ref e.g. INV-014
  payeeId      String
  payee        Payee           @relation(fields: [payeeId], references: [id])
  description  String
  amountUsd    Float
  amountDiesel Float? // expected DIESEL (optional; actual comes from payments)
  issuedAt     DateTime
  status       InvoiceStatus   @default(OPEN)
  pdfUrl       String? // GCS object (CMS_BUCKET)
  createdAt    DateTime        @default(now())
  payments     DieselPayment[]

  @@index([payeeId])
  @@index([status])
}

model DieselPayment {
  id               String        @id @default(cuid())
  txid             String // bitcoin txid of the DIESEL transfer
  vout             Int?
  amountDiesel     Float
  recipientAddress String
  paidAt           DateTime // block time
  blockHeight      Int?
  invoiceId        String?
  invoice          Invoice?      @relation(fields: [invoiceId], references: [id])
  source           PaymentSource @default(MANUAL)
  createdAt        DateTime      @default(now())

  @@unique([txid, vout]) // idempotent vs SP-2 ingestion
  @@index([invoiceId])
}
```

- [ ] **Step 3: Validate + generate**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && npx prisma validate && npx prisma generate
```
Expected: `The schema at prisma/schema.prisma is valid 🚀` then `Generated Prisma Client`.

- [ ] **Step 4: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && git add prisma/schema.prisma && git commit -m "feat(financials): accounting data model — Payee/Invoice/DieselPayment"
```

---

## Task 2: Pure shapes + aggregators

**Files:**
- Create: `lib/financials/accounting/shapes.ts`
- Test: `tests/financials/accounting-shapes.test.ts`

**Interfaces:**
- Consumes: nothing (pure module).
- Produces (consumed by Tasks 3, 5, 6):
  - Types `PayeeType`, `InvoiceStatus`, `PaymentSource`, `PayeeRow`, `InvoiceRow`, `PaymentRow`, `SummaryMetrics`, `PayeeTotals`, `PeriodTotals`, `PeriodGranularity`.
  - `round2(n: number): number`
  - `summaryMetrics(invoices: InvoiceRow[], payments: PaymentRow[]): SummaryMetrics`
  - `totalsByPayee(payees: PayeeRow[], invoices: InvoiceRow[], payments: PaymentRow[]): PayeeTotals[]`
  - `periodKey(iso: string, g: PeriodGranularity): string`
  - `totalsByPeriod(invoices: InvoiceRow[], g: PeriodGranularity): PeriodTotals[]`
  - `csvEscape(s: string): string`
  - `toCsv(invoices: InvoiceRow[], payments: PaymentRow[], payees: PayeeRow[]): string`

- [ ] **Step 1: Write the failing test**

Create `tests/financials/accounting-shapes.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import {
  summaryMetrics, totalsByPayee, totalsByPeriod, periodKey, csvEscape, toCsv,
  type InvoiceRow, type PaymentRow, type PayeeRow,
} from "@/lib/financials/accounting/shapes"

const payees: PayeeRow[] = [
  { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", kycCustomerName: "Ada Lovelace", notes: null, createdAt: "2026-01-01T00:00:00.000Z" },
  { id: "pe2", name: "Acme, Inc", type: "ORG", kycIntakeId: null, kycCustomerName: null, notes: null, createdAt: "2026-01-01T00:00:00.000Z" },
]
const invoices: InvoiceRow[] = [
  { id: "i1", ref: "INV-1", payeeId: "pe1", payeeName: "Ada", description: "work", amountUsd: 1000, amountDiesel: 2, issuedAt: "2026-02-10T00:00:00.000Z", status: "PAID", pdfUrl: null, createdAt: "2026-02-10T00:00:00.000Z" },
  { id: "i2", ref: "INV-2", payeeId: "pe1", payeeName: "Ada", description: "more", amountUsd: 500, amountDiesel: null, issuedAt: "2026-05-01T00:00:00.000Z", status: "OPEN", pdfUrl: null, createdAt: "2026-05-01T00:00:00.000Z" },
  { id: "i3", ref: "INV-3", payeeId: "pe2", payeeName: "Acme, Inc", description: "svc", amountUsd: 2000, amountDiesel: 4, issuedAt: "2026-05-20T00:00:00.000Z", status: "PAID", pdfUrl: "https://x/p.pdf", createdAt: "2026-05-20T00:00:00.000Z" },
]
const payments: PaymentRow[] = [
  { id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1ada", paidAt: "2026-02-11T00:00:00.000Z", blockHeight: 1, invoiceId: "i1", invoiceRef: "INV-1", source: "MANUAL", createdAt: "2026-02-11T00:00:00.000Z" },
  { id: "p2", txid: "txb", vout: 0, amountDiesel: 4, recipientAddress: "bc1acme", paidAt: "2026-05-21T00:00:00.000Z", blockHeight: 2, invoiceId: "i3", invoiceRef: "INV-3", source: "ONCHAIN", createdAt: "2026-05-21T00:00:00.000Z" },
  { id: "p3", txid: "txc", vout: null, amountDiesel: 1.5, recipientAddress: "bc1unk", paidAt: "2026-06-01T00:00:00.000Z", blockHeight: null, invoiceId: null, invoiceRef: null, source: "ONCHAIN", createdAt: "2026-06-01T00:00:00.000Z" },
]

describe("summaryMetrics", () => {
  it("sums paid USD, all DIESEL, and counts open + unlinked", () => {
    expect(summaryMetrics(invoices, payments)).toEqual({
      totalPaidUsd: 3000,      // i1 + i3 (PAID)
      totalPaidDiesel: 7.5,    // p1 + p2 + p3
      openInvoices: 1,         // i2
      unlinkedPayments: 1,     // p3
    })
  })
})

describe("totalsByPayee", () => {
  it("rolls up invoice count, paid USD, and linked DIESEL per payee", () => {
    const rows = totalsByPayee(payees, invoices, payments)
    expect(rows.find((r) => r.payeeId === "pe1")).toEqual({ payeeId: "pe1", payeeName: "Ada", invoiceCount: 2, totalUsd: 1000, totalDiesel: 2 })
    expect(rows.find((r) => r.payeeId === "pe2")).toEqual({ payeeId: "pe2", payeeName: "Acme, Inc", invoiceCount: 1, totalUsd: 2000, totalDiesel: 4 })
  })
})

describe("periodKey / totalsByPeriod", () => {
  it("formats month, quarter, year keys (UTC)", () => {
    expect(periodKey("2026-02-10T00:00:00.000Z", "month")).toBe("2026-02")
    expect(periodKey("2026-05-20T00:00:00.000Z", "quarter")).toBe("2026-Q2")
    expect(periodKey("2026-05-20T00:00:00.000Z", "year")).toBe("2026")
  })
  it("aggregates invoices by month, newest first", () => {
    const rows = totalsByPeriod(invoices, "month")
    expect(rows.map((r) => r.period)).toEqual(["2026-05", "2026-02"])
    expect(rows[0]).toEqual({ period: "2026-05", invoiceCount: 2, totalUsd: 2500 })
  })
})

describe("csvEscape", () => {
  it("quotes fields with commas, quotes, or newlines and doubles quotes", () => {
    expect(csvEscape("plain")).toBe("plain")
    expect(csvEscape("Acme, Inc")).toBe('"Acme, Inc"')
    expect(csvEscape('a "b"')).toBe('"a ""b"""')
  })
})

describe("toCsv", () => {
  const csv = toCsv(invoices, payments, payees)
  const lines = csv.split("\n")
  it("emits a header row", () => {
    expect(lines[0]).toBe("Invoice,Payee,Type,Description,Amount USD,Amount DIESEL (expected),Status,Issued,Settling txids,Paid DIESEL,PDF")
  })
  it("emits one row per invoice with settling txids and escaped payee", () => {
    expect(lines).toHaveLength(4) // header + 3 invoices
    const acme = lines.find((l) => l.startsWith("INV-3"))!
    expect(acme).toContain('"Acme, Inc"')
    expect(acme).toContain("txb")
    expect(acme).toContain("2026-05-20")
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/accounting-shapes.test.ts
```
Expected: FAIL — cannot resolve `@/lib/financials/accounting/shapes`.

- [ ] **Step 3: Write the implementation**

Create `lib/financials/accounting/shapes.ts`:

```ts
// Pure types + aggregators for the accounting ledger. DB-free and serializable
// (dates are ISO strings), so every function here is unit-tested without Prisma.

export type PayeeType = "PERSON" | "ORG"
export type InvoiceStatus = "OPEN" | "PAID" | "VOID"
export type PaymentSource = "ONCHAIN" | "MANUAL"

export interface PayeeRow {
  id: string
  name: string
  type: PayeeType
  kycIntakeId: string | null
  kycCustomerName: string | null // resolved from the linked KycIntake, when any
  notes: string | null
  createdAt: string // ISO
}

export interface InvoiceRow {
  id: string
  ref: string
  payeeId: string
  payeeName: string
  description: string
  amountUsd: number
  amountDiesel: number | null
  issuedAt: string // ISO
  status: InvoiceStatus
  pdfUrl: string | null
  createdAt: string // ISO
}

export interface PaymentRow {
  id: string
  txid: string
  vout: number | null
  amountDiesel: number
  recipientAddress: string
  paidAt: string // ISO
  blockHeight: number | null
  invoiceId: string | null
  invoiceRef: string | null // resolved from the linked invoice, when any
  source: PaymentSource
  createdAt: string // ISO
}

export interface SummaryMetrics {
  totalPaidUsd: number // sum amountUsd of PAID invoices
  totalPaidDiesel: number // sum amountDiesel across all payments
  openInvoices: number // count status OPEN
  unlinkedPayments: number // count payments with no invoice
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

export function summaryMetrics(invoices: InvoiceRow[], payments: PaymentRow[]): SummaryMetrics {
  const totalPaidUsd = round2(
    invoices.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amountUsd, 0),
  )
  const totalPaidDiesel = round2(payments.reduce((s, p) => s + p.amountDiesel, 0))
  const openInvoices = invoices.filter((i) => i.status === "OPEN").length
  const unlinkedPayments = payments.filter((p) => p.invoiceId === null).length
  return { totalPaidUsd, totalPaidDiesel, openInvoices, unlinkedPayments }
}

export interface PayeeTotals {
  payeeId: string
  payeeName: string
  invoiceCount: number
  totalUsd: number // sum amountUsd of this payee's PAID invoices
  totalDiesel: number // sum amountDiesel of payments linked to this payee's invoices
}

export function totalsByPayee(
  payees: PayeeRow[],
  invoices: InvoiceRow[],
  payments: PaymentRow[],
): PayeeTotals[] {
  const invoicePayee = new Map(invoices.map((i) => [i.id, i.payeeId]))
  const dieselByPayee = new Map<string, number>()
  for (const p of payments) {
    if (!p.invoiceId) continue
    const payeeId = invoicePayee.get(p.invoiceId)
    if (!payeeId) continue
    dieselByPayee.set(payeeId, (dieselByPayee.get(payeeId) ?? 0) + p.amountDiesel)
  }
  return payees.map((pe) => {
    const own = invoices.filter((i) => i.payeeId === pe.id)
    const totalUsd = round2(own.filter((i) => i.status === "PAID").reduce((s, i) => s + i.amountUsd, 0))
    const totalDiesel = round2(dieselByPayee.get(pe.id) ?? 0)
    return { payeeId: pe.id, payeeName: pe.name, invoiceCount: own.length, totalUsd, totalDiesel }
  })
}

export type PeriodGranularity = "month" | "quarter" | "year"

export interface PeriodTotals {
  period: string // "2026-06" | "2026-Q2" | "2026"
  invoiceCount: number
  totalUsd: number
}

export function periodKey(iso: string, g: PeriodGranularity): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  if (g === "year") return String(y)
  if (g === "quarter") return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
}

export function totalsByPeriod(invoices: InvoiceRow[], g: PeriodGranularity): PeriodTotals[] {
  const acc = new Map<string, { invoiceCount: number; totalUsd: number }>()
  for (const i of invoices) {
    const k = periodKey(i.issuedAt, g)
    const cur = acc.get(k) ?? { invoiceCount: 0, totalUsd: 0 }
    cur.invoiceCount += 1
    cur.totalUsd += i.amountUsd
    acc.set(k, cur)
  }
  return [...acc.entries()]
    .map(([period, v]) => ({ period, invoiceCount: v.invoiceCount, totalUsd: round2(v.totalUsd) }))
    .sort((a, b) => (a.period < b.period ? 1 : -1)) // newest first
}

export function csvEscape(s: string): string {
  if (/[",\n]/.test(s)) return `"${s.replace(/"/g, '""')}"`
  return s
}

const CSV_HEADER = [
  "Invoice", "Payee", "Type", "Description", "Amount USD", "Amount DIESEL (expected)",
  "Status", "Issued", "Settling txids", "Paid DIESEL", "PDF",
]

export function toCsv(invoices: InvoiceRow[], payments: PaymentRow[], payees: PayeeRow[]): string {
  const typeByPayee = new Map(payees.map((p) => [p.id, p.type]))
  const paysByInvoice = new Map<string, PaymentRow[]>()
  for (const p of payments) {
    if (!p.invoiceId) continue
    const arr = paysByInvoice.get(p.invoiceId) ?? []
    arr.push(p)
    paysByInvoice.set(p.invoiceId, arr)
  }
  const lines = [CSV_HEADER.join(",")]
  for (const i of invoices) {
    const pays = paysByInvoice.get(i.id) ?? []
    const txids = pays.map((p) => p.txid).join(" ")
    const paidDiesel = round2(pays.reduce((s, p) => s + p.amountDiesel, 0))
    const row = [
      i.ref, i.payeeName, typeByPayee.get(i.payeeId) ?? "", i.description,
      String(i.amountUsd), i.amountDiesel === null ? "" : String(i.amountDiesel),
      i.status, i.issuedAt.slice(0, 10), txids, String(paidDiesel), i.pdfUrl ?? "",
    ]
    lines.push(row.map((f) => csvEscape(f)).join(","))
  }
  return lines.join("\n")
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/accounting-shapes.test.ts
```
Expected: PASS (all describes green).

- [ ] **Step 5: Typecheck + commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && npx prisma generate && npx tsc --noEmit
git add lib/financials/accounting/shapes.ts tests/financials/accounting-shapes.test.ts
git commit -m "feat(financials): accounting pure shapes + aggregators"
```
Expected: tsc 0 errors.

---

## Task 3: Prisma store

**Files:**
- Create: `lib/financials/accounting/store.ts`
- Test: `tests/financials/accounting-store.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/prisma` default export); row types + `PayeeType`/`InvoiceStatus`/`PaymentSource` from Task 2.
- Produces (consumed by Task 5):
  - `class AccountingError extends Error`
  - `interface InvoiceFilters { payeeId?: string; status?: InvoiceStatus; from?: string; to?: string }`
  - `listPayees(): Promise<PayeeRow[]>`
  - `createPayee(input: { name: string; type: PayeeType; kycIntakeId?: string | null; notes?: string | null }): Promise<PayeeRow>`
  - `listInvoices(filters?: InvoiceFilters): Promise<InvoiceRow[]>`
  - `createInvoice(input: { ref: string; payeeId: string; description: string; amountUsd: number; amountDiesel?: number | null; issuedAt: string; pdfUrl?: string | null }): Promise<InvoiceRow>`
  - `updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<InvoiceRow>`
  - `listPayments(): Promise<PaymentRow[]>`
  - `listUnlinkedPayments(): Promise<PaymentRow[]>`
  - `recordPayment(input: { txid: string; vout?: number | null; amountDiesel: number; recipientAddress: string; paidAt: string; blockHeight?: number | null; source?: PaymentSource }): Promise<PaymentRow>`
  - `linkPayment(paymentId: string, invoiceId: string): Promise<PaymentRow>`

- [ ] **Step 1: Write the failing test**

Create `tests/financials/accounting-store.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => {
  const payee = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() }
  const invoice = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() }
  const dieselPayment = { findMany: vi.fn(), findUnique: vi.fn(), findFirst: vi.fn(), create: vi.fn(), update: vi.fn() }
  const client = { payee, invoice, dieselPayment }
  return { prisma: client, default: client }
})

import {
  AccountingError, createInvoice, createPayee, linkPayment, listInvoices,
  listPayees, listUnlinkedPayments, recordPayment, updateInvoiceStatus,
} from "@/lib/financials/accounting/store"
import prisma from "@/lib/prisma"

const pe = prisma.payee as unknown as Record<string, ReturnType<typeof vi.fn>>
const inv = prisma.invoice as unknown as Record<string, ReturnType<typeof vi.fn>>
const pay = prisma.dieselPayment as unknown as Record<string, ReturnType<typeof vi.fn>>

const D = (s: string) => new Date(s)
beforeEach(() => vi.clearAllMocks())

describe("listPayees", () => {
  it("maps rows and resolves kycCustomerName", async () => {
    pe.findMany.mockResolvedValueOnce([
      { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", notes: null, createdAt: D("2026-01-01T00:00:00Z"), kycIntake: { customerName: "Ada L" } },
    ])
    const rows = await listPayees()
    expect(pe.findMany).toHaveBeenCalledWith({ orderBy: { name: "asc" }, include: { kycIntake: { select: { customerName: true } } } })
    expect(rows[0]).toEqual({ id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: "k1", kycCustomerName: "Ada L", notes: null, createdAt: "2026-01-01T00:00:00.000Z" })
  })
})

describe("createPayee", () => {
  it("rejects an empty name", async () => {
    await expect(createPayee({ name: "  ", type: "PERSON" })).rejects.toBeInstanceOf(AccountingError)
    expect(pe.create).not.toHaveBeenCalled()
  })
  it("trims and creates", async () => {
    pe.create.mockResolvedValueOnce({ id: "pe2", name: "Acme", type: "ORG", kycIntakeId: null, notes: null, createdAt: D("2026-01-02T00:00:00Z"), kycIntake: null })
    const row = await createPayee({ name: " Acme ", type: "ORG" })
    expect(pe.create.mock.calls[0][0].data).toMatchObject({ name: "Acme", type: "ORG", kycIntakeId: null, notes: null })
    expect(row.kycCustomerName).toBeNull()
  })
})

describe("listInvoices", () => {
  it("builds the where clause from filters", async () => {
    inv.findMany.mockResolvedValueOnce([])
    await listInvoices({ payeeId: "pe1", status: "OPEN", from: "2026-01-01", to: "2026-12-31" })
    const arg = inv.findMany.mock.calls[0][0]
    expect(arg.where.payeeId).toBe("pe1")
    expect(arg.where.status).toBe("OPEN")
    expect(arg.where.issuedAt.gte).toEqual(D("2026-01-01"))
    expect(arg.where.issuedAt.lte).toEqual(D("2026-12-31"))
    expect(arg.orderBy).toEqual({ issuedAt: "desc" })
  })
  it("maps payeeName from the included payee", async () => {
    inv.findMany.mockResolvedValueOnce([
      { id: "i1", ref: "INV-1", payeeId: "pe1", description: "w", amountUsd: 100, amountDiesel: null, issuedAt: D("2026-02-01T00:00:00Z"), status: "OPEN", pdfUrl: null, createdAt: D("2026-02-01T00:00:00Z"), payee: { name: "Ada" } },
    ])
    const rows = await listInvoices()
    expect(rows[0].payeeName).toBe("Ada")
    expect(rows[0].issuedAt).toBe("2026-02-01T00:00:00.000Z")
  })
})

describe("createInvoice", () => {
  it("rejects a missing payee", async () => {
    pe.findUnique.mockResolvedValueOnce(null)
    await expect(createInvoice({ ref: "INV-9", payeeId: "nope", description: "x", amountUsd: 1, issuedAt: "2026-02-01" })).rejects.toBeInstanceOf(AccountingError)
    expect(inv.create).not.toHaveBeenCalled()
  })
  it("rejects a duplicate ref", async () => {
    pe.findUnique.mockResolvedValueOnce({ id: "pe1" })
    inv.findUnique.mockResolvedValueOnce({ id: "i1" })
    await expect(createInvoice({ ref: "INV-1", payeeId: "pe1", description: "x", amountUsd: 1, issuedAt: "2026-02-01" })).rejects.toBeInstanceOf(AccountingError)
    expect(inv.create).not.toHaveBeenCalled()
  })
  it("creates when valid", async () => {
    pe.findUnique.mockResolvedValueOnce({ id: "pe1" })
    inv.findUnique.mockResolvedValueOnce(null)
    inv.create.mockResolvedValueOnce({ id: "i2", ref: "INV-2", payeeId: "pe1", description: "x", amountUsd: 50, amountDiesel: 1, issuedAt: D("2026-02-02T00:00:00Z"), status: "OPEN", pdfUrl: null, createdAt: D("2026-02-02T00:00:00Z"), payee: { name: "Ada" } })
    const row = await createInvoice({ ref: " INV-2 ", payeeId: "pe1", description: "x", amountUsd: 50, amountDiesel: 1, issuedAt: "2026-02-02" })
    expect(inv.create.mock.calls[0][0].data.ref).toBe("INV-2")
    expect(row.status).toBe("OPEN")
  })
})

describe("updateInvoiceStatus", () => {
  it("updates and maps", async () => {
    inv.update.mockResolvedValueOnce({ id: "i1", ref: "INV-1", payeeId: "pe1", description: "x", amountUsd: 1, amountDiesel: null, issuedAt: D("2026-02-01T00:00:00Z"), status: "PAID", pdfUrl: null, createdAt: D("2026-02-01T00:00:00Z"), payee: { name: "Ada" } })
    const row = await updateInvoiceStatus("i1", "PAID")
    expect(inv.update.mock.calls[0][0]).toMatchObject({ where: { id: "i1" }, data: { status: "PAID" } })
    expect(row.status).toBe("PAID")
  })
})

describe("recordPayment", () => {
  const base = { txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: "2026-02-11", source: "MANUAL" as const }
  it("creates when none exists (idempotency key not found)", async () => {
    pay.findFirst.mockResolvedValueOnce(null)
    pay.create.mockResolvedValueOnce({ id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: D("2026-02-11T00:00:00Z"), blockHeight: null, invoiceId: null, source: "MANUAL", createdAt: D("2026-02-11T00:00:00Z"), invoice: null })
    const row = await recordPayment(base)
    expect(pay.findFirst).toHaveBeenCalledWith({ where: { txid: "txa", vout: 0 } })
    expect(pay.create).toHaveBeenCalled()
    expect(row.invoiceRef).toBeNull()
  })
  it("updates the existing row (idempotent) when (txid,vout) already present", async () => {
    pay.findFirst.mockResolvedValueOnce({ id: "p1" })
    pay.update.mockResolvedValueOnce({ id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: D("2026-02-11T00:00:00Z"), blockHeight: null, invoiceId: null, source: "MANUAL", createdAt: D("2026-02-11T00:00:00Z"), invoice: null })
    await recordPayment(base)
    expect(pay.create).not.toHaveBeenCalled()
    expect(pay.update.mock.calls[0][0].where).toEqual({ id: "p1" })
  })
})

describe("linkPayment", () => {
  it("rejects when the invoice is missing", async () => {
    inv.findUnique.mockResolvedValueOnce(null)
    await expect(linkPayment("p1", "nope")).rejects.toBeInstanceOf(AccountingError)
  })
  it("links when both exist", async () => {
    inv.findUnique.mockResolvedValueOnce({ id: "i1" })
    pay.findUnique.mockResolvedValueOnce({ id: "p1" })
    pay.update.mockResolvedValueOnce({ id: "p1", txid: "txa", vout: 0, amountDiesel: 2, recipientAddress: "bc1", paidAt: D("2026-02-11T00:00:00Z"), blockHeight: null, invoiceId: "i1", source: "MANUAL", createdAt: D("2026-02-11T00:00:00Z"), invoice: { ref: "INV-1" } })
    const row = await linkPayment("p1", "i1")
    expect(pay.update.mock.calls[0][0]).toMatchObject({ where: { id: "p1" }, data: { invoiceId: "i1" } })
    expect(row.invoiceRef).toBe("INV-1")
  })
})

describe("listUnlinkedPayments", () => {
  it("queries invoiceId null", async () => {
    pay.findMany.mockResolvedValueOnce([])
    await listUnlinkedPayments()
    expect(pay.findMany.mock.calls[0][0].where).toEqual({ invoiceId: null })
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/accounting-store.test.ts
```
Expected: FAIL — cannot resolve `@/lib/financials/accounting/store`.

- [ ] **Step 3: Write the implementation**

Create `lib/financials/accounting/store.ts`:

```ts
// Thin Prisma layer for the accounting ledger. Reached only through the gated
// actions in actions/cms/accounting.ts. Returns plain serializable rows (ISO
// dates). Validation errors throw AccountingError; the action layer maps those
// to { ok: false, error } and never lets them 500.
import prisma from "@/lib/prisma"
import type {
  InvoiceRow, InvoiceStatus, PayeeRow, PayeeType, PaymentRow, PaymentSource,
} from "@/lib/financials/accounting/shapes"

export class AccountingError extends Error {}

function mapPayee(r: {
  id: string; name: string; type: string; kycIntakeId: string | null
  notes: string | null; createdAt: Date; kycIntake?: { customerName: string } | null
}): PayeeRow {
  return {
    id: r.id, name: r.name, type: r.type as PayeeType, kycIntakeId: r.kycIntakeId,
    kycCustomerName: r.kycIntake?.customerName ?? null, notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }
}

function mapInvoice(r: {
  id: string; ref: string; payeeId: string; description: string; amountUsd: number
  amountDiesel: number | null; issuedAt: Date; status: string; pdfUrl: string | null
  createdAt: Date; payee?: { name: string } | null
}): InvoiceRow {
  return {
    id: r.id, ref: r.ref, payeeId: r.payeeId, payeeName: r.payee?.name ?? "",
    description: r.description, amountUsd: r.amountUsd, amountDiesel: r.amountDiesel,
    issuedAt: r.issuedAt.toISOString(), status: r.status as InvoiceStatus,
    pdfUrl: r.pdfUrl, createdAt: r.createdAt.toISOString(),
  }
}

function mapPayment(r: {
  id: string; txid: string; vout: number | null; amountDiesel: number; recipientAddress: string
  paidAt: Date; blockHeight: number | null; invoiceId: string | null; source: string
  createdAt: Date; invoice?: { ref: string } | null
}): PaymentRow {
  return {
    id: r.id, txid: r.txid, vout: r.vout, amountDiesel: r.amountDiesel,
    recipientAddress: r.recipientAddress, paidAt: r.paidAt.toISOString(),
    blockHeight: r.blockHeight, invoiceId: r.invoiceId, invoiceRef: r.invoice?.ref ?? null,
    source: r.source as PaymentSource, createdAt: r.createdAt.toISOString(),
  }
}

// ---- payees ----
export async function listPayees(): Promise<PayeeRow[]> {
  const rows = await prisma.payee.findMany({
    orderBy: { name: "asc" },
    include: { kycIntake: { select: { customerName: true } } },
  })
  return rows.map(mapPayee)
}

export async function createPayee(input: {
  name: string; type: PayeeType; kycIntakeId?: string | null; notes?: string | null
}): Promise<PayeeRow> {
  const name = input.name.trim()
  if (!name) throw new AccountingError("Payee name is required")
  const row = await prisma.payee.create({
    data: {
      name, type: input.type, kycIntakeId: input.kycIntakeId || null,
      notes: input.notes?.trim() || null,
    },
    include: { kycIntake: { select: { customerName: true } } },
  })
  return mapPayee(row)
}

// ---- invoices ----
export interface InvoiceFilters {
  payeeId?: string
  status?: InvoiceStatus
  from?: string
  to?: string
}

export async function listInvoices(filters: InvoiceFilters = {}): Promise<InvoiceRow[]> {
  const where: Record<string, unknown> = {}
  if (filters.payeeId) where.payeeId = filters.payeeId
  if (filters.status) where.status = filters.status
  if (filters.from || filters.to) {
    where.issuedAt = {
      ...(filters.from ? { gte: new Date(filters.from) } : {}),
      ...(filters.to ? { lte: new Date(filters.to) } : {}),
    }
  }
  const rows = await prisma.invoice.findMany({
    where, orderBy: { issuedAt: "desc" }, include: { payee: { select: { name: true } } },
  })
  return rows.map(mapInvoice)
}

export async function createInvoice(input: {
  ref: string; payeeId: string; description: string; amountUsd: number
  amountDiesel?: number | null; issuedAt: string; pdfUrl?: string | null
}): Promise<InvoiceRow> {
  const ref = input.ref.trim()
  if (!ref) throw new AccountingError("Invoice ref is required")
  const payee = await prisma.payee.findUnique({ where: { id: input.payeeId } })
  if (!payee) throw new AccountingError("Payee not found")
  const dup = await prisma.invoice.findUnique({ where: { ref } })
  if (dup) throw new AccountingError(`Invoice ref already exists: ${ref}`)
  const row = await prisma.invoice.create({
    data: {
      ref, payeeId: input.payeeId, description: input.description.trim(),
      amountUsd: input.amountUsd, amountDiesel: input.amountDiesel ?? null,
      issuedAt: new Date(input.issuedAt), pdfUrl: input.pdfUrl || null,
    },
    include: { payee: { select: { name: true } } },
  })
  return mapInvoice(row)
}

export async function updateInvoiceStatus(id: string, status: InvoiceStatus): Promise<InvoiceRow> {
  const row = await prisma.invoice
    .update({ where: { id }, data: { status }, include: { payee: { select: { name: true } } } })
    .catch(() => {
      throw new AccountingError("Invoice not found")
    })
  return mapInvoice(row)
}

// ---- payments ----
export async function listPayments(): Promise<PaymentRow[]> {
  const rows = await prisma.dieselPayment.findMany({
    orderBy: { paidAt: "desc" }, include: { invoice: { select: { ref: true } } },
  })
  return rows.map(mapPayment)
}

export async function listUnlinkedPayments(): Promise<PaymentRow[]> {
  const rows = await prisma.dieselPayment.findMany({
    where: { invoiceId: null }, orderBy: { paidAt: "desc" },
    include: { invoice: { select: { ref: true } } },
  })
  return rows.map(mapPayment)
}

export async function recordPayment(input: {
  txid: string; vout?: number | null; amountDiesel: number; recipientAddress: string
  paidAt: string; blockHeight?: number | null; source?: PaymentSource
}): Promise<PaymentRow> {
  const txid = input.txid.trim()
  if (!txid) throw new AccountingError("txid is required")
  const vout = input.vout ?? null
  // Idempotent on (txid, vout): update an existing row, else create. Explicit
  // findFirst (not upsert) keeps it idempotent even when vout is null, since
  // Postgres treats NULLs as distinct in the @@unique index.
  const existing = await prisma.dieselPayment.findFirst({ where: { txid, vout } })
  const data = {
    txid, vout, amountDiesel: input.amountDiesel,
    recipientAddress: input.recipientAddress.trim(), paidAt: new Date(input.paidAt),
    blockHeight: input.blockHeight ?? null, source: input.source ?? "MANUAL",
  }
  const row = existing
    ? await prisma.dieselPayment.update({
        where: { id: existing.id }, data, include: { invoice: { select: { ref: true } } },
      })
    : await prisma.dieselPayment.create({
        data, include: { invoice: { select: { ref: true } } },
      })
  return mapPayment(row)
}

export async function linkPayment(paymentId: string, invoiceId: string): Promise<PaymentRow> {
  const invoice = await prisma.invoice.findUnique({ where: { id: invoiceId } })
  if (!invoice) throw new AccountingError("Invoice not found")
  const payment = await prisma.dieselPayment.findUnique({ where: { id: paymentId } })
  if (!payment) throw new AccountingError("Payment not found")
  const row = await prisma.dieselPayment.update({
    where: { id: paymentId }, data: { invoiceId },
    include: { invoice: { select: { ref: true } } },
  })
  return mapPayment(row)
}
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/accounting-store.test.ts
```
Expected: PASS.

- [ ] **Step 5: Typecheck + commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && npx tsc --noEmit
git add lib/financials/accounting/store.ts tests/financials/accounting-store.test.ts
git commit -m "feat(financials): accounting Prisma store"
```
Expected: tsc 0 errors.

---

## Task 4: PDF upload (GCS helper + route)

**Files:**
- Modify: `lib/cms/gcs.ts` (add `uploadPdf`)
- Create: `app/api/admin/upload-pdf/route.ts`
- Test: `tests/cms/gcs-pdf.test.ts`

**Interfaces:**
- Consumes: existing `UploadResult`, `BUCKET`, `storage()` in `lib/cms/gcs.ts`; `currentUser` + `FINANCIALS_PRIVILEGE`.
- Produces (consumed by Task 6): `uploadPdf(contentType: string, data: Buffer, idHint: string): Promise<UploadResult>`; a `POST /api/admin/upload-pdf` returning `{ url }` or `{ error }`.

- [ ] **Step 1: Write the failing test**

Create `tests/cms/gcs-pdf.test.ts`:

```ts
import { describe, it, expect } from "vitest"
import { uploadPdf } from "@/lib/cms/gcs"

// These two validations run BEFORE any GCS call, so no Storage mock is needed.
describe("uploadPdf validation", () => {
  it("rejects a non-PDF content type", async () => {
    await expect(uploadPdf("image/png", Buffer.from("x"), "inv")).rejects.toThrow(/Unsupported file type/)
  })
  it("rejects a PDF over the 10MB cap", async () => {
    const big = Buffer.alloc(10 * 1024 * 1024 + 1)
    await expect(uploadPdf("application/pdf", big, "inv")).rejects.toThrow(/exceeds 10MB/)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/cms/gcs-pdf.test.ts
```
Expected: FAIL — `uploadPdf` is not exported.

- [ ] **Step 3: Add `uploadPdf` to `lib/cms/gcs.ts`**

Append at the end of `lib/cms/gcs.ts` (after `uploadImage`):

```ts

/** Uploads an invoice PDF buffer under `invoices/` and returns its public URL.
 *  Parallel to uploadImage: validation runs first, so bad input throws before
 *  any GCS call. */
export async function uploadPdf(
  contentType: string,
  data: Buffer,
  idHint: string,
): Promise<UploadResult> {
  if (contentType !== "application/pdf") {
    throw new Error(`Unsupported file type: ${contentType}`)
  }
  if (data.byteLength > 10 * 1024 * 1024) {
    throw new Error("PDF exceeds 10MB limit")
  }
  const safe = idHint.replace(/[^a-z0-9-]/gi, "").slice(0, 40) || "invoice"
  const name = `invoices/${safe}-${data.byteLength}.pdf`
  const file = storage().bucket(BUCKET).file(name)
  await file.save(data, {
    contentType,
    resumable: false,
    metadata: { cacheControl: "public, max-age=31536000" },
  })
  return { url: `https://storage.googleapis.com/${BUCKET}/${name}` }
}
```

- [ ] **Step 4: Create the route handler**

Create `app/api/admin/upload-pdf/route.ts`:

```ts
import { NextRequest, NextResponse } from "next/server"
import { currentUser } from "@/lib/cms/authz"
import { uploadPdf } from "@/lib/cms/gcs"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"

export const runtime = "nodejs"

// Session-authenticated invoice-PDF upload → GCS. Gated on the financials
// privilege. multipart/form-data: file=<application/pdf>.
export async function POST(req: NextRequest) {
  const user = await currentUser()
  if (!user) return NextResponse.json({ error: "Not authenticated" }, { status: 401 })
  if (!user.privileges.includes(FINANCIALS_PRIVILEGE)) {
    return NextResponse.json({ error: "Insufficient privileges" }, { status: 403 })
  }

  const form = await req.formData()
  const file = form.get("file")
  if (!(file instanceof File)) {
    return NextResponse.json({ error: "No file" }, { status: 400 })
  }

  try {
    const data = Buffer.from(await file.arrayBuffer())
    const { url } = await uploadPdf(file.type, data, `${user.id}-${file.name}`)
    return NextResponse.json({ url })
  } catch (e) {
    return NextResponse.json({ error: e instanceof Error ? e.message : "Upload failed" }, { status: 400 })
  }
}
```

- [ ] **Step 5: Run the test + typecheck**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/cms/gcs-pdf.test.ts && npx tsc --noEmit
```
Expected: PASS, tsc 0 errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && git add lib/cms/gcs.ts app/api/admin/upload-pdf/route.ts tests/cms/gcs-pdf.test.ts
git commit -m "feat(financials): invoice PDF upload to GCS (helper + gated route)"
```

---

## Task 5: Gated server actions

**Files:**
- Modify: `lib/cms/audit.ts` (extend the `AuditAction` union)
- Create: `actions/cms/accounting.ts`
- Test: `tests/financials/accounting-action.test.ts`

**Interfaces:**
- Consumes: store functions + `AccountingError` (Task 3); `summaryMetrics`, `toCsv`, row types, `PayeeType`/`InvoiceStatus`/`PaymentSource` (Task 2); `currentUser`/`CmsUser`, `audit`, `FINANCIALS_PRIVILEGE`, `revalidatePath`, `headers`.
- Produces (consumed by Task 6):
  - `interface AccountingOverview { payees: PayeeRow[]; invoices: InvoiceRow[]; payments: PaymentRow[]; metrics: SummaryMetrics }`
  - `type AccountingOverviewResult = { ok: true; overview: AccountingOverview } | { ok: false; error: "unauthorized" }`
  - `type MutResult<T> = { ok: true; value: T } | { ok: false; error: string }`
  - `accountingOverviewAction(): Promise<AccountingOverviewResult>`
  - `createPayeeAction(input): Promise<MutResult<PayeeRow>>`
  - `createInvoiceAction(input): Promise<MutResult<InvoiceRow>>`
  - `updateInvoiceStatusAction(id, status): Promise<MutResult<InvoiceRow>>`
  - `recordPaymentAction(input): Promise<MutResult<PaymentRow>>`
  - `linkPaymentAction(paymentId, invoiceId): Promise<MutResult<PaymentRow>>`
  - `exportLedgerCsvAction(): Promise<MutResult<string>>`

- [ ] **Step 1: Extend the audit action union**

In `lib/cms/audit.ts`, the `AuditAction` union ends at `| "stripe_refund_request"` (~line 47). Add these five lines right after it:

```ts
  | "accounting_payee_create"
  | "accounting_invoice_create"
  | "accounting_invoice_status"
  | "accounting_payment_record"
  | "accounting_payment_link"
```

- [ ] **Step 2: Write the failing test**

Create `tests/financials/accounting-action.test.ts`:

```ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: vi.fn(async () => ({ get: () => null })) }))
vi.mock("@/lib/financials/accounting/store", () => ({
  AccountingError: class AccountingError extends Error {},
  listPayees: vi.fn(),
  listInvoices: vi.fn(),
  listPayments: vi.fn(),
  createPayee: vi.fn(),
  createInvoice: vi.fn(),
  updateInvoiceStatus: vi.fn(),
  recordPayment: vi.fn(),
  linkPayment: vi.fn(),
}))

import {
  accountingOverviewAction, createInvoiceAction, createPayeeAction,
  exportLedgerCsvAction, linkPaymentAction,
} from "@/actions/cms/accounting"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { currentUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import * as store from "@/lib/financials/accounting/store"
import { AccountingError } from "@/lib/financials/accounting/store"

const asUser = (privileges: string[]) => ({ id: "u1", email: "a@b.io", privileges }) as never

beforeEach(() => {
  vi.clearAllMocks()
  vi.mocked(currentUser).mockResolvedValue(asUser([FINANCIALS_PRIVILEGE]))
})

describe("gating", () => {
  it("accountingOverviewAction rejects a caller without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await accountingOverviewAction()).toEqual({ ok: false, error: "unauthorized" })
    expect(store.listInvoices).not.toHaveBeenCalled()
  })
  it("createPayeeAction rejects a caller without the privilege", async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser([]))
    expect(await createPayeeAction({ name: "x", type: "PERSON" })).toEqual({ ok: false, error: "unauthorized" })
    expect(store.createPayee).not.toHaveBeenCalled()
  })
})

describe("accountingOverviewAction", () => {
  it("returns rows + computed metrics", async () => {
    vi.mocked(store.listPayees).mockResolvedValue([])
    vi.mocked(store.listInvoices).mockResolvedValue([
      { id: "i1", ref: "INV-1", payeeId: "pe1", payeeName: "Ada", description: "w", amountUsd: 100, amountDiesel: null, issuedAt: "2026-02-01T00:00:00.000Z", status: "PAID", pdfUrl: null, createdAt: "2026-02-01T00:00:00.000Z" },
    ])
    vi.mocked(store.listPayments).mockResolvedValue([
      { id: "p1", txid: "t", vout: null, amountDiesel: 3, recipientAddress: "bc1", paidAt: "2026-02-02T00:00:00.000Z", blockHeight: null, invoiceId: null, invoiceRef: null, source: "MANUAL", createdAt: "2026-02-02T00:00:00.000Z" },
    ])
    const r = await accountingOverviewAction()
    expect(r.ok).toBe(true)
    if (r.ok) {
      expect(r.overview.metrics).toEqual({ totalPaidUsd: 100, totalPaidDiesel: 3, openInvoices: 0, unlinkedPayments: 1 })
    }
  })
})

describe("createPayeeAction", () => {
  it("creates, audits, and returns the payee", async () => {
    const payee = { id: "pe1", name: "Ada", type: "PERSON" as const, kycIntakeId: null, kycCustomerName: null, notes: null, createdAt: "2026-01-01T00:00:00.000Z" }
    vi.mocked(store.createPayee).mockResolvedValue(payee)
    const r = await createPayeeAction({ name: "Ada", type: "PERSON" })
    expect(r).toEqual({ ok: true, value: payee })
    expect(audit).toHaveBeenCalledWith("accounting_payee_create", expect.objectContaining({ actorId: "u1", target: "Ada" }))
  })
})

describe("createInvoiceAction", () => {
  it("maps an AccountingError to { ok:false, error }", async () => {
    vi.mocked(store.createInvoice).mockRejectedValue(new AccountingError("Invoice ref already exists: INV-1"))
    const r = await createInvoiceAction({ ref: "INV-1", payeeId: "pe1", description: "x", amountUsd: 1, issuedAt: "2026-02-01" })
    expect(r).toEqual({ ok: false, error: "Invoice ref already exists: INV-1" })
  })
})

describe("linkPaymentAction", () => {
  it("links and audits", async () => {
    vi.mocked(store.linkPayment).mockResolvedValue({ id: "p1", txid: "t", vout: null, amountDiesel: 1, recipientAddress: "bc1", paidAt: "2026-02-02T00:00:00.000Z", blockHeight: null, invoiceId: "i1", invoiceRef: "INV-1", source: "MANUAL", createdAt: "2026-02-02T00:00:00.000Z" })
    const r = await linkPaymentAction("p1", "i1")
    expect(r.ok).toBe(true)
    expect(audit).toHaveBeenCalledWith("accounting_payment_link", expect.anything())
  })
})

describe("exportLedgerCsvAction", () => {
  it("returns a CSV string with the header", async () => {
    vi.mocked(store.listPayees).mockResolvedValue([])
    vi.mocked(store.listInvoices).mockResolvedValue([])
    vi.mocked(store.listPayments).mockResolvedValue([])
    const r = await exportLedgerCsvAction()
    expect(r.ok).toBe(true)
    if (r.ok) expect(r.value.split("\n")[0]).toContain("Invoice,Payee,Type")
  })
})
```

- [ ] **Step 3: Run the test to verify it fails**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/accounting-action.test.ts
```
Expected: FAIL — cannot resolve `@/actions/cms/accounting`.

- [ ] **Step 4: Write the implementation**

Create `actions/cms/accounting.ts`:

```ts
"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import {
  AccountingError, createInvoice, createPayee, linkPayment, listInvoices,
  listPayees, listPayments, recordPayment, updateInvoiceStatus,
} from "@/lib/financials/accounting/store"
import {
  summaryMetrics, toCsv, type InvoiceRow, type InvoiceStatus, type PayeeRow,
  type PayeeType, type PaymentRow, type PaymentSource, type SummaryMetrics,
} from "@/lib/financials/accounting/shapes"

const PATH = "/admin/financials/accounting"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(FINANCIALS_PRIVILEGE)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

export interface AccountingOverview {
  payees: PayeeRow[]
  invoices: InvoiceRow[]
  payments: PaymentRow[]
  metrics: SummaryMetrics
}
export type AccountingOverviewResult =
  | { ok: true; overview: AccountingOverview }
  | { ok: false; error: "unauthorized" }

export type MutResult<T> = { ok: true; value: T } | { ok: false; error: string }

export async function accountingOverviewAction(): Promise<AccountingOverviewResult> {
  const g = await gate()
  if (!g.ok) return g
  const [payees, invoices, payments] = await Promise.all([listPayees(), listInvoices(), listPayments()])
  return { ok: true, overview: { payees, invoices, payments, metrics: summaryMetrics(invoices, payments) } }
}

export async function createPayeeAction(input: {
  name: string; type: PayeeType; kycIntakeId?: string | null; notes?: string | null
}): Promise<MutResult<PayeeRow>> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const payee = await createPayee(input)
    await audit("accounting_payee_create", { actorId: g.me.id, target: payee.name, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value: payee }
  } catch (e) {
    if (e instanceof AccountingError) return { ok: false, error: e.message }
    throw e
  }
}

export async function createInvoiceAction(input: {
  ref: string; payeeId: string; description: string; amountUsd: number
  amountDiesel?: number | null; issuedAt: string; pdfUrl?: string | null
}): Promise<MutResult<InvoiceRow>> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const invoice = await createInvoice(input)
    await audit("accounting_invoice_create", { actorId: g.me.id, target: invoice.ref, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value: invoice }
  } catch (e) {
    if (e instanceof AccountingError) return { ok: false, error: e.message }
    throw e
  }
}

export async function updateInvoiceStatusAction(
  id: string,
  status: InvoiceStatus,
): Promise<MutResult<InvoiceRow>> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const invoice = await updateInvoiceStatus(id, status)
    await audit("accounting_invoice_status", { actorId: g.me.id, target: `${invoice.ref} -> ${status}`, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value: invoice }
  } catch (e) {
    if (e instanceof AccountingError) return { ok: false, error: e.message }
    throw e
  }
}

export async function recordPaymentAction(input: {
  txid: string; vout?: number | null; amountDiesel: number; recipientAddress: string
  paidAt: string; blockHeight?: number | null; source?: PaymentSource
}): Promise<MutResult<PaymentRow>> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const payment = await recordPayment(input)
    await audit("accounting_payment_record", { actorId: g.me.id, target: payment.txid, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value: payment }
  } catch (e) {
    if (e instanceof AccountingError) return { ok: false, error: e.message }
    throw e
  }
}

export async function linkPaymentAction(
  paymentId: string,
  invoiceId: string,
): Promise<MutResult<PaymentRow>> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const payment = await linkPayment(paymentId, invoiceId)
    await audit("accounting_payment_link", { actorId: g.me.id, target: `${payment.txid} -> ${payment.invoiceRef}`, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value: payment }
  } catch (e) {
    if (e instanceof AccountingError) return { ok: false, error: e.message }
    throw e
  }
}

export async function exportLedgerCsvAction(): Promise<MutResult<string>> {
  const g = await gate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  const [payees, invoices, payments] = await Promise.all([listPayees(), listInvoices(), listPayments()])
  return { ok: true, value: toCsv(invoices, payments, payees) }
}
```

- [ ] **Step 5: Run the test to verify it passes + typecheck**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/accounting-action.test.ts && npx tsc --noEmit
```
Expected: PASS, tsc 0 errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && git add lib/cms/audit.ts actions/cms/accounting.ts tests/financials/accounting-action.test.ts
git commit -m "feat(financials): gated accounting server actions"
```

---

## Task 6: Page + AccountingManager UI

**Files:**
- Create: `app/admin/financials/accounting/page.tsx`
- Create: `components/cms/financials/AccountingManager.tsx`
- Test: `tests/financials/accounting-ui.test.tsx`

**Interfaces:**
- Consumes: every action from Task 5 + `AccountingOverviewResult`; `totalsByPayee`, row + enum types from Task 2; `currentUser`, `FINANCIALS_PRIVILEGE`.
- Produces: the live page; component prop `AccountingManager({ initial }: { initial: AccountingOverviewResult })`.

- [ ] **Step 1: Write the failing test**

Create `tests/financials/accounting-ui.test.tsx`:

```tsx
import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

vi.mock("@/actions/cms/accounting", () => ({
  accountingOverviewAction: vi.fn(),
  createPayeeAction: vi.fn(),
  createInvoiceAction: vi.fn(),
  updateInvoiceStatusAction: vi.fn(),
  recordPaymentAction: vi.fn(),
  linkPaymentAction: vi.fn(),
  exportLedgerCsvAction: vi.fn(),
}))

import { AccountingManager } from "@/components/cms/financials/AccountingManager"
import type { AccountingOverviewResult } from "@/actions/cms/accounting"
import type { InvoiceRow, PayeeRow, PaymentRow } from "@/lib/financials/accounting/shapes"

const payee = (over: Partial<PayeeRow> = {}): PayeeRow => ({
  id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: null, kycCustomerName: null, notes: null, createdAt: "2026-01-01T00:00:00.000Z", ...over,
})
const invoice = (over: Partial<InvoiceRow> = {}): InvoiceRow => ({
  id: "i1", ref: "INV-1", payeeId: "pe1", payeeName: "Ada", description: "w", amountUsd: 100, amountDiesel: null, issuedAt: "2026-02-01T00:00:00.000Z", status: "OPEN", pdfUrl: null, createdAt: "2026-02-01T00:00:00.000Z", ...over,
})
const payment = (over: Partial<PaymentRow> = {}): PaymentRow => ({
  id: "p1", txid: "txa", vout: null, amountDiesel: 1, recipientAddress: "bc1", paidAt: "2026-02-02T00:00:00.000Z", blockHeight: null, invoiceId: null, invoiceRef: null, source: "MANUAL", createdAt: "2026-02-02T00:00:00.000Z", ...over,
})
const ok = (over: Partial<{ payees: PayeeRow[]; invoices: InvoiceRow[]; payments: PaymentRow[] }> = {}): AccountingOverviewResult => {
  const payees = over.payees ?? []
  const invoices = over.invoices ?? []
  const payments = over.payments ?? []
  return {
    ok: true,
    overview: {
      payees, invoices, payments,
      metrics: { totalPaidUsd: 0, totalPaidDiesel: 0, openInvoices: invoices.filter((i) => i.status === "OPEN").length, unlinkedPayments: payments.filter((p) => p.invoiceId === null).length },
    },
  }
}

beforeEach(() => cleanup())

describe("AccountingManager", () => {
  it("shows the unauthorized message when the result is not ok", () => {
    const { getByText } = render(<AccountingManager initial={{ ok: false, error: "unauthorized" }} />)
    expect(getByText(/do not have access/i)).toBeTruthy()
  })

  it("renders the empty invoices state", () => {
    const { getByText } = render(<AccountingManager initial={ok()} />)
    expect(getByText(/No invoices yet/i)).toBeTruthy()
  })

  it("renders the unlinked-payments alert when a payment is unlinked", () => {
    const { getByText } = render(<AccountingManager initial={ok({ payments: [payment()] })} />)
    expect(getByText(/unlinked payment/i)).toBeTruthy()
  })

  it("renders a status pill and a KYC badge for a KYC'd payee's invoice", () => {
    const { getByText, getAllByText } = render(
      <AccountingManager initial={ok({ payees: [payee({ kycIntakeId: "k1" })], invoices: [invoice({ status: "PAID" })] })} />,
    )
    expect(getByText("PAID")).toBeTruthy()
    expect(getAllByText("KYC").length).toBeGreaterThan(0)
  })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/accounting-ui.test.tsx
```
Expected: FAIL — cannot resolve `@/components/cms/financials/AccountingManager`.

- [ ] **Step 3: Write the component**

Create `components/cms/financials/AccountingManager.tsx`:

```tsx
"use client"

import { useState, useTransition, type ReactNode } from "react"
import {
  accountingOverviewAction, createInvoiceAction, createPayeeAction,
  exportLedgerCsvAction, linkPaymentAction, recordPaymentAction, updateInvoiceStatusAction,
  type AccountingOverviewResult,
} from "@/actions/cms/accounting"
import {
  totalsByPayee, type InvoiceRow, type InvoiceStatus, type PayeeRow,
  type PayeeType, type PaymentRow,
} from "@/lib/financials/accounting/shapes"

const usd = (n: number) => n.toLocaleString("en-US", { style: "currency", currency: "USD" })
const dsl = (n: number) => `${n.toLocaleString("en-US", { maximumFractionDigits: 8 })} DIESEL`
const short = (s: string, n = 8) => (s.length > n * 2 ? `${s.slice(0, n)}…${s.slice(-4)}` : s)

const INPUT = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100"
const STATUS_STYLE: Record<InvoiceStatus, string> = {
  OPEN: "bg-sky-900/40 text-sky-300",
  PAID: "bg-emerald-900/40 text-emerald-300",
  VOID: "bg-zinc-800 text-zinc-400",
}

type View = "invoices" | "payees" | "payments"

export function AccountingManager({ initial }: { initial: AccountingOverviewResult }) {
  const [result, setResult] = useState<AccountingOverviewResult>(initial)
  const [view, setView] = useState<View>("invoices")
  const [open, setOpen] = useState<null | "payee" | "invoice" | "payment">(null)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  if (!result.ok) {
    return <p className="text-sm text-zinc-400">You do not have access to financials.</p>
  }

  const { payees, invoices, payments, metrics } = result.overview
  const payeeById = new Map(payees.map((p) => [p.id, p]))
  const unlinked = payments.filter((p) => p.invoiceId === null)
  const openInvoices = invoices.filter((i) => i.status === "OPEN")
  const payeeTotals = totalsByPayee(payees, invoices, payments)

  function run(fn: () => Promise<{ ok: boolean; error?: string }>) {
    setError(null)
    startTransition(async () => {
      const r = await fn()
      if (!r.ok) setError(r.error ?? "Action failed")
      else {
        setOpen(null)
        setResult(await accountingOverviewAction())
      }
    })
  }

  async function exportCsv() {
    const r = await exportLedgerCsvAction()
    if (!r.ok) {
      setError(r.error)
      return
    }
    const blob = new Blob([r.value], { type: "text/csv" })
    const a = document.createElement("a")
    a.href = URL.createObjectURL(blob)
    a.download = "accounting-ledger.csv"
    a.click()
    URL.revokeObjectURL(a.href)
  }

  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Metric label="Total paid (USD)" value={usd(metrics.totalPaidUsd)} />
        <Metric label="Total paid (DIESEL)" value={dsl(metrics.totalPaidDiesel)} />
        <Metric label="Open invoices" value={String(metrics.openInvoices)} />
        <Metric label="Unlinked payments" value={String(metrics.unlinkedPayments)} accent={metrics.unlinkedPayments > 0} />
      </div>

      {error ? <p className="rounded bg-red-900/40 px-3 py-2 text-sm text-red-300">{error}</p> : null}

      {unlinked.length > 0 ? (
        <div className="rounded-lg border border-yellow-800/60 bg-yellow-900/10 p-4">
          <div className="mb-2 text-sm font-semibold text-yellow-300">
            {unlinked.length} unlinked payment(s) — tie each to an invoice
          </div>
          <div className="space-y-2">
            {unlinked.map((p) => (
              <UnlinkedRow
                key={p.id}
                payment={p}
                openInvoices={openInvoices}
                disabled={pending}
                onLink={(invoiceId) => run(() => linkPaymentAction(p.id, invoiceId))}
              />
            ))}
          </div>
        </div>
      ) : null}

      <div className="flex flex-wrap items-center gap-2">
        {(["invoices", "payees", "payments"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-zinc-800 text-white" : "text-zinc-400 hover:text-zinc-200"}`}
          >
            {v[0].toUpperCase() + v.slice(1)}
          </button>
        ))}
        <div className="ml-auto flex flex-wrap gap-2">
          <Toolbtn onClick={() => setOpen("payee")}>New payee</Toolbtn>
          <Toolbtn onClick={() => setOpen("invoice")}>New invoice</Toolbtn>
          <Toolbtn onClick={() => setOpen("payment")}>Record payment</Toolbtn>
          <Toolbtn onClick={exportCsv}>Export CSV</Toolbtn>
        </div>
      </div>

      {open === "payee" ? (
        <PayeeForm disabled={pending} onCancel={() => setOpen(null)} onSubmit={(input) => run(() => createPayeeAction(input))} />
      ) : null}
      {open === "invoice" ? (
        <InvoiceForm payees={payees} disabled={pending} onError={setError} onCancel={() => setOpen(null)} onSubmit={(input) => run(() => createInvoiceAction(input))} />
      ) : null}
      {open === "payment" ? (
        <PaymentForm disabled={pending} onCancel={() => setOpen(null)} onSubmit={(input) => run(() => recordPaymentAction(input))} />
      ) : null}

      {view === "invoices" ? (
        invoices.length === 0 ? (
          <Empty>No invoices yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5">Ref</th><th>Payee</th><th className="text-right">USD</th>
                <th>Status</th><th>Settled by</th><th>PDF</th><th></th>
              </tr>
            </thead>
            <tbody>
              {invoices.map((i) => {
                const pe = payeeById.get(i.payeeId)
                const settling = payments.filter((p) => p.invoiceId === i.id)
                return (
                  <tr key={i.id} className="border-t border-zinc-900">
                    <td className="py-2 font-mono text-zinc-300">{i.ref}</td>
                    <td className="text-zinc-200">{i.payeeName}{pe?.kycIntakeId ? <KycBadge /> : null}</td>
                    <td className="text-right text-zinc-200">{usd(i.amountUsd)}</td>
                    <td><span className={`rounded px-1.5 py-0.5 text-[10px] font-medium ${STATUS_STYLE[i.status]}`}>{i.status}</span></td>
                    <td className="font-mono text-xs text-zinc-400">
                      {settling.length === 0 ? "—" : settling.map((p) => (
                        <a key={p.id} href={`https://mempool.space/tx/${p.txid}`} target="_blank" rel="noreferrer" className="mr-1 underline">{short(p.txid)}</a>
                      ))}
                    </td>
                    <td>{i.pdfUrl ? <a href={i.pdfUrl} target="_blank" rel="noreferrer" className="text-sky-400 underline">PDF</a> : "—"}</td>
                    <td className="whitespace-nowrap text-right">
                      {i.status !== "PAID" ? (
                        <button disabled={pending} onClick={() => run(() => updateInvoiceStatusAction(i.id, "PAID"))} className="mr-2 text-xs text-emerald-400 hover:underline disabled:opacity-40">Mark paid</button>
                      ) : null}
                      {i.status !== "VOID" ? (
                        <button disabled={pending} onClick={() => run(() => updateInvoiceStatusAction(i.id, "VOID"))} className="text-xs text-zinc-500 hover:underline disabled:opacity-40">Void</button>
                      ) : null}
                    </td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      ) : null}

      {view === "payees" ? (
        payees.length === 0 ? (
          <Empty>No payees yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5">Name</th><th>Type</th><th className="text-right">Invoices</th>
                <th className="text-right">Paid (USD)</th><th className="text-right">Paid (DIESEL)</th>
              </tr>
            </thead>
            <tbody>
              {payeeTotals.map((t) => {
                const pe = payeeById.get(t.payeeId)
                return (
                  <tr key={t.payeeId} className="border-t border-zinc-900">
                    <td className="py-2 text-zinc-200">{t.payeeName}{pe?.kycIntakeId ? <KycBadge /> : null}</td>
                    <td className="text-zinc-400">{pe?.type}</td>
                    <td className="text-right text-zinc-300">{t.invoiceCount}</td>
                    <td className="text-right text-zinc-200">{usd(t.totalUsd)}</td>
                    <td className="text-right text-zinc-200">{dsl(t.totalDiesel)}</td>
                  </tr>
                )
              })}
            </tbody>
          </table>
        )
      ) : null}

      {view === "payments" ? (
        payments.length === 0 ? (
          <Empty>No payments yet.</Empty>
        ) : (
          <table className="w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-zinc-500">
                <th className="py-1.5">Txid</th><th className="text-right">DIESEL</th><th>Recipient</th>
                <th>Paid</th><th>Invoice</th><th>Source</th>
              </tr>
            </thead>
            <tbody>
              {payments.map((p) => (
                <tr key={p.id} className="border-t border-zinc-900">
                  <td className="py-2 font-mono text-xs text-zinc-300">
                    <a href={`https://mempool.space/tx/${p.txid}`} target="_blank" rel="noreferrer" className="underline">{short(p.txid)}</a>
                  </td>
                  <td className="text-right text-zinc-200">{p.amountDiesel.toLocaleString("en-US", { maximumFractionDigits: 8 })}</td>
                  <td className="font-mono text-xs text-zinc-400">{short(p.recipientAddress)}</td>
                  <td className="text-zinc-400">{p.paidAt.slice(0, 10)}</td>
                  <td className="text-zinc-300">{p.invoiceRef ?? <span className="text-yellow-400">unlinked</span>}</td>
                  <td className="text-zinc-500">{p.source}</td>
                </tr>
              ))}
            </tbody>
          </table>
        )
      ) : null}
    </div>
  )
}

function Metric({ label, value, accent }: { label: string; value: string; accent?: boolean }) {
  return (
    <div className={`rounded-lg border p-3 ${accent ? "border-yellow-800/60 bg-yellow-900/10" : "border-zinc-800"}`}>
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}

function Toolbtn({ onClick, children }: { onClick: () => void; children: ReactNode }) {
  return (
    <button onClick={onClick} className="rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
      {children}
    </button>
  )
}

function KycBadge() {
  return <span className="ml-1.5 rounded bg-emerald-900/40 px-1 py-0.5 text-[9px] font-medium text-emerald-300">KYC</span>
}

function Empty({ children }: { children: ReactNode }) {
  return <p className="rounded-lg border border-dashed border-zinc-800 p-6 text-center text-sm text-zinc-500">{children}</p>
}

function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block text-xs text-zinc-400">
      {label}
      <div className="mt-1">{children}</div>
    </label>
  )
}

function FormShell({ title, onCancel, children }: { title: string; onCancel: () => void; children: ReactNode }) {
  return (
    <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-950/40 p-4">
      <div className="flex items-center justify-between">
        <div className="text-sm font-semibold text-white">{title}</div>
        <button onClick={onCancel} className="text-xs text-zinc-500 hover:text-zinc-300">Cancel</button>
      </div>
      {children}
    </div>
  )
}

function UnlinkedRow({ payment, openInvoices, onLink, disabled }: {
  payment: PaymentRow; openInvoices: InvoiceRow[]; onLink: (invoiceId: string) => void; disabled: boolean
}) {
  const [sel, setSel] = useState("")
  return (
    <div className="flex flex-wrap items-center gap-2 text-xs">
      <span className="font-mono text-zinc-400">{short(payment.txid)}</span>
      <span className="text-zinc-300">{payment.amountDiesel} DIESEL</span>
      <select value={sel} onChange={(e) => setSel(e.target.value)} className="rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-zinc-100">
        <option value="">Link to invoice…</option>
        {openInvoices.map((i) => <option key={i.id} value={i.id}>{i.ref} — {i.payeeName}</option>)}
      </select>
      <button disabled={disabled || !sel} onClick={() => onLink(sel)} className="rounded bg-sky-700 px-2 py-1 text-white disabled:opacity-40">Link</button>
    </div>
  )
}

function PayeeForm({ onSubmit, onCancel, disabled }: {
  onSubmit: (input: { name: string; type: PayeeType; notes?: string | null }) => void
  onCancel: () => void; disabled: boolean
}) {
  const [name, setName] = useState("")
  const [type, setType] = useState<PayeeType>("PERSON")
  const [notes, setNotes] = useState("")
  return (
    <FormShell title="New payee" onCancel={onCancel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Name"><input className={INPUT} value={name} onChange={(e) => setName(e.target.value)} /></Field>
        <Field label="Type">
          <select className={INPUT} value={type} onChange={(e) => setType(e.target.value as PayeeType)}>
            <option value="PERSON">Person</option>
            <option value="ORG">Organization</option>
          </select>
        </Field>
      </div>
      <Field label="Notes (optional)"><input className={INPUT} value={notes} onChange={(e) => setNotes(e.target.value)} /></Field>
      <button disabled={disabled || !name.trim()} onClick={() => onSubmit({ name, type, notes: notes || null })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Create payee</button>
    </FormShell>
  )
}

function InvoiceForm({ payees, onSubmit, onCancel, onError, disabled }: {
  payees: PayeeRow[]
  onSubmit: (input: { ref: string; payeeId: string; description: string; amountUsd: number; amountDiesel?: number | null; issuedAt: string; pdfUrl?: string | null }) => void
  onCancel: () => void; onError: (msg: string) => void; disabled: boolean
}) {
  const [ref, setRef] = useState("")
  const [payeeId, setPayeeId] = useState(payees[0]?.id ?? "")
  const [description, setDescription] = useState("")
  const [amountUsd, setAmountUsd] = useState("")
  const [amountDiesel, setAmountDiesel] = useState("")
  const [issuedAt, setIssuedAt] = useState(new Date().toISOString().slice(0, 10))
  const [pdfUrl, setPdfUrl] = useState<string | null>(null)
  const [uploading, setUploading] = useState(false)

  async function upload(file: File) {
    setUploading(true)
    try {
      const fd = new FormData()
      fd.append("file", file)
      const res = await fetch("/api/admin/upload-pdf", { method: "POST", body: fd })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? "Upload failed")
      setPdfUrl(json.url)
    } catch (e) {
      onError(e instanceof Error ? e.message : "Upload failed")
    } finally {
      setUploading(false)
    }
  }

  const valid = ref.trim() && payeeId && description.trim() && Number(amountUsd) > 0
  return (
    <FormShell title="New invoice" onCancel={onCancel}>
      {payees.length === 0 ? <p className="text-xs text-yellow-400">Create a payee first.</p> : null}
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Ref"><input className={INPUT} value={ref} onChange={(e) => setRef(e.target.value)} placeholder="INV-014" /></Field>
        <Field label="Payee">
          <select className={INPUT} value={payeeId} onChange={(e) => setPayeeId(e.target.value)}>
            {payees.map((p) => <option key={p.id} value={p.id}>{p.name}</option>)}
          </select>
        </Field>
        <Field label="Amount USD"><input className={INPUT} type="number" value={amountUsd} onChange={(e) => setAmountUsd(e.target.value)} /></Field>
        <Field label="Amount DIESEL (optional)"><input className={INPUT} type="number" value={amountDiesel} onChange={(e) => setAmountDiesel(e.target.value)} /></Field>
        <Field label="Issued"><input className={INPUT} type="date" value={issuedAt} onChange={(e) => setIssuedAt(e.target.value)} /></Field>
        <Field label="PDF (optional)"><input type="file" accept="application/pdf" onChange={(e) => e.target.files?.[0] && upload(e.target.files[0])} className="text-xs text-zinc-400" /></Field>
      </div>
      <Field label="Description"><input className={INPUT} value={description} onChange={(e) => setDescription(e.target.value)} /></Field>
      {pdfUrl ? <p className="text-xs text-emerald-400">PDF attached ✓</p> : uploading ? <p className="text-xs text-zinc-400">Uploading…</p> : null}
      <button disabled={disabled || uploading || !valid} onClick={() => onSubmit({ ref, payeeId, description, amountUsd: Number(amountUsd), amountDiesel: amountDiesel ? Number(amountDiesel) : null, issuedAt, pdfUrl })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Create invoice</button>
    </FormShell>
  )
}

function PaymentForm({ onSubmit, onCancel, disabled }: {
  onSubmit: (input: { txid: string; vout?: number | null; amountDiesel: number; recipientAddress: string; paidAt: string }) => void
  onCancel: () => void; disabled: boolean
}) {
  const [txid, setTxid] = useState("")
  const [vout, setVout] = useState("")
  const [amountDiesel, setAmountDiesel] = useState("")
  const [recipientAddress, setRecipientAddress] = useState("")
  const [paidAt, setPaidAt] = useState(new Date().toISOString().slice(0, 10))
  const valid = txid.trim() && Number(amountDiesel) > 0 && recipientAddress.trim()
  return (
    <FormShell title="Record DIESEL payment" onCancel={onCancel}>
      <div className="grid gap-3 sm:grid-cols-2">
        <Field label="Txid"><input className={INPUT} value={txid} onChange={(e) => setTxid(e.target.value)} /></Field>
        <Field label="Vout (optional)"><input className={INPUT} type="number" value={vout} onChange={(e) => setVout(e.target.value)} /></Field>
        <Field label="Amount DIESEL"><input className={INPUT} type="number" value={amountDiesel} onChange={(e) => setAmountDiesel(e.target.value)} /></Field>
        <Field label="Recipient address"><input className={INPUT} value={recipientAddress} onChange={(e) => setRecipientAddress(e.target.value)} /></Field>
        <Field label="Paid at"><input className={INPUT} type="date" value={paidAt} onChange={(e) => setPaidAt(e.target.value)} /></Field>
      </div>
      <button disabled={disabled || !valid} onClick={() => onSubmit({ txid, vout: vout ? Number(vout) : null, amountDiesel: Number(amountDiesel), recipientAddress, paidAt })} className="rounded-md bg-sky-700 px-3 py-1.5 text-sm text-white disabled:opacity-40">Record payment</button>
    </FormShell>
  )
}
```

- [ ] **Step 4: Create the page**

Create `app/admin/financials/accounting/page.tsx`:

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import { accountingOverviewAction } from "@/actions/cms/accounting"
import { AccountingManager } from "@/components/cms/financials/AccountingManager"

export const dynamic = "force-dynamic"

export default async function AccountingPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes(FINANCIALS_PRIVILEGE)) redirect("/admin")

  const initial = await accountingOverviewAction()

  return (
    <div>
      <h1 className="mb-1 text-2xl font-bold text-white">Accounting</h1>
      <p className="mb-6 text-sm text-zinc-500">
        DIESEL payments reconciled to invoices and payees — the ledger for the 409A.
      </p>
      <AccountingManager initial={initial} />
    </div>
  )
}
```

- [ ] **Step 5: Run the test to verify it passes + typecheck**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/financials/accounting-ui.test.tsx && npx tsc --noEmit
```
Expected: PASS, tsc 0 errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && git add app/admin/financials/accounting/page.tsx components/cms/financials/AccountingManager.tsx tests/financials/accounting-ui.test.tsx
git commit -m "feat(financials): accounting page + AccountingManager UI"
```

---

## Task 7: Nav leaf

**Files:**
- Modify: `lib/cms/admin-nav.ts` (add a leaf to the `financials` group)
- Test: `tests/cms/admin-nav.test.ts` (assert the group has 2 leaves)

**Interfaces:**
- Consumes: `FINANCIALS_PRIVILEGE`, `ClipboardList` (both already imported in `admin-nav.ts`).
- Produces: the "Accounting" nav leaf at `/admin/financials/accounting`.

- [ ] **Step 1: Update the nav-test expectation (failing first)**

In `tests/cms/admin-nav.test.ts`, inside the `it("shows all 7 groups for ADMIN ...")` test, after the `expect(groups.find((g) => g.key === "billing")!.items).toHaveLength(10)` line, add:

```ts
    expect(groups.find((g) => g.key === "financials")!.items.map((i) => i.href)).toEqual([
      "/admin/financials/treasury", "/admin/financials/accounting",
    ])
```

- [ ] **Step 2: Run the test to verify it fails**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/cms/admin-nav.test.ts
```
Expected: FAIL — financials currently has only `/admin/financials/treasury`.

- [ ] **Step 3: Add the leaf**

In `lib/cms/admin-nav.ts`, the `financials` group currently is:

```ts
  {
    key: "financials", label: "Financials", icon: Banknote, items: [
      { label: "Treasury", href: "/admin/financials/treasury", icon: Wallet, privilege: FINANCIALS_PRIVILEGE },
    ],
  },
```

Replace it with (adds the Accounting leaf):

```ts
  {
    key: "financials", label: "Financials", icon: Banknote, items: [
      { label: "Treasury", href: "/admin/financials/treasury", icon: Wallet, privilege: FINANCIALS_PRIVILEGE },
      { label: "Accounting", href: "/admin/financials/accounting", icon: ClipboardList, privilege: FINANCIALS_PRIVILEGE },
    ],
  },
```

- [ ] **Step 4: Run the test to verify it passes**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run tests/cms/admin-nav.test.ts
```
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && git add lib/cms/admin-nav.ts tests/cms/admin-nav.test.ts
git commit -m "feat(financials): Accounting nav leaf under Financials"
```

---

## Final verification (after all tasks)

- [ ] **Full typecheck:**
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && npx prisma generate && npx tsc --noEmit
```
Expected: 0 errors.

- [ ] **Full test suite** (CI "Test" job is flaky — re-run on a non-deterministic failure):
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && CI=true npx vitest run
```
Expected: all green (focus on `tests/financials/*` and `tests/cms/*`).

- [ ] **Production build:**
```bash
cd "C:/Alkanes Geral Dev/subfrost.io" && npx next build
```
Expected: build completes, 0 errors, the `/admin/financials/accounting` route is listed.

- [ ] **Finish the branch:** use `superpowers:finishing-a-development-branch` → push `feat/financials-accounting`, open a PR (do NOT merge without flex's go). The migration applies in prod via the deploy migrate initContainer; deploy is merge → Cloud Build (short-sha) → bump `newTag` → Flux.

---

## Self-Review (done at plan-writing time)

**Spec coverage:**
- Data model (Payee/Invoice/DieselPayment + KycIntake back-relation) → Task 1. ✓
- Pure aggregators (`summaryMetrics`, `totalsByPayee`, `totalsByPeriod`, `toCsv`) → Task 2. ✓
- Store (filters, unlinked query, idempotent payment, link) → Task 3. ✓
- PDF → GCS (content-type + size cap) → Task 4. ✓
- Gated actions (overview, CRUD, link, CSV; never throw) → Task 5. ✓
- Page + reconciliation-first UI (4 metric cards, unlinked alert, invoices/payees/payments views, forms, status pills, KYC badge, CSV export) → Task 6. ✓
- Nav leaf + nav test → Task 7. ✓
- Gating on `FINANCIALS_PRIVILEGE` → Tasks 4, 5, 6. ✓
- Error handling (unauthorized; PDF reject; store errors → `{ ok:false }`; link referential integrity) → Tasks 3, 4, 5. ✓

**Deferred to SP-2 (per spec non-goals, not in this plan):** on-chain DIESEL ingestion, DIESEL pricing/oracle, double-entry/GL/tax.

**Type consistency:** row types (`PayeeRow`/`InvoiceRow`/`PaymentRow`) and the `MutResult<T>` / `AccountingOverviewResult` unions are defined once (Tasks 2 + 5) and referenced verbatim by store, actions, and UI. Store mapper field names match the Prisma model fields from Task 1. Audit action codes added in Task 5 match the strings the actions emit.

**Placeholders:** none — every code step contains complete, runnable content.
