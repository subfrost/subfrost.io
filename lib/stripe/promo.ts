/** Promo-code surface of the Stripe console. Reached through actions/cms/billing.ts
 *  (gated MANAGE_BILLING). Reads come from getStripeSource(); in seed mode the
 *  StripePromoCode overlays (admin-created) are appended. Create is low-risk:
 *  live → Stripe (stubbed today); seed → overlay row (unique code enforced). */
import prisma from "@/lib/prisma"
import { isLive, BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import { CreatePromoSchema, type PromoCode } from "@/lib/stripe/shapes"

type DbPromo = {
  id: string; code: string; type: "PERCENT" | "AMOUNT"; value: number
  maxRedemptions: number | null; expiresAt: Date | null; active: boolean; by: string; createdAt: Date
}
const mapOverlay = (r: DbPromo): PromoCode => ({
  code: r.code, type: r.type, value: r.value, redemptions: 0,
  maxRedemptions: r.maxRedemptions, expiresAt: r.expiresAt ? r.expiresAt.toISOString() : null, active: r.active,
})

export async function listPromoCodes(): Promise<{ codes: PromoCode[]; live: boolean }> {
  const live = isLive()
  const codes = await getStripeSource().promoCodes()
  if (live) return { codes, live }
  const overlays = (await prisma.stripePromoCode.findMany({ orderBy: { createdAt: "desc" } })) as DbPromo[]
  return { codes: [...overlays.map(mapOverlay), ...codes], live }
}

export async function createPromoCode(input: unknown, by: string): Promise<PromoCode> {
  const res = CreatePromoSchema.safeParse(input)
  if (!res.success) throw new BillingError("Validation failed: " + JSON.stringify(res.error.issues))
  const { code, type, value, maxRedemptions, expiresAt } = res.data
  const existing = await prisma.stripePromoCode.findUnique({ where: { code } })
  if (existing) throw new BillingError(`Promo code already exists: ${code}`)
  if (isLive()) throw new StripeNotWiredError("createPromoCode")
  const saved = (await prisma.stripePromoCode.create({
    data: { code, type, value, maxRedemptions: maxRedemptions ?? null, expiresAt: expiresAt ? new Date(expiresAt) : null, by },
  })) as DbPromo
  return mapOverlay(saved)
}
