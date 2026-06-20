import { createHash } from "crypto"
import prisma from "@/lib/prisma"
import { effectivePrivileges, type Privilege, type Role } from "@/lib/cms/privileges"

export interface KeyActor {
  id: string
  /** The key's effective privileges: its scopes ∩ the owner's current
   *  privileges. An unscoped key (no scopes) inherits the owner's full set. */
  privileges: Privilege[]
  keyId: string
}

/** Validates a bearer token against the ApiKey table and returns an actor whose
 *  authority is capped to the key's scopes. Rejects revoked/expired keys and
 *  inactive owners. Touches lastUsedAt. */
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
  if (key.expiresAt && key.expiresAt.getTime() < Date.now()) return null

  // Best-effort usage timestamp.
  prisma.apiKey.update({ where: { id: key.id }, data: { lastUsedAt: new Date() } }).catch(() => {})

  const ownerPrivileges = effectivePrivileges(key.createdBy.role as Role, key.createdBy.privileges)
  // Unscoped keys inherit the owner's full privileges (legacy behaviour);
  // scoped keys are capped to the intersection so a key can never exceed its owner.
  const privileges =
    key.scopes.length === 0
      ? ownerPrivileges
      : key.scopes.filter((s) => ownerPrivileges.includes(s))

  return { id: key.userId, privileges, keyId: key.id }
}
