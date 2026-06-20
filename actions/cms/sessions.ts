"use server"

import { currentUser } from "@/lib/cms/authz"
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
