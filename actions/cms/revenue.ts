"use server"

import { currentUser, type CmsUser } from "@/lib/cms/authz"
import prisma from "@/lib/prisma"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import {
  buildSeries, feeBtcFromSats, SATS_PER_BTC,
  type BtcSource, type RevenueEvent, type RevenueOverview, type RevenueUnit,
  type StripeSubscriptionSummary,
} from "@/lib/financials/revenue"
import { getLiveStripeRevenue } from "@/lib/financials/stripeRevenue"
import {
  getFrbtcVolumeRange,
  getFrbtcVolumeTip,
  getFrbtcTotalSupplySats,
} from "@/lib/financials/frbtc-indexer"

// (getFrbtcVolumeRange/Tip take a venue arg: "alkanes" default, "brc20" for the
// BRC20-Prog frBTC indexer.)

async function gate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(FINANCIALS_PRIVILEGE)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

export type RevenueOverviewResult =
  | { ok: true; overview: RevenueOverview }
  | { ok: false; error: "unauthorized" }

const BTC_FEE_NOTE =
  "BTC fee revenue = 0.1% of every confirmed wrap + unwrap (the frBTC 0.1% wrap " +
  "premium + the symmetric 0.1% unwrap fee), aggregated per UTC day from the " +
  "WrapTransaction / UnwrapTransaction event cache. This is gross fee earned at " +
  "wrap/unwrap time — the authoritative revenue definition, independent of any " +
  "later treasury withdrawals (unlike the reserve−supply proxy, which nets out " +
  "withdrawals and can go negative). Freshness depends on the wrap/unwrap sync."

// Widest plausible query window for the on-chain indexer — comfortably before
// frBTC genesis, so the rollups (1d/7d/30d/YTD/all) see the full history.
const INDEXER_RANGE_FROM = "2020-01-01"

