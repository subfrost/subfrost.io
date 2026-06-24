import { NextRequest, NextResponse } from "next/server"
import bcrypt from "bcryptjs"
import prisma from "@/lib/prisma"
import { audit } from "@/lib/cms/audit"
import { revokeAllUserSessions } from "@/lib/cms/session-store"
import { requireScope, requireOutranks, readJson, ok, fail, guard } from "@/lib/cms/api-route"
import type { Role } from "@/lib/cms/privileges"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/users/:id/password — reset a user's password (scope:
// iam.modify_user). Bumps tokenVersion + revokes all the target's sessions.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "iam.modify_user")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const body = await readJson<{ password?: string }>(req)
    if (body instanceof NextResponse) return body
    const password = String(body.password ?? "")
    if (password.length < 8) return fail("Password must be at least 8 characters", 400)
    if (id === actor.id) return fail("Use the account endpoints to change your own password", 400)

    const target = await prisma.user.findUnique({ where: { id } })
    if (!target) return fail("User not found", 404)
    const outrank = requireOutranks(actor, target.role as Role)
    if (outrank) return outrank

    await prisma.user.update({
      where: { id },
      data: { passwordHash: await bcrypt.hash(password, 12), tokenVersion: { increment: 1 } },
    })
    await revokeAllUserSessions(id)
    await audit("reset_password", { actorId: actor.id, target: target.email })
    return ok({ ok: true })
  })
}
