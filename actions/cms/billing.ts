"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import { BillingError } from "@/lib/stripe/config"
import { listApplications, upsertApplication, type ApplicationRow } from "@/lib/stripe/applications"

const REQUIRED: Privilege = "MANAGE_BILLING"

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

export async function listApplicationsAction(): Promise<
  { ok: true; applications: ApplicationRow[] } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  return { ok: true, applications: await listApplications() }
}

export async function upsertApplicationAction(
  product: string,
  input: { status: string; notes?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await upsertApplication(product, input, a.me.email)
    await audit("stripe_application_update", { actorId: a.me.id, target: product, ip: await ip() })
    revalidatePath("/admin/billing/applications")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError) return { ok: false, error: e.message }
    throw e
  }
}
