// Live Stripe revenue source for the Financials → Revenue tab. Server-only: it
// pulls the AUTHORITATIVE revenue picture straight from the Stripe API (succeeded
// charges for the historical series + active subscriptions for MRR), rather than
// the incomplete StripeWebhookEvent log the tab originally read. Reuses the same
// lazy singleton client as the billing console (lib/stripe/client.ts).
//
// Result is memoized in-process for a short TTL so the page stays fast and we
// don't re-hit Stripe on every render / refresh.
import { getStripeClient } from "@/lib/stripe/client"
import type { RevenueEvent, StripeSubscriptionSummary } from "@/lib/financials/revenue"

export interface LiveStripeRevenue {
  /** One USD event per succeeded charge, net of refunds (feeds the daily series). */
  events: RevenueEvent[]
  /** Active-subscription count + combined MRR (USD/month). */
  subs: StripeSubscriptionSummary
}

const TTL_MS = 60_000 // memoize the Stripe pull for a minute
// Hard ceilings so a runaway account can never make this unbounded. Comfortably
// above today's volume (149 charges / 32 subs) with lots of headroom.
const MAX_CHARGES = 5_000
const MAX_SUBS = 2_000

// Subscription statuses that are currently billing (and therefore count toward MRR).
const BILLING_STATUSES = new Set(["active", "trialing", "past_due"])

let cache: { at: number; data: LiveStripeRevenue } | null = null

/** Normalize one recurring price line to monthly cents. */
function monthlyCents(unitAmount: number, quantity: number, recurring: { interval: string; interval_count?: number | null }): number {
  const amt = unitAmount * quantity
  const n = recurring.interval_count && recurring.interval_count > 0 ? recurring.interval_count : 1
  switch (recurring.interval) {
    case "year": return amt / (12 * n)
    case "week": return (amt * 52) / (12 * n)
    case "day": return (amt * 365) / (12 * n)
    case "month":
    default: return amt / n
  }
}

/** Pull live Stripe revenue (charges → events, subscriptions → MRR). Memoized for
 *  TTL_MS. Throws (via getStripeClient) when STRIPE_SECRET_KEY is unset, or on any
 *  API/network failure — callers fall back to the webhook-log estimate. */
export async function getLiveStripeRevenue(force = false): Promise<LiveStripeRevenue> {
  if (!force && cache && Date.now() - cache.at < TTL_MS) return cache.data
  const stripe = getStripeClient()

  // Historical series: every succeeded USD charge, net of refunds.
  const events: RevenueEvent[] = []
  let seen = 0
  for await (const c of stripe.charges.list({ limit: 100 })) {
    if (++seen > MAX_CHARGES) break
    if (c.status !== "succeeded" || !c.paid || c.currency !== "usd") continue
    const net = (c.amount_captured ?? c.amount ?? 0) - (c.amount_refunded ?? 0)
    if (net <= 0) continue
    events.push({ at: new Date(c.created * 1000).toISOString(), amount: net / 100 })
  }

  // MRR: sum the recurring lines of every currently-billing subscription.
  let activeCount = 0
  let mrr = 0 // cents
  let sSeen = 0
  for await (const sub of stripe.subscriptions.list({ status: "all", limit: 100 })) {
    if (++sSeen > MAX_SUBS) break
    if (!BILLING_STATUSES.has(sub.status)) continue
    activeCount++
    for (const it of sub.items.data as any[]) {
      const price = it.price
      if (!price?.recurring) continue
      mrr += monthlyCents(price.unit_amount ?? 0, it.quantity ?? 1, price.recurring)
    }
  }

  const data: LiveStripeRevenue = {
    events,
    subs: { activeCount, mrr: Math.round(mrr) / 100 },
  }
  cache = { at: Date.now(), data }
  return data
}
