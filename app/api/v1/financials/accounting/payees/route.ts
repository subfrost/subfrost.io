import { NextRequest, NextResponse } from "next/server"
import { AccountingError, createPayee, listPayees } from "@/lib/financials/accounting/store"
import type { PayeeType } from "@/lib/financials/accounting/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/financials/accounting/payees — list payees (scope: financials.view).
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const payees = await listPayees()
    return ok({ count: payees.length, payees })
  })
}

// POST /api/v1/financials/accounting/payees — create a payee. Mirrors
// createPayeeAction (audit: accounting_payee_create).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      name?: string; type?: PayeeType; kycIntakeId?: string | null; notes?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    if (!body.name || !body.type) return fail("name and type are required", 400)
    try {
      const payee = await createPayee({
        name: body.name, type: body.type,
        kycIntakeId: body.kycIntakeId ?? null, notes: body.notes ?? null,
      })
      await audit("accounting_payee_create", { actorId: actor.id, target: payee.name })
      return ok(payee, 201)
    } catch (e) {
      if (e instanceof AccountingError) return fail(e.message, 400)
      throw e
    }
  })
}
