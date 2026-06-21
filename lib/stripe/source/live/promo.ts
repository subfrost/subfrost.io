import { getStripeClient } from "@/lib/stripe/client"
import type { PromoCode } from "@/lib/stripe/shapes"

export async function livePromoCodes(): Promise<PromoCode[]> {
  const stripe = getStripeClient()
  const res = await stripe.promotionCodes.list({ limit: 100, expand: ["data.coupon"] })
  return res.data.map((p: any) => ({
    code: p.code,
    type: p.coupon?.percent_off != null ? "PERCENT" : "AMOUNT",
    value: p.coupon?.percent_off != null ? p.coupon.percent_off : (p.coupon?.amount_off ?? 0),
    redemptions: p.times_redeemed ?? 0,
    maxRedemptions: p.max_redemptions ?? null,
    expiresAt: p.expires_at ? new Date(p.expires_at * 1000).toISOString() : null,
    active: Boolean(p.active),
  }))
}
