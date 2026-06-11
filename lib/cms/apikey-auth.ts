import { createHash } from "crypto"
import prisma from "@/lib/prisma"
import type { Role } from "@/lib/cms/authz"

export interface KeyActor {
  id: string
  role: Role
  keyId: string
}

/** Validates a bearer token against the ApiKey table and returns the owning
 *  user as an actor. Touches lastUsedAt. */
export async function actorFromBearer(authHeader: string | null): Promise<KeyActor | null> {
  if (!authHeader?.startsWith("Bearer ")) return null
  const token = authHeader.slice("Bearer ".length).trim()
  if (!token) return null
  const hashed = createHash("sha256").update(token).digest("hex")
  const key = await prisma.apiKey.findUnique({
    where: { hashedKey: hashed },
    include: { createdBy: true },
  })
  if (!key || key.revoked || !key.createdBy.active) return null
  // Best-effort usage timestamp.
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {})
  return { id: key.userId, role: key.createdBy.role as Role, keyId: key.id }
}
