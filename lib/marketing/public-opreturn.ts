import { listOpReturnDaily } from "@/lib/marketing/opreturn-store"
import type { OpReturnRow } from "@/lib/marketing/opreturn-types"

// Public OP_RETURN chart series for /data. Chart-level aggregates only —
// source is the sampled scanner CSV ingested into OpReturnDaily (see the
// methodology note rendered next to these charts).
//
// Fee series are extrapolated to full days: factor(r) = 144 / r.blocksScanned
// (null when blocksScanned === 0). Miner revenue USD/day adds the 3.125 BTC/block
// subsidy over 144 blocks before converting to USD. See plan Global Constraints.

export interface OpReturnPoint { date: string; value: number | null }

export interface PublicOpReturnPayload {
  updatedAt: string | null
  days: number
  header: { firstDate: string | null; lastDate: string | null; totalTxSampled: number }
  dailyShare: { date: string; txShare: number | null; opReturnPenetration: number | null }[]
  opReturnShare: { date: string; txPct: number | null; bytesPct: number | null }[]
  latestDonut: { date: string; diesel: number; alkanesOther: number; other: number } | null
  dieselTxShare: OpReturnPoint[]
  bytesCum: { date: string; opReturn: number; alkanes: number; runes: number }[]
  bytesPerTx: { date: string; alkanes: number | null; rest: number | null }[]
  minerRevenueUsd: OpReturnPoint[]
  feesSplitBtc: { date: string; alkanes: number | null; rest: number | null }[]
  alkanesFeeShare: OpReturnPoint[]
  weightShare: OpReturnPoint[]
  ugDieselShare: OpReturnPoint[]
  stats: {
    last30: { alkanesOfOpReturnTx: number | null; alkanesOfOpReturnBytes: number | null; alkanesFeeShare: number | null }
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
  bytesCum: [],
  bytesPerTx: [],
  minerRevenueUsd: [],
  feesSplitBtc: [],
  alkanesFeeShare: [],
  weightShare: [],
  ugDieselShare: [],
  stats: {
    last30: { alkanesOfOpReturnTx: null, alkanesOfOpReturnBytes: null, alkanesFeeShare: null },
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

/** Extrapolation factor to a full 144-block day; null when the row scanned 0 blocks. */
const dayFactor = (r: OpReturnRow): number | null => (r.blocksScanned === 0 ? null : 144 / r.blocksScanned)

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
    rows = await listOpReturnDaily()
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

  let opReturnCum = 0
  let alkanesCum = 0
  let runesCum = 0
  const bytesCum = rows.map((r) => {
    opReturnCum += r.opReturnBytes
    alkanesCum += r.alkanesBytes
    runesCum += r.runestoneBytes
    return { date: r.date, opReturn: opReturnCum, alkanes: alkanesCum, runes: runesCum }
  })

  const bytesPerTx = rows.map((r) => ({
    date: r.date,
    alkanes: ratio(r.alkanesBytes, r.txAlkanes),
    rest: ratio(r.opReturnBytes - r.alkanesBytes, r.txWithOpReturn - r.txAlkanes),
  }))

  const minerRevenueUsd: OpReturnPoint[] = rows.map((r) => {
    const factor = dayFactor(r)
    if (factor === null) return { date: r.date, value: null }
    const btcPerDay = (r.feeTotalSats / 1e8) * factor + 3.125 * 144
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
    bytesCum,
    bytesPerTx,
    minerRevenueUsd,
    feesSplitBtc,
    alkanesFeeShare,
    weightShare,
    ugDieselShare,
    stats,
  }
}
