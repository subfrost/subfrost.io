"use server"

import { createHash, randomBytes } from "crypto"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import prisma from "@/lib/prisma"
import { currentUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

export type CreateKeyResult =
  | { ok: true; token: string; prefix: string }
  | { ok: false; error: string }

/** Mints an API key. The plaintext token is returned ONCE; only its sha-256
 *  hash is stored. Requires MANAGE_API_KEYS. Scopes must be a subset of the
 *  minter's effective privileges; an empty scope list means "unscoped" (inherits
 *  the owner's full privileges at request time). */
export async function createApiKey(
  name: string,
  scopes: Privilege[] = [],
  expiresInDays?: number,
): Promise<CreateKeyResult> {
  const me = await currentUser()
  if (!me || !me.privileges.includes("apikeys.manage")) {
    return { ok: false, error: "You need the Manage API keys privilege" }
  }
  if (!name.trim()) return { ok: false, error: "Name is required" }

  const overreach = scopes.filter((s) => !me.privileges.includes(s))
  if (overreach.length) {
    return { ok: false, error: `You cannot scope a key beyond your own privileges: ${overreach.join(", ")}` }
  }
  const expiresAt =
    expiresInDays && expiresInDays > 0
      ? new Date(Date.now() + expiresInDays * 86_400_000)
      : null

  const token = `sk_${randomBytes(24).toString("hex")}`
  const prefix = token.slice(0, 11)
  const key = await prisma.apiKey.create({
    data: { name: name.trim(), hashedKey: sha256(token), prefix, userId: me.id, scopes, expiresAt },
  })
  await audit("key_mint", { actorId: me.id, target: key.prefix, details: { name: key.name, scopes, expiresAt }, ip: await ip() })
  revalidatePath("/admin/api-keys")
  return { ok: true, token, prefix }
}

export async function revokeApiKey(id: string): Promise<{ ok: boolean }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes("apikeys.manage")) return { ok: false }
  const key = await prisma.apiKey.findUnique({ where: { id } })
  if (!key) return { ok: false }
  // Own keys, or any key if you can manage users (admin oversight).
  if (key.userId !== me.id && !me.privileges.includes("iam.modify_user")) return { ok: false }

  await prisma.apiKey.update({ where: { id }, data: { revoked: true } })
  await audit("key_revoke", { actorId: me.id, target: key.prefix, ip: await ip() })
  revalidatePath("/admin/api-keys")
  return { ok: true }
}
