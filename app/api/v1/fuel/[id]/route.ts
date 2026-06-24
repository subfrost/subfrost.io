import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { FuelError, deleteAllocation } from "@/lib/fuel/admin"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// DELETE /api/v1/fuel/:id — delete a FUEL allocation (scope: fuel.edit)
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "fuel.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    try {
      const { address } = await deleteAllocation(id)
      await audit("delete_fuel", { actorId: actor.id, target: address })
      return ok({ ok: true, deleted: address })
    } catch (e) {
      if (e instanceof FuelError) return fail(e.message, 404)
      throw e
    }
  })
}
