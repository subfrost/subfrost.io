"use server"

import { headers } from "next/headers"
import { revalidatePath } from "next/cache"
import { currentUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { syncOpReturn } from "@/lib/marketing/opreturn-sync"

const PATH = "/admin/marketing/cards"
const PRIV = "marketing.view"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

export async function syncOpReturnAction(): Promise<
  { ok: true; value: { fetched: number; upserted: number; latestDate: string | null } } | { ok: false; error: string }
> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(PRIV)) return { ok: false, error: "unauthorized" }
  try {
    const value = await syncOpReturn()
    await audit("marketing_opreturn_sync", { actorId: me.id, details: value, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value }
  } catch (e) {
    return { ok: false, error: e instanceof Error ? e.message : "Sync failed" }
  }
}
