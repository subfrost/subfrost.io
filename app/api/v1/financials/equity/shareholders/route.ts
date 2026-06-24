import { NextRequest, NextResponse } from "next/server"
import { EquityError, createShareholder } from "@/lib/financials/equity/store"
import type { HolderType } from "@/lib/financials/equity/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/financials/equity/shareholders — create a shareholder. Mirrors
// createShareholderAction (audit: equity_shareholder_upsert).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      name?: string; type?: HolderType; email?: string | null
      userId?: string | null; payeeId?: string | null; notes?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    if (!body.name || !body.type) return fail("name and type are required", 400)
    try {
      const value = await createShareholder({
        name: body.name, type: body.type, email: body.email ?? null,
        userId: body.userId ?? null, payeeId: body.payeeId ?? null, notes: body.notes ?? null,
      })
      await audit("equity_shareholder_upsert", { actorId: actor.id, target: value.name })
      return ok(value, 201)
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}
