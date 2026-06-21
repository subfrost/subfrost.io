import { getStripeClient } from "@/lib/stripe/client"
import type { SubscriptionTier, Subscriber, SubscriberStatus } from "@/lib/stripe/shapes"

const SUB_STATUS: Record<string, SubscriberStatus> = {
  active: "active", trialing: "trialing", past_due: "past_due",
  canceled: "canceled", unpaid: "past_due", incomplete: "past_due",
  incomplete_expired: "canceled", paused: "canceled",
}
const iso = (sec: number | null | undefined) => (sec != null ? new Date(sec * 1000).toISOString() : null)

export async function liveSubscribers(): Promise<Subscriber[]> {
  const stripe = getStripeClient()
  // Stripe caps `expand` at 4 levels, so `data.items.data.price.product` (5 levels) is rejected.
  // Resolve product names via a separate products lookup keyed by id instead.
  const products = await stripe.products.list({ limit: 100 })
  const nameById = new Map<string, string>((products.data as any[]).map((p) => [p.id, p.name as string]))
  const res = await stripe.subscriptions.list({
    status: "all", limit: 100, expand: ["data.customer"],
  })
  return res.data.map((s: any) => {
    const product = s.items?.data?.[0]?.price?.product
    const tier = typeof product === "string" ? (nameById.get(product) ?? "") : (product?.name ?? "")
    return {
      id: s.id,
      customerEmail: s.customer?.email ?? "",
      tier,
      status: SUB_STATUS[s.status] ?? "canceled",
      startedAt: iso(s.start_date) ?? "",
      renewsAt: s.status === "canceled" ? null : iso(s.current_period_end),
    }
  })
}

export async function liveSubscriptionTiers(): Promise<SubscriptionTier[]> {
  const stripe = getStripeClient()
  const products = await stripe.products.list({ active: true, limit: 100 })
  const tiers: SubscriptionTier[] = []
  for (const p of products.data as any[]) {
    const prices = await stripe.prices.list({ product: p.id, active: true, limit: 100 })
    const monthly = prices.data.find((x: any) => x.recurring?.interval === "month")
    const yearly = prices.data.find((x: any) => x.recurring?.interval === "year")
    const subs = await stripe.subscriptions.list({ price: monthly?.id ?? yearly?.id, status: "active", limit: 100 })
    tiers.push({
      id: p.id,
      name: p.name,
      priceMonthly: monthly?.unit_amount ?? 0,
      priceYearly: yearly?.unit_amount ?? 0,
      features: (p.marketing_features ?? []).map((f: any) => f.name).filter(Boolean),
      activeSubs: subs.data.length,
    })
  }
  return tiers
}
