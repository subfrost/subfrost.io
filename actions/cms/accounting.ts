"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import {
  AccountingError, createInvoice, createPayee, linkPayment, listInvoices,
  listPayees, listPayments, recordPayment, updateInvoiceStatus,
  loadPayeeProfile, updatePayee, listLinkableUsers,
} from "@/lib/financials/accounting/store"
import {
  summaryMetrics, toCsv, type InvoiceRow, type InvoiceStatus, type PayeeRow,
  type PayeeType, type PaymentRow, type PaymentSource, type SummaryMetrics,
  type PayeeProfile,
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
