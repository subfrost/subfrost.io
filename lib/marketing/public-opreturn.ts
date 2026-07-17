import { computeBytesComposition } from "@/lib/marketing/opreturn-metrics"
import { listClosedOpReturnDays } from "@/lib/marketing/opreturn-store"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

// Public OP_RETURN chart series for /data. Chart-level aggregates only —
// source is the sampled scanner CSV ingested into OpReturnDaily (see the
// methodology note rendered next to these charts). Reads listClosedOpReturnDays
// (never listOpReturnDaily) so today's still-partial row never reaches a chart.
//
// Fee series are extrapolated to full days via dayFactor(r) = the day's real block
// span / r.blocksScanned (null when blocksScanned === 0) — see dayFactor's own
// comment for why this isn't a nominal 144. Miner revenue USD/day adds the
// 3.125 BTC/block subsidy over the day's REAL block count (the same span), so both
// halves of that sum describe the same day: 3.125 is the per-block constant, but the
// count it multiplies is a day-length claim and must not be hardcoded to 144.
// See plan Global Constraints.

export interface OpReturnPoint { date: string; value: number | null }

export interface PublicOpReturnPayload {
  updatedAt: string | null
  days: number
  header: { firstDate: string | null; lastDate: string | null; totalTxSampled: number }
  dailyShare: { date: string; txShare: number | null; opReturnPenetration: number | null }[]
  opReturnShare: { date: string; txPct: number | null; bytesPct: number | null }[]
  latestDonut: { date: string; diesel: number; alkanesOther: number; other: number } | null
  dieselTxShare: OpReturnPoint[]
  bytesComposition: { alkanes: number; runes: number; other: number } | null
  bytesPerTx: { date: string; alkanes: number | null; rest: number | null }[]
  minerRevenueUsd: OpReturnPoint[]
  feesSplitBtc: { date: string; alkanes: number | null; rest: number | null }[]
  alkanesFeeShare: OpReturnPoint[]
  weightShare: OpReturnPoint[]
  ugDieselShare: OpReturnPoint[]
  // "How much of Bitcoin is Alkanes?" — the four answers overlaid (each a share 0..1).
  fourAnswers: { date: string; byTx: number | null; byBytes: number | null; byWeight: number | null; byFee: number | null }[]
  // DIESEL mints extrapolated to a full 144-block day; cumulative is the running sum of that.
  dieselMintsPerDay: OpReturnPoint[]
  dieselCumulative: OpReturnPoint[]
  // Fee paid per transaction (sats), Alkanes tx vs everyone else.
  feePerTx: { date: string; alkanes: number | null; rest: number | null }[]
  // UNCOMMON•GOODS mints per day (raw sampled counts): DIESEL-driven vs independent Runes.
  ugMintsPerDay: { date: string; diesel: number | null; independent: number | null }[]
  // Pure Runes (runestone bytes minus alkanes) vs Alkanes — share of OP_RETURN bytes, and absolute bytes/day.
  runesVsAlkanesShare: { date: string; alkanes: number | null; pureRunes: number | null }[]
  runesVsAlkanesBytes: { date: string; alkanes: number | null; pureRunes: number | null }[]
  // OP_RETURN byte composition over time (shares 0..1): Alkanes / pure Runes / other.
  byteComposition: { date: string; alkanes: number | null; pureRunes: number | null; other: number | null }[]
  // Runestone transactions — Alkanes (protostone) vs pure Runes. Share (0..1) and absolute count/day
  // (the CSV columns are already extrapolated to a full 144-block day).
  runestoneTxShare: { date: string; alkanes: number | null; pureRunes: number | null }[]
  runestoneTxCount: { date: string; alkanes: number | null; pureRunes: number | null }[]
  stats: {
    last30: { alkanesOfOpReturnTx: number | null; alkanesOfOpReturnBytes: number | null; alkanesFeeShare: number | null; opReturnFeeShare: number | null }
    full: { alkanesFeeShare: number | null; opReturnFeeShare: number | null; alkanesBytesPerTx: number | null }
    latest: { date: string; fromHeight: number; toHeight: number; blocksScanned: number; txWithOpReturn: number; txAlkanes: number; alkanesOfOpReturnTx: number | null } | null
    weight: { full: number | null; latest: number | null }
    ug: { early30: number | null; last30: number | null; full: number | null }
  }
}

