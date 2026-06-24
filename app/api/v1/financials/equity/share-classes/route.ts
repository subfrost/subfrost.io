import { NextRequest, NextResponse } from "next/server"
import { EquityError, createShareClass } from "@/lib/financials/equity/store"
import type { ShareClassType } from "@/lib/financials/equity/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/financials/equity/share-classes — create a share class. Mirrors
// createShareClassAction (audit: equity_class_upsert).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{
      name?: string; type?: ShareClassType; authorizedShares?: number; parValue?: number | null; notes?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    if (!body.name || !body.type || body.authorizedShares == null) {
      return fail("name, type and authorizedShares are required", 400)
    }
    try {
      const value = await createShareClass({
        name: body.name, type: body.type, authorizedShares: body.authorizedShares,
        parValue: body.parValue ?? null, notes: body.notes ?? null,
      })
      await audit("equity_class_upsert", { actorId: actor.id, target: value.name })
      return ok(value, 201)
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}
