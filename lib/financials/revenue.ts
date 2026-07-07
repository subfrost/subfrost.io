// Pure shapes + aggregation for the Financials → Revenue tab. DB-free and
// serializable (all dates are ISO strings), so every function here is
// unit-testable without Prisma. SUBFROST earns protocol revenue two ways:
//
//   1. BTC wrap/unwrap fees — a 0.3% fee applied to every BTC↔frBTC wrap and
//      unwrap. The fee accrues in BTC. This is the AUTHORITATIVE per-event fee:
//      fee = 0.3% × volume, derived from the confirmed WrapTransaction /
//      UnwrapTransaction events (not the withdrawable reserve−supply proxy,
//      which can go negative when the treasury withdraws fees).
//   2. Stripe charges — succeeded charges synced into StripeWebhookEvent, in USD.
//
// The action layer (actions/cms/revenue.ts) maps DB rows into RevenueEvent[]
// and calls the aggregators below; the client only ever sees these plain shapes.

/** The frBTC protocol fee: **0.1%** (1 per-1000) on each of wrap and unwrap.
 *  On wrap it is the on-chain `premium` (fr-btc `premium()` default 100_000/1e8
 *  = 0.1% — frBTC minted is 0.999× the BTC deposited). On unwrap the same 0.1%
 *  is withheld from the BTC paid out at signer-fulfillment time (the fr-btc
 *  contract records the Payment 1:1; the 0.1% + Bitcoin miner fee are applied by
 *  the signer daemon, off-chain). The 546-sat anchor and miner fees are NOT
 *  protocol revenue and are excluded here. */
export const WRAP_UNWRAP_FEE_RATE = 0.001
export const SATS_PER_BTC = 100_000_000

const DAY_MS = 86_400_000

export type RevenueSource = "btc_fee" | "stripe"
export type RevenueUnit = "BTC" | "USD"

/** A dated revenue event, already normalized to the source's native unit
 *  (BTC for fees, USD for Stripe). `at` is a UTC ISO timestamp. */
export interface RevenueEvent {
  at: string // ISO (UTC)
  amount: number
}

/** One UTC day's revenue for charting. `date` is a YYYY-MM-DD key. */
export interface DailyPoint {
  date: string
  amount: number
}

/** Rollups over the standard trailing windows + an all-time total. Windows are
 *  measured from `now`: dN = amount whose event time ≥ now − N days; ytd = since
 *  Jan 1 (UTC) of the current year. */
export interface PeriodRollups {
  d1: number
  d7: number
  d30: number
  ytd: number
  all: number
}

export const EMPTY_ROLLUPS: PeriodRollups = { d1: 0, d7: 0, d30: 0, ytd: 0, all: 0 }

export interface DateRange {
  from: string | null // YYYY-MM-DD
  to: string | null
}

/** A full per-source revenue series: the daily points for charting + the period
 *  rollups + the observed date range. */
export interface RevenueSeries {
  source: RevenueSource
  unit: RevenueUnit
  daily: DailyPoint[]
  rollups: PeriodRollups
  range: DateRange
}

/** Active-subscription rollup for the Stripe MRR card. `activeCount` counts
 *  currently-billing subscriptions (active + trialing + past_due); `mrr` is their
 *  combined monthly recurring revenue in USD (yearly/weekly plans normalized to a
 *  month). Null when the live Stripe API could not be reached. */
export interface StripeSubscriptionSummary {
  activeCount: number
  mrr: number // USD per month
}

/** Where the BTC fee series came from: the on-chain frBTC volume indexer, or the
 *  local WrapTransaction/UnwrapTransaction ledger tables (fallback). */
export type BtcSource = "indexer" | "tables"

/** Everything the Revenue page renders. Serializable end-to-end. */
export interface RevenueOverview {
  btcFee: RevenueSeries
  stripe: RevenueSeries
  generatedAt: string // ISO
  /** Source + caveat blurb for the BTC fee series (shown under its chart). */
  btcFeeNote: string
  /** Where the BTC fee series came from — "indexer" (on-chain) or "tables" (ledger fallback). */
  btcSource: BtcSource
  /** Last height the frBTC indexer processed, when btcSource === "indexer"; else null. */
  indexerTip: number | null
  /** Short freshness blurb for the BTC card badge (indexer block / fallback). */
  btcNote: string
  /** Active-subscription MRR summary, or null if the live API was unreachable. */
  stripeSubs: StripeSubscriptionSummary | null
  /** True when the Stripe series came from the live API; false = webhook-log fallback. */
  stripeLive: boolean
  /** Source + caveat blurb for the Stripe series (shown under its chart). */
  stripeNote: string
}