const EMPTY: PublicOpReturnPayload = {
  updatedAt: null,
  days: 0,
  header: { firstDate: null, lastDate: null, totalTxSampled: 0 },
  dailyShare: [],
  opReturnShare: [],
  latestDonut: null,
  dieselTxShare: [],
  bytesComposition: null,
  bytesPerTx: [],
  minerRevenueUsd: [],
  feesSplitBtc: [],
  alkanesFeeShare: [],
  weightShare: [],
  ugDieselShare: [],
  fourAnswers: [],
  dieselMintsPerDay: [],
  dieselCumulative: [],
  feePerTx: [],
  ugMintsPerDay: [],
  runesVsAlkanesShare: [],
  runesVsAlkanesBytes: [],
  byteComposition: [],
  runestoneTxShare: [],
  runestoneTxCount: [],
  stats: {
    last30: { alkanesOfOpReturnTx: null, alkanesOfOpReturnBytes: null, alkanesFeeShare: null, opReturnFeeShare: null },
    full: { alkanesFeeShare: null, opReturnFeeShare: null, alkanesBytesPerTx: null },
    latest: null,
    weight: { full: null, latest: null },
    ug: { early30: null, last30: null, full: null },
  },
}

const ratio = (num: number, den: number): number | null => (den === 0 ? null : num / den)

/** Ratio for optional (nullable) num/den values: null unless both are non-null and den !== 0. */
const ratioNullable = (num: number | null | undefined, den: number | null | undefined): number | null =>
  num == null || den == null ? null : ratio(num, den)

/**
 * Extrapolation factor to a full day, using the day's REAL block span (toHeight - fromHeight + 1)
 * over the number of blocks actually sampled — not a nominal 144. Every row synced since the
 * scanner moved to a dense census has span === blocksScanned (every block in the window was
 * scanned, none skipped), so the factor comes out to ~1 and the chart plots the day's true count.
 * The old constant-144 formula instead invented ~19% of activity on a short day (2026-07-16, 121
 * real blocks) and shrank a long one ~6% (2026-07-14, 154 blocks) — every recent day is dense-
 * censused, so real days are never exactly 144 blocks. Legacy rows (pre-dense-census, sampled
 * 1-in-6 over a real 144-block window: span 144, blocksScanned ~24) still come out to ~6 under this
 * formula, their real sampling rate — so this is a strict generalization, not a behavior change for
 * legacy data. Also fixes dieselCumulative, which compounds dayFactor errors across every day
 * summed into it. Null when the row scanned 0 blocks.
 */
const dayFactor = (r: OpReturnRow): number | null =>
  r.blocksScanned === 0 ? null : blockSpan(r) / r.blocksScanned

/** Blocks the row's window actually covers — the day's real length, which is never exactly 144. */
const blockSpan = (r: OpReturnRow): number => r.toHeight - r.fromHeight + 1

/**
 * Minimum Alkanes tx in a day for the per-tx fee average to be meaningful. The first days after
 * genesis had 1–30 Alkanes tx; a 7-tx day averaging 38,773 sats/tx dwarfed the whole "All time"
 * y-axis of the fee-per-tx chart — sampling noise, not market data.
 */
const FEE_PER_TX_MIN_SAMPLE = 50

/** Sum of f(r) across rows. */
const sumBy = (rows: OpReturnRow[], f: (r: OpReturnRow) => number): number => rows.reduce((s, r) => s + f(r), 0)

/** Ratio of sums over a window: sum(numFn)/sum(denFn), null when the summed denominator is 0. */
function ratioOfSums(rows: OpReturnRow[], numFn: (r: OpReturnRow) => number, denFn: (r: OpReturnRow) => number): number | null {
  return ratio(sumBy(rows, numFn), sumBy(rows, denFn))
}

/**
 * Ratio-of-sums over rows where BOTH the numerator and denominator fields are non-null
 * (ineligible rows are excluded from the window entirely, not treated as 0). Null when
 * there are no eligible rows or the summed denominator is 0.
 */
