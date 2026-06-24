import { NextRequest, NextResponse } from "next/server"
import { AccountingError, updateInvoiceStatus } from "@/lib/financials/accounting/store"
import type { InvoiceStatus } from "@/lib/financials/accounting/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/v1/financials/accounting/invoices/:id — update invoice status.
// Mirrors updateInvoiceStatusAction (audit: accounting_invoice_status).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const body = await readJson<{ status?: InvoiceStatus }>(req)
    if (body instanceof NextResponse) return body
    if (!body.status) return fail("status is required", 400)
    try {
      const invoice = await updateInvoiceStatus(id, body.status)
      await audit("accounting_invoice_status", { actorId: actor.id, target: `${invoice.ref} -> ${body.status}` })
      return ok(invoice)
    } catch (e) {
      if (e instanceof AccountingError) return fail(e.message, 400)
      throw e
    }
  })
}
