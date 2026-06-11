import { cookies } from "next/headers"
import prisma from "@/lib/prisma"
import { SESSION_COOKIE, verifySession } from "@/lib/cms/session"

export type Role = "ADMIN" | "EDITOR" | "AUTHOR"

const RANK: Record<Role, number> = { AUTHOR: 1, EDITOR: 2, ADMIN: 3 }

export interface CmsUser {
  id: string
  email: string
  name: string | null
  role: Role
  avatarUrl: string | null
}

/** Reads the session cookie (Next 16: cookies() is async), re-validates the
 *  user against the DB so a deactivated/role-changed account is enforced. */
export async function currentUser(): Promise<CmsUser | null> {
  const jar = await cookies()
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value)
  if (!session) return null
  const user = await prisma.user.findUnique({ where: { id: session.sub } })
  if (!user || !user.active) return null
  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    avatarUrl: user.avatarUrl,
  }
}

export async function requireRole(min: Role): Promise<CmsUser> {
  const user = await currentUser()
  if (!user) throw new AuthzError(401, "Not authenticated")
  if (RANK[user.role] < RANK[min]) throw new AuthzError(403, "Insufficient role")
  return user
}

export function hasRole(role: Role, min: Role) {
  return RANK[role] >= RANK[min]
}

export class AuthzError extends Error {
  constructor(public status: number, message: string) {
    super(message)
  }
}
