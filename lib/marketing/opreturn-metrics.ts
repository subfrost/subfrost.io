import { WINDOW_DAYS, METRIC_AGG, METRIC_FORMAT, type MetricFormat, type MetricKey, type OpReturnRow, type WindowKey } from "./opreturn-types"

// NUM/DEN may return null for metrics backed by optional CSV columns (weight, runestone tx),
// which are absent on old rows. computeMetric skips rows where either side is null.
const NUM: Record<MetricKey, (r: OpReturnRow) => number | null> = {
  alkanesTxShare: (r) => r.txAlkanes,
  alkanesOfOpReturnShare: (r) => r.txAlkanes,
  opReturnTxShare: (r) => r.txWithOpReturn,
  alkanesBytesShare: (r) => r.alkanesBytes,
  runesBytesShare: (r) => r.runestoneBytes,
  dieselShareOfAlkanes: (r) => r.dieselMints,
  alkanesFeeShare: (r) => r.feeAlkanesSats,
  alkanesFeeUsdDaily: (r) => (r.feeAlkanesSats / 1e8) * r.btcUsd,
  alkanesFeeUsdCumulative: (r) => (r.feeAlkanesSats / 1e8) * r.btcUsd,
  alkanesWeightShare: (r) => r.weightAlkanes ?? null,
  dieselTxShareOfAll: (r) => r.dieselMints,
  alkanesRunestoneTxShare: (r) => r.txAlkRunestone ?? null,
  dieselMintedCumulative: (r) => r.dieselMints,
}

const DEN: Record<MetricKey, ((r: OpReturnRow) => number | null) | null> = {
  alkanesTxShare: (r) => r.totalTx,
  alkanesOfOpReturnShare: (r) => r.txWithOpReturn,
  opReturnTxShare: (r) => r.totalTx,
  alkanesBytesShare: (r) => r.opReturnBytes,
  runesBytesShare: (r) => r.opReturnBytes,
  dieselShareOfAlkanes: (r) => r.txAlkanes,
  alkanesFeeShare: (r) => r.feeTotalSats,
  alkanesFeeUsdDaily: null,
  alkanesFeeUsdCumulative: null,
  alkanesWeightShare: (r) => r.weightTotal ?? null,
  dieselTxShareOfAll: (r) => r.totalTx,
  alkanesRunestoneTxShare: (r) => (r.txAlkRunestone == null || r.txPureRunes == null ? null : r.txAlkRunestone + r.txPureRunes),
  dieselMintedCumulative: null,
}

export function dayValue(r: OpReturnRow, metric: MetricKey): number | null {
  const n = NUM[metric](r)
  const den = DEN[metric]
  if (!den) return n
  const d = den(r)
  if (n == null || d == null || d === 0) return null
  return n / d
}

function windowRows(rows: OpReturnRow[], window: WindowKey): OpReturnRow[] {
  const n = WINDOW_DAYS[window]
  return n === null ? rows : rows.slice(-n)
}

export function computeMetric(rows: OpReturnRow[], metric: MetricKey, window: WindowKey) {
  const agg = METRIC_AGG[metric]
  const format = METRIC_FORMAT[metric]
  const win = windowRows(rows, window)
  let value: number | null = null
  if (agg === "ratio") {
    const den = DEN[metric]
    if (den) {
      const pairs = win
        .map((r) => ({ n: NUM[metric](r), d: den(r) }))
        .filter((p): p is { n: number; d: number } => p.n != null && p.d != null)
      const denSum = pairs.reduce((s, p) => s + p.d, 0)
      value = denSum === 0 ? null : pairs.reduce((s, p) => s + p.n, 0) / denSum
    }
  } else {
    const vals = win.map((r) => NUM[metric](r)).filter((v): v is number => v != null)
    if (vals.length) {
      const sum = vals.reduce((s, v) => s + v, 0)
      value = agg === "avg" ? sum / vals.length : sum
    }
  }
  let series: { date: string; value: number | null }[]
  if (agg === "sum") {
    let acc = 0
    series = rows.slice(-60).map((r) => {
      const v = NUM[metric](r)
      if (v != null) acc += v
      return { date: r.date, value: acc }
    })
  } else {
    series = rows.slice(-60).map((r) => ({ date: r.date, value: dayValue(r, metric) }))
  }
  return { value, format, series }
}

const usdFmt = new Intl.NumberFormat("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 0 })
const countFmt = new Intl.NumberFormat("en-US", { notation: "compact", maximumFractionDigits: 1 })

/** Render a metric value for display on a card, per its format. Pure. */
export function formatMetricValue(value: number | null, format: MetricFormat): string {
  if (value === null) return "—"
  switch (format) {
    case "pct": return `${(value * 100).toFixed(1)}%`
    case "usd": return usdFmt.format(value)
    case "count": return countFmt.format(value)
    case "oneInN": return value <= 0 ? "—" : `1 in ${Math.round(1 / value)}`
  }
}

export function computeBytesComposition(rows: OpReturnRow[], window: WindowKey): { alkanes: number; runes: number; other: number } {
  const win = windowRows(rows, window)
  const total = win.reduce((s, r) => s + r.opReturnBytes, 0)
  if (total === 0) return { alkanes: 0, runes: 0, other: 0 }
  // runestoneBytes INCLUDES alkanesBytes (Alkanes protostones are embedded in runestones), so the
  // runes slice is the runestone total minus the alkanes share — they are not disjoint buckets.
  const a = win.reduce((s, r) => s + r.alkanesBytes, 0) / total
  const rTot = win.reduce((s, r) => s + r.runestoneBytes, 0) / total
  return { alkanes: a, runes: Math.max(0, rTot - a), other: Math.max(0, 1 - rTot) }
}
