import { NextRequest, NextResponse } from "next/server"
import { EquityError, updateShareholder, deleteShareholder } from "@/lib/financials/equity/store"
import type { HolderType } from "@/lib/financials/equity/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/v1/financials/equity/shareholders/:id — update a shareholder.
// Mirrors updateShareholderAction (audit: equity_shareholder_upsert).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const body = await readJson<{
      name?: string; type?: HolderType; email?: string | null
      userId?: string | null; payeeId?: string | null; notes?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    try {
      const value = await updateShareholder(id, body)
      await audit("equity_shareholder_upsert", { actorId: actor.id, target: value.name })
      return ok(value)
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}

// DELETE /api/v1/financials/equity/shareholders/:id — delete a shareholder
// (holdings cascade). Mirrors deleteShareholderAction (audit: equity_shareholder_delete).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    try {
      await deleteShareholder(id)
      await audit("equity_shareholder_delete", { actorId: actor.id, target: id })
      return ok({ ok: true })
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}
