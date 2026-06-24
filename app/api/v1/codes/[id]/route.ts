import { NextRequest, NextResponse } from "next/server"
import type { Prisma } from "@prisma/client"
import { audit } from "@/lib/cms/audit"
import { CodeError, updateCode, deleteCode, type UpdateCodeInput } from "@/lib/referral/admin"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// PATCH /api/v1/codes/:id — update a code (scope: referral.edit).
// Body: { description?, isActive?, ownerTaprootAddress? }.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "referral.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const body = await readJson<UpdateCodeInput>(req)
    if (body instanceof NextResponse) return body
    try {
      const updated = await updateCode(id, body)
      await audit("update_code", {
        actorId: actor.id,
        target: updated.code,
        details: body as Prisma.InputJsonValue,
      })
      return ok({ ok: true })
    } catch (e) {
      if (e instanceof CodeError) return fail(e.message, 400)
      throw e
    }
  })
}

// DELETE /api/v1/codes/:id — delete a code and its redemptions (scope: referral.edit).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "referral.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    try {
      const { code } = await deleteCode(id)
      await audit("delete_code", { actorId: actor.id, target: code })
      return ok({ ok: true, deleted: code })
    } catch (e) {
      if (e instanceof CodeError) return fail(e.message, 404)
      throw e
    }
  })
}
