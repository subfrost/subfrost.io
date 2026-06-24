import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { audit } from "@/lib/cms/audit"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// DELETE /api/v1/keys/:id — revoke an API key (scope: apikeys.manage).
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "apikeys.manage")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const key = await prisma.apiKey.findUnique({ where: { id }, select: { id: true, prefix: true } })
    if (!key) return fail("API key not found", 404)
    await prisma.apiKey.update({ where: { id }, data: { revoked: true } })
    await audit("key_revoke", { actorId: actor.id, target: key.prefix })
    return ok({ ok: true, revoked: key.prefix })
  })
}
