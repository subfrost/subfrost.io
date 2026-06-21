"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import {
  MtlError,
  listEntries,
  seedStates,
  upsertEntry,
  type MtlRow,
} from "@/lib/mtl/admin"

const REQUIRED: Privilege = "MANAGE_AML"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function actor(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(REQUIRED)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}

export async function listMtlAction(): Promise<
  { ok: true; entries: MtlRow[] } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  return { ok: true, entries: await listEntries() }
}

export async function seedMtlAction(): Promise<
  { ok: true; created: number } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  try {
    const { created } = await seedStates()
    await audit("seed_mtl", { actorId: a.me.id, target: null, ip: await ip() })
    revalidatePath("/admin/mtl")
    return { ok: true, created }
  } catch (e) {
    if (e instanceof MtlError) return { ok: false, error: e.message }
    throw e
  }
}

export async function updateMtlAction(
  state: string,
  input: unknown,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await upsertEntry(state, input)
    await audit("update_mtl", { actorId: a.me.id, target: state, ip: await ip() })
    revalidatePath("/admin/mtl")
    return { ok: true }
  } catch (e) {
    if (e instanceof MtlError) return { ok: false, error: e.message }
    throw e
  }
}
