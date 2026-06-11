import { auth } from "@/auth"

export type Role = "ADMIN" | "EDITOR" | "AUTHOR"

const RANK: Record<Role, number> = { AUTHOR: 1, EDITOR: 2, ADMIN: 3 }

export interface SessionUser {
  id: string
  email: string
  name?: string | null
  role: Role
}

/** Returns the signed-in user or null. */
export async function currentUser(): Promise<SessionUser | null> {
  const session = await auth()
  if (!session?.user?.id) return null
  return {
    id: session.user.id,
    email: session.user.email ?? "",
    name: session.user.name,
    role: (session.user.role as Role) ?? "AUTHOR",
  }
}

/** Throws if not signed in or below the required role. */
export async function requireRole(min: Role): Promise<SessionUser> {
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