/** BTC fee earned on wrapping/unwrapping `sats` satoshis of volume (0.3%). */
export function feeBtcFromSats(sats: number): number {
  return (sats * WRAP_UNWRAP_FEE_RATE) / SATS_PER_BTC
}

/** UTC day key of a UTC ISO string. Upstream always passes Date#toISOString(),
 *  which is UTC-normalized, so the first 10 chars are the UTC calendar day. */
const dayKey = (iso: string): string => iso.slice(0, 10)

function roundTo(n: number, dp: number): number {
  const f = 10 ** dp
  return Math.round(n * f) / f
}

/** Sum events into per-UTC-day points, oldest→newest. Days with no events are
 *  omitted (see denseDailySeries to fill the gaps for a continuous line).
 *  `dp` rounds each day's total: 8 for BTC, 2 for USD. */
export function dailySeries(events: RevenueEvent[], dp: number): DailyPoint[] {
  const acc = new Map<string, number>()
  for (const e of events) {
    const k = dayKey(e.at)
    acc.set(k, (acc.get(k) ?? 0) + e.amount)
  }
  return [...acc.entries()]
    .map(([date, amount]) => ({ date, amount: roundTo(amount, dp) }))
    .sort((a, b) => (a.date < b.date ? -1 : 1))
}

/** Fill every calendar day between the first and last point (inclusive) with 0
 *  where there was no revenue, so a line/area chart reads continuously. Returns
 *  the input untouched when it has fewer than 2 points. */
export function denseDailySeries(points: DailyPoint[], dp: number): DailyPoint[] {
  if (points.length < 2) return points
  const byDate = new Map(points.map((p) => [p.date, p.amount]))
  const out: DailyPoint[] = []
  const start = Date.parse(`${points[0].date}T00:00:00Z`)
  const end = Date.parse(`${points[points.length - 1].date}T00:00:00Z`)
  for (let t = start; t <= end; t += DAY_MS) {
    const date = new Date(t).toISOString().slice(0, 10)
    out.push({ date, amount: roundTo(byDate.get(date) ?? 0, dp) })
  }
  return out
}

/** Trailing-window + all-time rollups measured from `now`. Window edges match
 *  the SQL `now() − interval 'N day'` / `date_trunc('year', now())` semantics. */
export function rollups(events: RevenueEvent[], now: Date, dp: number): PeriodRollups {
  const t = now.getTime()
  const e1 = t - 1 * DAY_MS
  const e7 = t - 7 * DAY_MS
  const e30 = t - 30 * DAY_MS
  const eYtd = Date.UTC(now.getUTCFullYear(), 0, 1)
  let d1 = 0, d7 = 0, d30 = 0, ytd = 0, all = 0
  for (const e of events) {
    const et = Date.parse(e.at)
    all += e.amount
    if (et >= e1) d1 += e.amount
    if (et >= e7) d7 += e.amount
    if (et >= e30) d30 += e.amount
    if (et >= eYtd) ytd += e.amount
  }
  return {
    d1: roundTo(d1, dp), d7: roundTo(d7, dp), d30: roundTo(d30, dp),
    ytd: roundTo(ytd, dp), all: roundTo(all, dp),
  }
}

/** Observed [from, to] UTC-day range of a daily series (nulls when empty). */
export function seriesRange(daily: DailyPoint[]): DateRange {
  if (daily.length === 0) return { from: null, to: null }
  return { from: daily[0].date, to: daily[daily.length - 1].date }
}

/** Assemble one source's full series from its events. Rounds to `dp` places. */
export function buildSeries(
  source: RevenueSource,
  unit: RevenueUnit,
  events: RevenueEvent[],
  now: Date,
  dp: number,
): RevenueSeries {
  const daily = dailySeries(events, dp)
  return { source, unit, daily, rollups: rollups(events, now, dp), range: seriesRange(daily) }
}
