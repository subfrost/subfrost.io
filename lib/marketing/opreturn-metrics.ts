import { WINDOW_DAYS, type MetricKey, type OpReturnRow, type WindowKey } from "./opreturn-types"

const NUM: Record<MetricKey, (r: OpReturnRow) => number> = {
  alkanesTxShare: (r) => r.txAlkanes,
  alkanesOfOpReturnShare: (r) => r.txAlkanes,
  opReturnTxShare: (r) => r.txWithOpReturn,
  alkanesBytesShare: (r) => r.alkanesBytes,
  runesBytesShare: (r) => r.runestoneBytes,
  dieselShareOfAlkanes: (r) => r.dieselMints,
  alkanesFeeShare: (r) => r.feeAlkanesSats,
  alkanesFeeUsdDaily: (r) => (r.feeAlkanesSats / 1e8) * r.btcUsd,
  alkanesFeeUsdCumulative: (r) => (r.feeAlkanesSats / 1e8) * r.btcUsd,
}

const DEN: Record<MetricKey, ((r: OpReturnRow) => number) | null> = {
  alkanesTxShare: (r) => r.totalTx,
  alkanesOfOpReturnShare: (r) => r.txWithOpReturn,
  opReturnTxShare: (r) => r.totalTx,
  alkanesBytesShare: (r) => r.opReturnBytes,
  runesBytesShare: (r) => r.opReturnBytes,
  dieselShareOfAlkanes: (r) => r.txAlkanes,
  alkanesFeeShare: (r) => r.feeTotalSats,
  alkanesFeeUsdDaily: null,
  alkanesFeeUsdCumulative: null,
}

export function metricKind(metric: MetricKey): "ratio" | "usd" {
  return DEN[metric] ? "ratio" : "usd"
}

export function dayValue(r: OpReturnRow, metric: MetricKey): number | null {
  const den = DEN[metric]
  if (!den) return NUM[metric](r)
  const d = den(r)
  return d === 0 ? null : NUM[metric](r) / d
}

function windowRows(rows: OpReturnRow[], window: WindowKey): OpReturnRow[] {
  const n = WINDOW_DAYS[window]
  return n === null ? rows : rows.slice(-n)
}

export function computeMetric(rows: OpReturnRow[], metric: MetricKey, window: WindowKey) {
  const kind = metricKind(metric)
  const win = windowRows(rows, window)
  let value: number | null = null
  if (kind === "ratio") {
    const den = DEN[metric]!
    const numSum = win.reduce((s, r) => s + NUM[metric](r), 0)
    const denSum = win.reduce((s, r) => s + den(r), 0)
    value = denSum === 0 ? null : numSum / denSum
  } else if (metric === "alkanesFeeUsdCumulative") {
    value = win.reduce((s, r) => s + NUM[metric](r), 0)
  } else {
    value = win.length ? win.reduce((s, r) => s + NUM[metric](r), 0) / win.length : null
  }
  const series = rows.slice(-60).map((r) => ({ date: r.date, value: dayValue(r, metric) }))
  return { value, kind, series }
}

export function computeBytesComposition(rows: OpReturnRow[], window: WindowKey): { alkanes: number; runes: number; other: number } {
  const win = windowRows(rows, window)
  const total = win.reduce((s, r) => s + r.opReturnBytes, 0)
  if (total === 0) return { alkanes: 0, runes: 0, other: 0 }
  const a = win.reduce((s, r) => s + r.alkanesBytes, 0) / total
  const ru = win.reduce((s, r) => s + r.runestoneBytes, 0) / total
  return { alkanes: a, runes: ru, other: Math.max(0, 1 - a - ru) }
}
