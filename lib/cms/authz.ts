import { cookies } from "next/headers"
import prisma from "@/lib/prisma"
import { SESSION_COOKIE, verifySession } from "@/lib/cms/session"
import { validateAndTouchSession } from "@/lib/cms/session-store"
import {
  effectivePrivileges,
  type Privilege,
  type Role,
} from "@/lib/cms/privileges"

export type { Role, Privilege }

export interface CmsUser {
  id: string
  email: string
  name: string | null
  role: Role
  avatarUrl: string | null
  /** Effective privileges = role bundle ∪ extra grants. */
  privileges: Privilege[]
  status: string | null
  lastSeenAt: Date | null
  totpEnabled: boolean
  /** Current session id (for self-service session management). */
  jti: string | null
}

/** Reads the session cookie (Next 16: cookies() is async), re-validates the
 *  user against the DB so a deactivated/role-changed account is enforced,
 *  enforces server-side session revocation + tokenVersion, and resolves
 *  effective privileges. */
export async function currentUser(): Promise<CmsUser | null> {
  const jar = await cookies()
  const session = await verifySession(jar.get(SESSION_COOKIE)?.value)
  if (!session) return null
  // A 2FA-pending token is not a real session — reject everywhere but the
  // second login step (which verifies it explicitly).
  if (session.pending2fa) return null
  // Legacy tokens (no jti) predate server-side sessions — force a re-login.
  if (!session.jti) return null

  const user = await prisma.user.findUnique({ where: { id: session.sub } })
  if (!user || !user.active) return null
  // Password change / forced logout bumps tokenVersion, invalidating old JWTs.
  if (typeof session.ver === "number" && session.ver !== user.tokenVersion) return null
  // Server-side revocation + expiry (and presence touch).
  if (!(await validateAndTouchSession(session.jti))) return null

  return {
    id: user.id,
    email: user.email,
    name: user.name,
    role: user.role as Role,
    avatarUrl: user.avatarUrl,
    privileges: effectivePrivileges(user.role as Role, user.privileges),
    status: user.status,
    lastSeenAt: user.lastSeenAt,
    totpEnabled: user.totpEnabled,
    jti: session.jti,
  }
}

export async function requirePrivilege(required: Privilege): Promise<CmsUser> {
  const user = await currentUser()
  if (!user) throw new AuthzError(401, "Not authenticated")
  if (!user.privileges.includes(required)) {
    throw new AuthzError(403, `Missing privilege: ${required}`)
  }
  return user
}

export function userHasPrivilege(user: CmsUser, required: Privilege): boolean {
  return user.privileges.includes(required)
}

// --- Role helpers (retained for back-compat with existing call sites) ---

const RANK: Record<Role, number> = { STAFF: 0, AUTHOR: 1, EDITOR: 2, ADMIN: 3 }

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
