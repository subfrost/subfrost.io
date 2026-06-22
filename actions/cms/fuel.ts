"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import {
  FuelError,
  listAllocations,
  upsertAllocations,
  deleteAllocation,
  type FuelEntry,
  type ListFuelResult,
} from "@/lib/fuel/admin"

export type FuelActionResult = { ok: true } | { ok: false; error: string }

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function actor(
  required: Privilege,
): Promise<{ ok: true; me: CmsUser } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(required)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}

export async function listAllocationsAction(): Promise<
  ({ ok: true } & ListFuelResult) | { ok: false; error: string }
> {
  const a = await actor("FUEL_VIEW")
  if (!a.ok) return a
  return { ok: true, ...(await listAllocations()) }
}

export async function upsertAllocationsAction(
  entries: FuelEntry[],
): Promise<{ ok: true; count: number } | { ok: false; error: string }> {
  const a = await actor("FUEL_EDIT")
  if (!a.ok) return a
  try {
    const { count } = await upsertAllocations(entries)
    await audit("upsert_fuel", {
      actorId: a.me.id,
      target: entries.length === 1 ? entries[0]?.address : `×${count}`,
      ip: await ip(),
    })
    revalidatePath("/admin/fuel")
    return { ok: true, count }
  } catch (e) {
    if (e instanceof FuelError) return { ok: false, error: e.message }
    throw e
  }
}

export async function deleteAllocationAction(id: string): Promise<FuelActionResult> {
  const a = await actor("FUEL_EDIT")
  if (!a.ok) return a
  try {
    const { address } = await deleteAllocation(id)
    await audit("delete_fuel", { actorId: a.me.id, target: address, ip: await ip() })
    revalidatePath("/admin/fuel")
    return { ok: true }
  } catch (e) {
    if (e instanceof FuelError) return { ok: false, error: e.message }
    throw e
  }
}