const BTC_INDEXER_NOTE =
  "BTC fee revenue = 0.1% of every confirmed on-chain frBTC wrap + unwrap, read " +
  "directly from the dedicated frBTC volume metashrew indexer — wrap volume is the " +
  "gross BTC deposited to the signer; unwrap volume is payout-matched (the BTC the " +
  "signer settles to redeemers), so reserve/fee sweeps are excluded. Authoritative " +
  "and independent of the app's own wrap/unwrap sync. Aggregated per UTC day."

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
    // One BTC fee event per non-empty UTC day (dated at day start). Per-day fee
    // = 0.1% of that day's wrap+unwrap volume + the 546-sat anchor retained on
    // each unwrap (also subfrost revenue). Lifetime ≈ 0.37 BTC.
    btcEvents = range.daily
      .filter((d) => d.wrapped_sats + d.unwrapped_sats > 0)
      .map((d) => ({
        at: `${d.date}T00:00:00.000Z`,
        amount:
          feeBtcFromSats(d.wrapped_sats + d.unwrapped_sats) +
          (546 * d.unwrap_count) / SATS_PER_BTC,
      }))
    const tip = await getFrbtcVolumeTip().catch(() => null)
    indexerTip = tip?.tip ?? null
    btcSource = "indexer"
    btcFeeNote = BTC_INDEXER_NOTE
    btcNote =
      indexerTip != null ? `on-chain indexer · synced to block ${indexerTip}` : "on-chain indexer"

    // Reconcile the signer reserve (net wrap−unwrap) against frBTC /totalsupply.
    // The ~20 BTC "gap" seen with a stale supply read was spurious — the correct
    // supply matches the reserve (~100% collateralized).
    const supplySats = await getFrbtcTotalSupplySats().catch(() => null)
    if (supplySats) {
      const reserveBtc = (range.totals.wrapped_sats - range.totals.unwrapped_sats) / SATS_PER_BTC
      const supplyBtc = supplySats / SATS_PER_BTC
      if (supplyBtc > 0) {
        btcNote += ` · frBTC ${Math.round((reserveBtc / supplyBtc) * 100)}% collateralized (${reserveBtc.toFixed(1)} BTC reserve vs ${supplyBtc.toFixed(1)} supply)`
      }
    }
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

  // BRC20-Prog frBTC fee revenue — the SECOND frBTC venue, from its own
  // dedicated rockshrew-mono metashrew indexer (crates/frbtc-brc20-volume-
  // indexer) via FRBTC_BRC20_INDEXER_RPC_URL. Same 0.1% wrap-premium fee model.
  // When the env is unset / unreachable, brc20Events stays empty (there is no
  // ledger-table fallback for BRC20-Prog) and the venue simply reads as 0.
  let brc20Events: RevenueEvent[] = []
  let brc20Source: BtcSource | null = null
  let brc20IndexerTip: number | null = null
  try {
    const to = now.toISOString().slice(0, 10)
    const range = await getFrbtcVolumeRange(INDEXER_RANGE_FROM, to, "brc20")
    if (range) {
      brc20Events = range.daily
        .filter((d) => d.wrapped_sats + d.unwrapped_sats > 0)
        .map((d) => ({
          at: `${d.date}T00:00:00.000Z`,
          amount: feeBtcFromSats(d.wrapped_sats + d.unwrapped_sats),
        }))
      brc20Source = "indexer"
      brc20IndexerTip = (await getFrbtcVolumeTip("brc20").catch(() => null))?.tip ?? null
    }
  } catch {
    // BRC20-Prog indexer unreachable — leave the venue at 0, alkanes still shows.
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

  // Value the frBTC fee series in USD at the CURRENT BTC rate (not per-day
  // historical) — the wrap/unwrap stats are shown in USD. Null price ⇒ keep BTC.
  const btcUsd = await currentBtcUsd()
  const btcUnit: RevenueUnit = btcUsd != null ? "USD" : "BTC"
  const valued = (evts: RevenueEvent[]) =>
    btcUsd != null ? evts.map((e) => ({ at: e.at, amount: e.amount * btcUsd })) : evts
  // Cumulative = both venues; the headline BTC-fee number is total protocol
  // revenue across alkanes + BRC20-Prog. Per-venue series shown alongside.
  const combinedEvents = [...btcEvents, ...brc20Events]
  const btcDp = btcUnit === "USD" ? 2 : 8
  if (btcUsd != null) {
    btcNote += ` · valued at $${Math.round(btcUsd).toLocaleString("en-US")}/BTC (current spot)`
  }
  if (brc20Source === "indexer") {
    btcNote += ` · incl. BRC20-Prog${brc20IndexerTip != null ? ` (synced to block ${brc20IndexerTip})` : ""}`
  }

  const overview: RevenueOverview = {
    btcFee: buildSeries("btc_fee", btcUnit, valued(combinedEvents), now, btcDp),
    btcFeeAlkanes: buildSeries("btc_fee", btcUnit, valued(btcEvents), now, btcDp),
    btcFeeBrc20: buildSeries("btc_fee", btcUnit, valued(brc20Events), now, btcDp),
    stripe: buildSeries("stripe", "USD", stripeEvents, now, 2),
    generatedAt: now.toISOString(),
    btcFeeNote,
    btcSource,
    indexerTip,
    brc20Source,
    brc20IndexerTip,
    btcNote,
    stripeSubs,
    stripeLive,
    stripeNote,
    btcUsd,
  }
  return { ok: true, overview }
}

/** Current BTC/USD spot from the subfrost subpricer (same source as the treasury).
 *  Null on any failure so the fee series falls back to BTC-denominated display. */
async function currentBtcUsd(): Promise<number | null> {
  try {
    const res = await fetch("https://mainnet.subfrost.io/v4/subfrost/get-bitcoin-price", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: "{}",
      signal: AbortSignal.timeout(12_000),
      cache: "no-store",
    })
    if (!res.ok) return null
    const json = (await res.json()) as { data?: { bitcoin?: { usd?: number } } }
    const usd = json?.data?.bitcoin?.usd
    return typeof usd === "number" && usd > 0 ? usd : null
  } catch {
    return null
  }
}
