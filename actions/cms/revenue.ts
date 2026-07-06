"use server"

import { currentUser, type CmsUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import {
  buildSeries, feeBtcFromSats,
  type BtcSource, type RevenueEvent, type RevenueOverview, type StripeSubscriptionSummary,
} from "@/lib/financials/revenue"
import { getLiveStripeRevenue } from "@/lib/financials/stripeRevenue"
import { getFrbtcVolumeRange, getFrbtcVolumeTip } from "@/lib/financials/frbtc-indexer"

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

// Widest plausible query window for the on-chain indexer — comfortably before
// frBTC genesis, so the rollups (1d/7d/30d/YTD/all) see the full history.
const INDEXER_RANGE_FROM = "2020-01-01"

const BTC_INDEXER_NOTE =
  "BTC fee revenue = 0.3% of every confirmed on-chain frBTC wrap + unwrap, read " +
  "directly from the dedicated frBTC volume metashrew indexer (authoritative, " +
  "independent of the app's own wrap/unwrap sync). Aggregated per UTC day."

const STRIPE_LIVE_NOTE =
  "Stripe revenue = succeeded USD charges pulled LIVE from the Stripe API, net of " +
  "refunds, aggregated per UTC day. The MRR card sums the recurring lines of every " +
  "currently-billing subscription (active + trialing + past_due), normalizing " +
  "yearly/weekly plans to a month. Cached ~1 min."

const STRIPE_FALLBACK_NOTE =
  "Live Stripe API was unreachable — showing the local StripeWebhookEvent log " +
  "instead (succeeded charges only). This log can lag reality by days and omits " +
  "MRR; reconnect STRIPE_SECRET_KEY for authoritative figures."

/** Protocol revenue overview for the Financials → Revenue tab. Reads the two
 *  ways SUBFROST makes money — BTC wrap/unwrap fees and Stripe charges — and
 *  returns per-day series + 1d/7d/30d/YTD rollups for each. Gated on
 *  FINANCIALS_PRIVILEGE (mirrors actions/cms/equity.ts). */
export async function revenueOverviewAction(): Promise<RevenueOverviewResult> {
  const g = await gate()
  if (!g.ok) return g

  const now = new Date()

  // BTC fee revenue: prefer the on-chain frBTC volume indexer when it's wired up
  // (FRBTC_INDEXER_RPC_URL) AND reachable; otherwise fall back to the local
  // WrapTransaction/UnwrapTransaction ledger tables — the original, unchanged path.
  let btcEvents: RevenueEvent[]
  let btcSource: BtcSource = "tables"
  let indexerTip: number | null = null
  let btcFeeNote = BTC_FEE_NOTE
  let btcNote = "from ledger tables"
  try {
    const to = now.toISOString().slice(0, 10)
    const range = await getFrbtcVolumeRange(INDEXER_RANGE_FROM, to)
    if (!range) throw new Error("indexer not configured") // env unset → fall back
    // One BTC fee event per non-empty UTC day (dated at day start). The per-day
    // fee is 0.3% of that day's wrap+unwrap volume — same feeBtcFromSats rule as
    // the tables path, so buildSeries's rollups line up either way.
    btcEvents = range.daily
      .filter((d) => d.wrapped_sats + d.unwrapped_sats > 0)
      .map((d) => ({
        at: `${d.date}T00:00:00.000Z`,
        amount: feeBtcFromSats(d.wrapped_sats + d.unwrapped_sats),
      }))
    const tip = await getFrbtcVolumeTip().catch(() => null)
    indexerTip = tip?.tip ?? null
    btcSource = "indexer"
    btcFeeNote = BTC_INDEXER_NOTE
    btcNote =
      indexerTip != null ? `on-chain indexer · synced to block ${indexerTip}` : "on-chain indexer"
  } catch {
    // Fallback: 0.3% of each confirmed wrap/unwrap satoshi volume, in BTC. amount
    // is a satoshi string; Number is safe (< 2^53 for realistic volumes).
    const [wraps, unwraps] = await Promise.all([
      prisma.wrapTransaction.findMany({
        where: { confirmed: true },
        select: { amount: true, timestamp: true },
      }),
      prisma.unwrapTransaction.findMany({
        where: { confirmed: true },
        select: { amount: true, timestamp: true },
      }),
    ])
    btcEvents = [...wraps, ...unwraps].map((r) => ({
      at: r.timestamp.toISOString(),
      amount: feeBtcFromSats(Number(r.amount)),
    }))
  }

  // Stripe: pull the authoritative picture LIVE from the Stripe API — succeeded
  // charges (historical series) + active-subscription MRR. If the API is
  // unreachable (no key / network / API error), fall back to the incomplete
  // StripeWebhookEvent log so the tab still renders, with a note.
  let stripeEvents: RevenueEvent[]
  let stripeSubs: StripeSubscriptionSummary | null = null
  let stripeLive = false
  let stripeNote = STRIPE_LIVE_NOTE
  try {
    const live = await getLiveStripeRevenue()
    stripeEvents = live.events
    stripeSubs = live.subs
    stripeLive = true
  } catch {
    const charges = await prisma.stripeWebhookEvent.findMany({
      where: { objectType: "charge", objectStatus: "succeeded", currency: "usd" },
      select: { amount: true, stripeCreated: true },
    })
    // Stripe USD events: cents → dollars. amount is nullable in the schema.
    stripeEvents = charges
      .filter((c): c is { amount: number; stripeCreated: Date } => c.amount != null)
      .map((c) => ({ at: c.stripeCreated.toISOString(), amount: c.amount / 100 }))
    stripeNote = STRIPE_FALLBACK_NOTE
  }

  const overview: RevenueOverview = {
    btcFee: buildSeries("btc_fee", "BTC", btcEvents, now, 8),
    stripe: buildSeries("stripe", "USD", stripeEvents, now, 2),
    generatedAt: now.toISOString(),
    btcFeeNote,
    btcSource,
    indexerTip,
    btcNote,
    stripeSubs,
    stripeLive,
    stripeNote,
  }
  return { ok: true, overview }
}
