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
  const existing = await prisma.invoice.findUnique({ where: { id } })
  if (!existing) throw new AccountingError("Invoice not found")
  const row = await prisma.invoice.update({
    where: { id }, data: { status }, include: { payee: { select: { name: true } } },
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
