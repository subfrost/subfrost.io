import { NextRequest, NextResponse } from "next/server"
import { AccountingError, listPayments, recordPayment } from "@/lib/financials/accounting/store"
import type { PaymentSource } from "@/lib/financials/accounting/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/financials/accounting/payments — list DIESEL payments (scope: financials.view).
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const payments = await listPayments()
    return ok({ count: payments.length, payments })
  })
}

// POST /api/v1/financials/accounting/payments — record a DIESEL payment
// (idempotent on txid+vout). Mirrors recordPaymentAction (audit:
// accounting_payment_record).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      txid?: string; vout?: number | null; amountDiesel?: number; recipientAddress?: string
      paidAt?: string; blockHeight?: number | null; source?: PaymentSource
    }>(req)
    if (body instanceof NextResponse) return body
    if (!body.txid || body.amountDiesel == null || !body.recipientAddress || !body.paidAt) {
      return fail("txid, amountDiesel, recipientAddress and paidAt are required", 400)
    }
    try {
      const payment = await recordPayment({
        txid: body.txid, vout: body.vout ?? null, amountDiesel: body.amountDiesel,
        recipientAddress: body.recipientAddress, paidAt: body.paidAt,
        blockHeight: body.blockHeight ?? null, source: body.source,
      })
      await audit("accounting_payment_record", { actorId: actor.id, target: payment.txid })
      return ok(payment, 201)
    } catch (e) {
      if (e instanceof AccountingError) return fail(e.message, 400)
      throw e
    }
  })
}
