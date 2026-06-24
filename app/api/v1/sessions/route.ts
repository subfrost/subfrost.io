import { NextRequest, NextResponse } from "next/server"
import prisma from "@/lib/prisma"
import { audit } from "@/lib/cms/audit"
import { listUserSessions, revokeAllUserSessions } from "@/lib/cms/session-store"
import { requireScope, requireOutranks, ok, fail, guard, type KeyActor } from "@/lib/cms/api-route"
import type { Role } from "@/lib/cms/privileges"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Resolve + outrank-check the ?user target. */
async function targetUser(req: NextRequest, actor: KeyActor) {
  const userId = req.nextUrl.searchParams.get("user")?.trim()
  if (!userId) return fail("query param 'user' (user id) is required", 400)
  const u = await prisma.user.findUnique({ where: { id: userId }, select: { id: true, email: true, role: true } })
  if (!u) return fail("User not found", 404)
  const outrank = requireOutranks(actor, u.role as Role)
  if (outrank) return outrank
  return u
}

// GET /api/v1/sessions?user=<id> — list a user's active sessions/devices.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "iam.manage_sessions")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const u = await targetUser(req, actor)
    if (u instanceof NextResponse) return u
    const rows = await listUserSessions(u.id)
    const sessions = rows.map((s) => ({
      id: s.id, ip: s.ip, userAgent: s.userAgent, tlsFingerprint: s.tlsFingerprint,
      createdAt: s.createdAt, lastSeenAt: s.lastSeenAt,
    }))
    return ok({ count: sessions.length, sessions })
  })
}

// DELETE /api/v1/sessions?user=<id> — revoke ALL of a user's sessions.
export async function DELETE(req: NextRequest) {
  const actor = await requireScope(req, "iam.manage_sessions")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const u = await targetUser(req, actor)
    if (u instanceof NextResponse) return u
    await revokeAllUserSessions(u.id)
    await audit("revoke_session", { actorId: actor.id, target: `${u.id}:all` })
    return ok({ ok: true })
  })
}
