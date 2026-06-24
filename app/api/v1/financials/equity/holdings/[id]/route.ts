import { NextRequest, NextResponse } from "next/server"
import { EquityError, deleteHolding } from "@/lib/financials/equity/store"
import { audit } from "@/lib/cms/audit"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// DELETE /api/v1/financials/equity/holdings/:id — delete a holding. Mirrors
// deleteHoldingAction (audit: equity_holding_delete).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    try {
      await deleteHolding(id)
      await audit("equity_holding_delete", { actorId: actor.id, target: id })
      return ok({ ok: true })
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}
