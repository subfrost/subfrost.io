import { NextRequest, NextResponse } from "next/server"
import { EquityError, updateShareClass, deleteShareClass } from "@/lib/financials/equity/store"
import type { ShareClassType } from "@/lib/financials/equity/shapes"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

type Ctx = { params: Promise<{ id: string }> }

// PATCH /api/v1/financials/equity/share-classes/:id — update a share class.
// Mirrors updateShareClassAction (audit: equity_class_upsert).
export async function PATCH(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const body = await readJson<{
      name?: string; type?: ShareClassType; authorizedShares?: number; parValue?: number | null; notes?: string | null
    }>(req)
    if (body instanceof NextResponse) return body
    try {
      const value = await updateShareClass(id, body)
      await audit("equity_class_upsert", { actorId: actor.id, target: value.name })
      return ok(value)
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}

// DELETE /api/v1/financials/equity/share-classes/:id — delete a share class.
// Mirrors deleteShareClassAction (audit: equity_class_delete).
export async function DELETE(req: NextRequest, { params }: Ctx) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    try {
      await deleteShareClass(id)
      await audit("equity_class_delete", { actorId: actor.id, target: id })
      return ok({ ok: true })
    } catch (e) {
      if (e instanceof EquityError) return fail(e.message, 400)
      throw e
    }
  })
}
