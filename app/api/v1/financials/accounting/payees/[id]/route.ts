import { NextRequest, NextResponse } from "next/server"
import { AccountingError, loadPayeeProfile, updatePayee } from "@/lib/financials/accounting/store"
import type { PayeeType } from "@/lib/financials/accounting/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// GET /api/v1/financials/accounting/payees/:id — payee profile (scope:
// financials.view). Mirrors payeeProfileAction.
export async function GET(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const profile = await loadPayeeProfile(id)
    if (!profile) return fail("Payee not found", 404)
    return ok(profile)
  })
}

// PATCH /api/v1/financials/accounting/payees/:id — update a payee. Mirrors
// updatePayeeAction (audit: accounting_payee_update).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const body = await readJson<{
      name?: string; type?: PayeeType; notes?: string | null
      kycIntakeId?: string | null; userId?: string | null; agreementUrl?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    try {
      const payee = await updatePayee(id, body)
      await audit("accounting_payee_update", { actorId: actor.id, target: payee.name })
      return ok(payee)
    } catch (e) {
      if (e instanceof AccountingError) return fail(e.message, 400)
      throw e
    }
  })
}
