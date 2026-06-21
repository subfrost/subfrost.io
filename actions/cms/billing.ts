"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import { BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { listApplications, upsertApplication, type ApplicationRow } from "@/lib/stripe/applications"
import { changeSubscription, listSubscribers, listTiers } from "@/lib/stripe/subscriptions"
import { createPromoCode, listPromoCodes } from "@/lib/stripe/promo"
import type { SubscriptionTier, Subscriber, PromoCode } from "@/lib/stripe/shapes"

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

export async function listTiersAction(): Promise<
  { ok: true; tiers: SubscriptionTier[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { tiers, live } = await listTiers()
  return { ok: true, tiers, live }
}

export async function listSubscribersAction(): Promise<
  { ok: true; subscribers: Subscriber[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { subscribers, live } = await listSubscribers()
  return { ok: true, subscribers, live }
}

export async function changeSubscriptionAction(
  subscriptionId: string,
  input: { action: string; note?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    await changeSubscription(subscriptionId, input, a.me.email)
    await audit("stripe_subscription_action", { actorId: a.me.id, target: subscriptionId, ip: await ip() })
    revalidatePath("/admin/billing/subscriptions")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}

export async function listPromoCodesAction(): Promise<
  { ok: true; codes: PromoCode[]; live: boolean } | { ok: false; error: string }
> {
  const a = await actor()
  if (!a.ok) return a
  const { codes, live } = await listPromoCodes()
  return { ok: true, codes, live }
}

export async function createPromoCodeAction(
  input: { code: string; type: string; value: number; maxRedemptions?: number; expiresAt?: string },
): Promise<{ ok: true } | { ok: false; error: string }> {
  const a = await actor()
  if (!a.ok) return a
  try {
    const created = await createPromoCode(input, a.me.email)
    await audit("stripe_promo_create", { actorId: a.me.id, target: created.code, ip: await ip() })
    revalidatePath("/admin/billing/promo")
    return { ok: true }
  } catch (e) {
    if (e instanceof BillingError || e instanceof StripeNotWiredError) return { ok: false, error: e.message }
    throw e
  }
}
