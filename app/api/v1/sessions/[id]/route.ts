import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { audit } from "@/lib/cms/audit"
import { revokeSessionById } from "@/lib/cms/session-store"
import { requireScope, requireOutranks, ok, fail, guard } from "@/lib/cms/api-route"
import type { Role } from "@/lib/cms/privileges"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// DELETE /api/v1/sessions/:id?user=<userId> — revoke one session of a user.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "iam.manage_sessions")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const userId = req.nextUrl.searchParams.get("user")?.trim()
    if (!userId) return fail("query param 'user' (user id) is required", 400)
    const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } })
    if (!u) return fail("User not found", 404)
    const outrank = requireOutranks(actor, u.role as Role)
    if (outrank) return outrank
    await revokeSessionById(id, userId)
    await audit("revoke_session", { actorId: actor.id, target: `${userId}:${id}` })
    return ok({ ok: true })
  })
}
