"use server"

import { currentUser, type CmsUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import {
  buildSeries, feeBtcFromSats,
  type RevenueEvent, type RevenueOverview,
} from "@/lib/financials/revenue"

async function gate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(FINANCIALS_PRIVILEGE)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

export type RevenueOverviewResult =
  | { ok: true; overview: RevenueOverview }
  | { ok: false; error: "unauthorized" }

const BTC_FEE_NOTE =
  "BTC fee revenue = 0.3% of every confirmed wrap + unwrap (the protocol's " +
  "3-per-1000 frBTC wrap/unwrap fee), aggregated per UTC day from the " +
  "WrapTransaction / UnwrapTransaction event cache. This is gross fee earned at " +
  "wrap/unwrap time — the authoritative revenue definition, independent of any " +
  "later treasury withdrawals (unlike the reserve−supply proxy, which nets out " +
  "withdrawals and can go negative). Freshness depends on the wrap/unwrap sync."

/** Protocol revenue overview for the Financials → Revenue tab. Reads the two
 *  ways SUBFROST makes money — BTC wrap/unwrap fees and Stripe charges — and
 *  returns per-day series + 1d/7d/30d/YTD rollups for each. Gated on
 *  FINANCIALS_PRIVILEGE (mirrors actions/cms/equity.ts). */
export async function revenueOverviewAction(): Promise<RevenueOverviewResult> {
  const g = await gate()
  if (!g.ok) return g

  const now = new Date()
  const [wraps, unwraps, charges] = await Promise.all([
    prisma.wrapTransaction.findMany({
      where: { confirmed: true },
      select: { amount: true, timestamp: true },
    }),
    prisma.unwrapTransaction.findMany({
      where: { confirmed: true },
      select: { amount: true, timestamp: true },
    }),
    prisma.stripeWebhookEvent.findMany({
      where: { objectType: "charge", objectStatus: "succeeded", currency: "usd" },
      select: { amount: true, stripeCreated: true },
    }),
  ])

  // BTC fee events: 0.3% of each wrap/unwrap satoshi volume, expressed in BTC.
  // amount is a satoshi string; Number is safe (< 2^53 for realistic volumes).
  const btcEvents: RevenueEvent[] = [...wraps, ...unwraps].map((r) => ({
    at: r.timestamp.toISOString(),
    amount: feeBtcFromSats(Number(r.amount)),
  }))

  // Stripe USD events: cents → dollars. amount is nullable in the schema.
  const stripeEvents: RevenueEvent[] = charges
    .filter((c): c is { amount: number; stripeCreated: Date } => c.amount != null)
    .map((c) => ({ at: c.stripeCreated.toISOString(), amount: c.amount / 100 }))

  const overview: RevenueOverview = {
    btcFee: buildSeries("btc_fee", "BTC", btcEvents, now, 8),
    stripe: buildSeries("stripe", "USD", stripeEvents, now, 2),
    generatedAt: now.toISOString(),
    btcFeeNote: BTC_FEE_NOTE,
  }
  return { ok: true, overview }
}
