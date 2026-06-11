"use server"

import { createHash, randomBytes } from "crypto"
import { revalidatePath } from "next/cache"
import prisma from "@/lib/prisma"
import { currentUser, hasRole } from "@/lib/cms/authz"

function sha256(token: string): string {
  return createHash("sha256").update(token).digest("hex")
}

export type CreateKeyResult =
  | { ok: true; token: string; prefix: string }
  | { ok: false; error: string }

/** Mints an API key for the admin upload API. The plaintext token is returned
 *  ONCE; only its sha-256 hash is stored. EDITOR+ may create keys. */
export async function createApiKey(name: string): Promise<CreateKeyResult> {
  const me = await currentUser()
  if (!me || !hasRole(me.role, "EDITOR")) return { ok: false, error: "Editor or admin only" }
  if (!name.trim()) return { ok: false, error: "Name is required" }

  const token = `sk_${randomBytes(24).toString("hex")}`
  const prefix = token.slice(0, 11)
  await prisma.apiKey.create({
    data: { name: name.trim(), hashedKey: sha256(token), prefix, userId: me.id },
  })
  revalidatePath("/admin/api-keys")
  return { ok: true, token, prefix }
}

export async function revokeApiKey(id: string): Promise<{ ok: boolean }> {
  const me = await currentUser()
  if (!me || !hasRole(me.role, "EDITOR")) return { ok: false }
  await prisma.apiKey.update({ where: { id }, data: { revoked: true } })
  revalidatePath("/admin/api-keys")
  return { ok: true }
}
