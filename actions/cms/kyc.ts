"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import {
  KycError,
  listIntakes,
  recordDisposition,
  type KycDecision,
  type KycIntakeRow,
} from "@/lib/kyc/admin"

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

export async function listIntakesAction(): Promise<
  { ok: true; intakes: KycIntakeRow[] } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  return { ok: true, intakes: await listIntakes() }
}

export async function recordDispositionAction(
  intakeId: string,
  decision: KycDecision,
  notes: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    const { customerName } = await recordDisposition(intakeId, decision, notes, a.me.email)
    await audit("kyc_disposition", { actorId: a.me.id, target: customerName, ip: await ip() })
    revalidatePath("/admin/kyc")
    return { ok: true }
  } catch (e) {
    if (e instanceof KycError) return { ok: false, error: e.message }
    throw e
  }
}
