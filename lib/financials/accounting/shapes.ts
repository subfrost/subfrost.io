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
  userId: string | null
  agreementUrl: string | null
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
  // Deep-link into the Files file-viewer for the DriveFile whose gcsObject ===
  // pdfUrl (resolved server-side). Null when no matching DriveFile exists — then
  // callers fall back to the raw pdfUrl. Lets the PDF link open the in-app viewer
  // (with metadata + entity tags) instead of 404ing on the raw GCS object path.
  docHref: string | null
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

export interface UsdPaymentRow {
  id: string
  txid: string | null // optional external reference (wire ref / tx id)
  vout: number | null
  amountUsd: number
  recipientAddress: string | null // optional
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
  totalUsd: number // sum amountUsd of this payee's PAID *USD-denominated* invoices (DIESEL-settled invoices count as $0 USD paid)
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
    // Only USD-denominated invoices (amountDiesel == null) that are PAID count as
    // actual USD paid. DIESEL-denominated invoices settle in DIESEL, so their USD
    // face value belongs to "Paid (DIESEL)", not "Paid (USD)" — mirrors the page metric.
    const totalUsd = round2(
      own.filter((i) => i.status === "PAID" && i.amountDiesel == null).reduce((s, i) => s + i.amountUsd, 0),
    )
    const totalDiesel = round2(dieselByPayee.get(pe.id) ?? 0)
    return { payeeId: pe.id, payeeName: pe.name, invoiceCount: own.length, totalUsd, totalDiesel }
  })
}

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

/** Lightweight summary of a signed/ in-flight e-sign envelope tied to a payee —
 *  powers the "legal paperwork they've signed" section of the payee profile. */
export interface PayeeEnvelopeSummary {
  id: string
  subject: string
  kind: string
  status: string
  createdAt: string // ISO
  completedAt: string | null // ISO
}

export interface PayeeProfile {
  payee: PayeeRow
  user: PayeeUserSummary | null
  kyc: PayeeKycSummary | null
  invoices: InvoiceRow[]
  payments: PaymentRow[] // only those settling this payee's invoices
  envelopes: PayeeEnvelopeSummary[] // legal paperwork tied to this payee
  totals: PayeeTotals
}

/** Pure profile assembler: filters `payments` to the ones tied to this payee's
 *  invoices, computes totals via totalsByPayee, and passes user/kyc/envelopes through. */
export function assemblePayeeProfile(
  payee: PayeeRow,
  user: PayeeUserSummary | null,
  kyc: PayeeKycSummary | null,
  invoices: InvoiceRow[],
  payments: PaymentRow[],
  envelopes: PayeeEnvelopeSummary[] = [],
): PayeeProfile {
  const invoiceIds = new Set(invoices.map((i) => i.id))
  const own = payments.filter((p) => p.invoiceId !== null && invoiceIds.has(p.invoiceId))
  const totals = totalsByPayee([payee], invoices, own)[0]
  return { payee, user, kyc, invoices, payments: own, envelopes, totals }
}

export type PeriodGranularity = "month" | "quarter" | "year"

export interface PeriodTotals {
  period: string // "2026-06" | "2026-Q2" | "2026"
  invoiceCount: number
  issuedUsd: number // Σ amountUsd of invoices issued in the period (any status)
  paidUsd: number // Σ amountUsd of those whose status === "PAID"
  dieselPaid: number // Σ amountDiesel of payments linked to those invoices
}

export function periodKey(iso: string, g: PeriodGranularity): string {
  const d = new Date(iso)
  const y = d.getUTCFullYear()
  if (g === "year") return String(y)
  if (g === "quarter") return `${y}-Q${Math.floor(d.getUTCMonth() / 3) + 1}`
  return `${y}-${String(d.getUTCMonth() + 1).padStart(2, "0")}`
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

export function csvEscape(s: string): string {
  if (/[",\n\r]/.test(s)) return `"${s.replace(/"/g, '""')}"`
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
