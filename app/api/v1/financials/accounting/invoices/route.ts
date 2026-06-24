import { NextRequest, NextResponse } from "next/server"
import { AccountingError, createInvoice, listInvoices } from "@/lib/financials/accounting/store"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/financials/accounting/invoices — list invoices (scope: financials.view).
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const invoices = await listInvoices()
    return ok({ count: invoices.length, invoices })
  })
}

// POST /api/v1/financials/accounting/invoices — create an invoice. Mirrors
// createInvoiceAction (audit: accounting_invoice_create).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      ref?: string; payeeId?: string; description?: string; amountUsd?: number
      amountDiesel?: number | null; issuedAt?: string; pdfUrl?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    if (!body.ref || !body.payeeId || body.amountUsd == null || !body.issuedAt) {
      return fail("ref, payeeId, amountUsd and issuedAt are required", 400)
    }
    try {
      const invoice = await createInvoice({
        ref: body.ref, payeeId: body.payeeId, description: body.description ?? "",
        amountUsd: body.amountUsd, amountDiesel: body.amountDiesel ?? null,
        issuedAt: body.issuedAt, pdfUrl: body.pdfUrl ?? null,
      })
      await audit("accounting_invoice_create", { actorId: actor.id, target: invoice.ref })
      return ok(invoice, 201)
    } catch (e) {
      if (e instanceof AccountingError) return fail(e.message, 400)
      throw e
    }
  })
}