function ratioOfSumsNullable(
  rows: OpReturnRow[],
  numFn: (r: OpReturnRow) => number | null | undefined,
  denFn: (r: OpReturnRow) => number | null | undefined,
): number | null {
  const eligible = rows.filter((r) => numFn(r) != null && denFn(r) != null)
  if (eligible.length === 0) return null
  return ratioOfSums(
    eligible,
    (r) => numFn(r) as number,
    (r) => denFn(r) as number,
  )
}

export async function getPublicOpReturnData(): Promise<PublicOpReturnPayload> {
  let rows: OpReturnRow[] = []
  try {
    rows = await listClosedOpReturnDays()
  } catch (e) {
    console.error("[public-opreturn] series unavailable", e)
    return EMPTY
  }
  if (rows.length === 0) return EMPTY

  const first = rows[0]
  const last = rows[rows.length - 1]

  const dailyShare = rows.map((r) => ({
    date: r.date,
    txShare: ratio(r.txAlkanes, r.totalTx),
    opReturnPenetration: ratio(r.txWithOpReturn, r.totalTx),
  }))

  const opReturnShare = rows.map((r) => ({
    date: r.date,
    txPct: ratio(r.txAlkanes, r.txWithOpReturn),
    bytesPct: ratio(r.alkanesBytes, r.opReturnBytes),
  }))

  const latestDonut =
    last.txWithOpReturn === 0
      ? null
      : {
          date: last.date,
          diesel: last.dieselMints,
          alkanesOther: Math.max(0, last.txAlkanes - last.dieselMints),
          other: Math.max(0, last.txWithOpReturn - last.txAlkanes),
        }

  const dieselTxShare: OpReturnPoint[] = rows.map((r) => ({ date: r.date, value: ratio(r.dieselMints, r.totalTx) }))

  // Since-genesis byte composition (fixed window — ignores the 60d selector; the card is titled "since DIESEL genesis").
  // Delegates to the shared computeBytesComposition, which subtracts alkanes out of the runestone
  // total (protostones are embedded in runestones, not a disjoint bucket).
  const sumOpReturnBytes = sumBy(rows, (r) => r.opReturnBytes)
  const bytesComposition = sumOpReturnBytes === 0 ? null : computeBytesComposition(rows, "full")

  const bytesPerTx = rows.map((r) => ({
    date: r.date,
    alkanes: ratio(r.alkanesBytes, r.txAlkanes),
    rest: ratio(r.opReturnBytes - r.alkanesBytes, r.txWithOpReturn - r.txAlkanes),
  }))

  const minerRevenueUsd: OpReturnPoint[] = rows.map((r) => {
    const factor = dayFactor(r)
    if (factor === null) return { date: r.date, value: null }
    // The subsidy is 3.125 BTC per BLOCK, so it has to scale with the blocks the day actually had.
    // Pairing it with a nominal 144 while the fees above are the day's real total would credit the
    // miners with coinbase that was never mined: 2026-07-16 had 121 blocks, so a 144-block subsidy
    // invents 23 BTC (~19%) — and since the subsidy dwarfs the fees by ~100x here, that error would
    // drive the whole chart. (Before dayFactor used the real span, both halves were normalized to a
    // fictional 144-block day, which was at least self-consistent.)
    const btcPerDay = (r.feeTotalSats / 1e8) * factor + 3.125 * blockSpan(r)
    return { date: r.date, value: btcPerDay * r.btcUsd }
  })

  const feesSplitBtc = rows.map((r) => {
    const factor = dayFactor(r)
    if (factor === null) return { date: r.date, alkanes: null, rest: null }
    return {
      date: r.date,
      alkanes: (r.feeAlkanesSats / 1e8) * factor,
      rest: ((r.feeTotalSats - r.feeAlkanesSats) / 1e8) * factor,
    }
  })

  const alkanesFeeShare: OpReturnPoint[] = rows.map((r) => ({ date: r.date, value: ratio(r.feeAlkanesSats, r.feeTotalSats) }))

  const weightShare: OpReturnPoint[] = rows.map((r) => ({ date: r.date, value: ratioNullable(r.weightAlkanes, r.weightTotal) }))
  const ugDieselShare: OpReturnPoint[] = rows.map((r) => ({ date: r.date, value: ratioNullable(r.dieselUg, r.ugMints) }))

  // "How much of Bitcoin is Alkanes?" — the same four shares (tx / OP_RETURN bytes / block weight /
  // miner fee revenue) overlaid on one chart. byWeight is nullable (optional CSV column).
  const fourAnswers = rows.map((r) => ({
    date: r.date,
    byTx: ratio(r.txAlkanes, r.totalTx),
    byBytes: ratio(r.alkanesBytes, r.opReturnBytes),
    byWeight: ratioNullable(r.weightAlkanes, r.weightTotal),
    byFee: ratio(r.feeAlkanesSats, r.feeTotalSats),
  }))

  // DIESEL mints extrapolated to a full 144-block day (null when 0 blocks sampled), and the running
  // cumulative total (a zero-block day contributes 0 rather than breaking the curve).
  const dieselMintsPerDay: OpReturnPoint[] = rows.map((r) => {
    const factor = dayFactor(r)
    return { date: r.date, value: factor === null ? null : r.dieselMints * factor }
  })
  let dieselCum = 0
  const dieselCumulative: OpReturnPoint[] = rows.map((r) => {
    const factor = dayFactor(r)
    dieselCum += factor === null ? 0 : r.dieselMints * factor
    return { date: r.date, value: dieselCum }
  })

  // Fee paid per transaction (sats): Alkanes tx vs everyone else. Null when a bucket has no tx that
  // day, and null for the Alkanes bucket below the min-sample threshold (genesis-era outliers).
  const feePerTx = rows.map((r) => ({
    date: r.date,
    alkanes: r.txAlkanes < FEE_PER_TX_MIN_SAMPLE ? null : ratio(r.feeAlkanesSats, r.txAlkanes),
    rest: ratio(r.feeTotalSats - r.feeAlkanesSats, r.totalTx - r.txAlkanes),
  }))

  // UNCOMMON•GOODS mints/day (raw sampled counts, not extrapolated — matches the dashboard):
  // DIESEL-driven (dieselUg) vs independent Runes (ugMints - dieselUg, clamped ≥ 0). Null when the CSV lacks UG fields.
  const ugMintsPerDay = rows.map((r) => ({
    date: r.date,
    diesel: r.dieselUg ?? null,
    independent: r.ugMints == null || r.dieselUg == null ? null : Math.max(0, r.ugMints - r.dieselUg),
  }))

  // "Pure Runes" = runestone bytes that aren't Alkanes (protostones live inside runestones).
  const pureRunesBytes = (r: OpReturnRow): number => Math.max(0, r.runestoneBytes - r.alkanesBytes)
  const runesVsAlkanesShare = rows.map((r) => ({
    date: r.date,
    alkanes: ratio(r.alkanesBytes, r.opReturnBytes),
    pureRunes: ratio(pureRunesBytes(r), r.opReturnBytes),
  }))
  const runesVsAlkanesBytes = rows.map((r) => {
    const factor = dayFactor(r)
    return {
      date: r.date,
      alkanes: factor === null ? null : r.alkanesBytes * factor,
      pureRunes: factor === null ? null : pureRunesBytes(r) * factor,
    }
  })
  const byteComposition = rows.map((r) => ({
    date: r.date,
    alkanes: ratio(r.alkanesBytes, r.opReturnBytes),
    pureRunes: ratio(pureRunesBytes(r), r.opReturnBytes),
    other: ratio(Math.max(0, r.opReturnBytes - r.runestoneBytes), r.opReturnBytes),
  }))

  // Runestone transactions — Alkanes protostones vs pure Runes (Runestones that aren't Alkanes).
  // The CSV's txAlkRunestone/txPureRunes are already extrapolated to a full 144-block day, so the
  // count series plot them directly (no dayFactor). The share is their normalized split — exact
  // regardless of the sampled block count, since it cancels in the ratio. Null when either is absent.
  const runestoneTxShare = rows.map((r) => {
    const total = r.txAlkRunestone == null || r.txPureRunes == null ? null : r.txAlkRunestone + r.txPureRunes
    return {
      date: r.date,
      alkanes: total == null || total === 0 ? null : (r.txAlkRunestone as number) / total,
      pureRunes: total == null || total === 0 ? null : (r.txPureRunes as number) / total,
    }
  })
  const runestoneTxCount = rows.map((r) => ({
    date: r.date,
    alkanes: r.txAlkRunestone ?? null,
    pureRunes: r.txPureRunes ?? null,
  }))

  const weightEligibleRows = rows.filter((r) => r.weightTotal != null && r.weightAlkanes != null)
  const lastWeightEligible = weightEligibleRows[weightEligibleRows.length - 1]
  const weightStats = {
    full: ratioOfSumsNullable(rows, (r) => r.weightAlkanes, (r) => r.weightTotal),
    latest: lastWeightEligible ? ratioNullable(lastWeightEligible.weightAlkanes, lastWeightEligible.weightTotal) : null,
  }

  const ugEligibleRows = rows.filter((r) => r.ugMints != null && r.dieselUg != null)
  const ugEarly30Rows = ugEligibleRows.slice(0, 30)
  const ugLast30Rows = ugEligibleRows.slice(-30)
  const ugStats = {
    early30: ratioOfSumsNullable(ugEarly30Rows, (r) => r.dieselUg, (r) => r.ugMints),
    last30: ratioOfSumsNullable(ugLast30Rows, (r) => r.dieselUg, (r) => r.ugMints),
    full: ratioOfSumsNullable(rows, (r) => r.dieselUg, (r) => r.ugMints),
  }

  const last30Rows = rows.slice(-30)
  const stats: PublicOpReturnPayload["stats"] = {
    last30: {
      alkanesOfOpReturnTx: ratioOfSums(last30Rows, (r) => r.txAlkanes, (r) => r.txWithOpReturn),
      alkanesOfOpReturnBytes: ratioOfSums(last30Rows, (r) => r.alkanesBytes, (r) => r.opReturnBytes),
      alkanesFeeShare: ratioOfSums(last30Rows, (r) => r.feeAlkanesSats, (r) => r.feeTotalSats),
      // Same window as alkanesFeeShare, so the card copy never compares a 30d Alkanes share
      // against a full-period OP_RETURN share (Alkanes ⊆ OP_RETURN only holds within one window).
      opReturnFeeShare: ratioOfSums(last30Rows, (r) => r.feeOpReturnSats, (r) => r.feeTotalSats),
    },
    full: {
      alkanesFeeShare: ratioOfSums(rows, (r) => r.feeAlkanesSats, (r) => r.feeTotalSats),
      opReturnFeeShare: ratioOfSums(rows, (r) => r.feeOpReturnSats, (r) => r.feeTotalSats),
      alkanesBytesPerTx: ratioOfSums(rows, (r) => r.alkanesBytes, (r) => r.txAlkanes),
    },
    latest: {
      date: last.date,
      fromHeight: last.fromHeight,
      toHeight: last.toHeight,
      blocksScanned: last.blocksScanned,
      txWithOpReturn: last.txWithOpReturn,
      txAlkanes: last.txAlkanes,
      alkanesOfOpReturnTx: ratio(last.txAlkanes, last.txWithOpReturn),
    },
    weight: weightStats,
    ug: ugStats,
  }

  return {
    updatedAt: last.date,
    days: rows.length,
    header: { firstDate: first.date, lastDate: last.date, totalTxSampled: sumBy(rows, (r) => r.totalTx) },
    dailyShare,
    opReturnShare,
    latestDonut,
    dieselTxShare,
    bytesComposition,
    bytesPerTx,
    minerRevenueUsd,
    feesSplitBtc,
    alkanesFeeShare,
    weightShare,
    ugDieselShare,
    fourAnswers,
    dieselMintsPerDay,
    dieselCumulative,
    feePerTx,
    ugMintsPerDay,
    runesVsAlkanesShare,
    runesVsAlkanesBytes,
    byteComposition,
    runestoneTxShare,
    runestoneTxCount,
    stats,
  }
}
