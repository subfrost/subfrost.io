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
  rescreenOfac,
  type KycDecision,
  type KycIntakeRow,
} from "@/lib/kyc/admin"
import { syncStripeIdentity } from "@/lib/kyc/sync"

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

export async function listIntakesAction(): Promise<
  { ok: true; intakes: KycIntakeRow[] } | { ok: false; error: string }
> {
  const a = await actor("AML_VIEW")
  if (!a.ok) return a
  return { ok: true, intakes: await listIntakes() }
}

export async function rescreenOfacAction(): Promise<{ ok: true; screened: number } | { ok: false; error: string }> {
  const a = await actor("AML_EDIT")
  if (!a.ok) return a
  const { screened } = await rescreenOfac()
  await audit("ofac_rescreen", { actorId: a.me.id, target: `${screened} intakes`, ip: await ip() })
  revalidatePath("/admin/kyc")
  return { ok: true, screened }
}

export async function recordDispositionAction(
  intakeId: string,
  decision: KycDecision,
  notes: string | null,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor("AML_EDIT")
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

export async function syncStripeIdentityAction(): Promise<
  { ok: true; created: number; updated: number; skipped: number } | { ok: false; error: string }
> {
  const a = await actor("AML_EDIT")
  if (!a.ok) return a
  const { created, updated, skipped } = await syncStripeIdentity()
  await audit("kyc_identity_sync", { actorId: a.me.id, target: `${created} new, ${updated} updated`, ip: await ip() })
  revalidatePath("/admin/kyc")
  return { ok: true, created, updated, skipped }
}
