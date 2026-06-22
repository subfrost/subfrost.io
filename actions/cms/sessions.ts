"use server"

import prisma from "@/lib/prisma"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { canManageRole, type Role } from "@/lib/cms/privileges"
import {
  listUserSessions,
  revokeSessionById,
  revokeAllUserSessions,
  type SessionInfo,
} from "@/lib/cms/session-store"
import { audit } from "@/lib/cms/audit"

export async function listMySessions(): Promise<SessionInfo[]> {
  const me = await currentUser()
  if (!me) return []
  return listUserSessions(me.id, me.jti ?? undefined)
}

export async function revokeMySession(
  id: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  await revokeSessionById(id, me.id)
  await audit("revoke_session", { actorId: me.id, target: id })
  return { ok: true }
}

/** "Sign out everywhere else" — revokes all of my sessions except the current one. */
export async function revokeMyOtherSessions(): Promise<{ ok: true } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  await revokeAllUserSessions(me.id, me.jti ?? undefined)
  await audit("revoke_session", { actorId: me.id, target: "all_others" })
  return { ok: true }
}

// --- Admin: view & revoke any user's sessions/devices (iam.manage_sessions) ---

export interface AdminSessionView {
  id: string
  ip: string | null
  userAgent: string | null
  tlsFingerprint: string | null
  createdAt: string
  lastSeenAt: string
}

/** Gate an admin session operation: requires iam.manage_sessions and that the
 *  actor outranks the target (ADMIN may manage peer ADMINs), matching users.ts. */
async function sessionActor(
  userId: string,
): Promise<{ ok: true; me: CmsUser } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes("iam.manage_sessions")) return { ok: false, error: "Insufficient privileges" }
  if (userId !== me.id) {
    const target = await prisma.user.findUnique({ where: { id: userId }, select: { role: true } })
    if (!target) return { ok: false, error: "User not found" }
    const allowed = me.role === "ADMIN" || canManageRole(me.role, target.role as Role)
    if (!allowed) return { ok: false, error: "You cannot manage a user at or above your role" }
  }
  return { ok: true, me }
}

export async function adminListUserSessions(
  userId: string,
): Promise<{ ok: true; sessions: AdminSessionView[] } | { ok: false; error: string }> {
  const g = await sessionActor(userId)
  if (!g.ok) return g
  const rows = await listUserSessions(userId)
  return {
    ok: true,
    sessions: rows.map((s) => ({
      id: s.id,
      ip: s.ip,
      userAgent: s.userAgent,
      tlsFingerprint: s.tlsFingerprint,
      createdAt: s.createdAt.toISOString(),
      lastSeenAt: s.lastSeenAt.toISOString(),
    })),
  }
}

export async function adminRevokeUserSession(
  userId: string,
  sessionId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await sessionActor(userId)
  if (!g.ok) return g
  await revokeSessionById(sessionId, userId)
  await audit("revoke_session", { actorId: g.me.id, target: `${userId}:${sessionId}` })
  return { ok: true }
}

export async function adminRevokeAllUserSessions(
  userId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const g = await sessionActor(userId)
  if (!g.ok) return g
  await revokeAllUserSessions(userId)
  await audit("revoke_session", { actorId: g.me.id, target: `${userId}:all` })
  return { ok: true }
}
