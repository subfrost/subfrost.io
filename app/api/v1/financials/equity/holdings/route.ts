import { NextRequest, NextResponse } from "next/server"
import { EquityError, createHolding } from "@/lib/financials/equity/store"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/financials/equity/holdings — issue a holding. Mirrors
// createHoldingAction (audit: equity_holding_create).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      shareholderId?: string; shareClassId?: string; shares?: number
      issuedAt?: string; certificateNo?: string | null; notes?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    if (!body.shareholderId || !body.shareClassId || body.shares == null || !body.issuedAt) {
      return fail("shareholderId, shareClassId, shares and issuedAt are required", 400)
    }
    try {
      const value = await createHolding({
        shareholderId: body.shareholderId, shareClassId: body.shareClassId,
        shares: body.shares, issuedAt: body.issuedAt,
        certificateNo: body.certificateNo ?? null, notes: body.notes ?? null,
      })
      await audit("equity_holding_create", { actorId: actor.id, target: `${value.shareholderName}:${value.shares}` })
      return ok(value, 201)
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}
