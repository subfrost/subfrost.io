export interface OpReturnRow {
  date: string
  fromHeight: number; toHeight: number; blocksScanned: number
  totalTx: number; txWithOpReturn: number; txAlkanes: number
  opReturnBytes: number; runestoneBytes: number; alkanesBytes: number; dieselMints: number
  feeTotalSats: number; feeAlkanesSats: number; feeOpReturnSats: number; btcUsd: number
}

export const OPRETURN_COLUMNS: (keyof OpReturnRow)[] = [
  "date", "fromHeight", "toHeight", "blocksScanned", "totalTx", "txWithOpReturn", "txAlkanes",
  "opReturnBytes", "runestoneBytes", "alkanesBytes", "dieselMints",
  "feeTotalSats", "feeAlkanesSats", "feeOpReturnSats", "btcUsd",
]

export type MetricKey =
  | "alkanesTxShare" | "alkanesOfOpReturnShare" | "opReturnTxShare"
  | "alkanesBytesShare" | "runesBytesShare" | "dieselShareOfAlkanes"
  | "alkanesFeeShare" | "alkanesFeeUsdDaily" | "alkanesFeeUsdCumulative"

export type WindowKey = "latest" | "avg7" | "avg30" | "avg60" | "avg120" | "full"

export const WINDOW_DAYS: Record<WindowKey, number | null> = {
  latest: 1, avg7: 7, avg30: 30, avg60: 60, avg120: 120, full: null,
}

export const METRIC_LABELS: Record<MetricKey, string> = {
  alkanesTxShare: "Alkanes share of Bitcoin transactions",
  alkanesOfOpReturnShare: "Alkanes share of OP_RETURN transactions",
  opReturnTxShare: "OP_RETURN share of Bitcoin transactions",
  alkanesBytesShare: "Alkanes share of OP_RETURN bytes",
  runesBytesShare: "Runes share of OP_RETURN bytes",
  dieselShareOfAlkanes: "DIESEL share of Alkanes activity",
  alkanesFeeShare: "Alkanes share of Bitcoin fees",
  alkanesFeeUsdDaily: "Daily Bitcoin fees paid by Alkanes (USD)",
  alkanesFeeUsdCumulative: "Total Bitcoin fees paid by Alkanes (USD)",
}

export const WINDOW_LABELS: Record<WindowKey, string> = {
  latest: "Latest day", avg7: "7-day average", avg30: "30-day average",
  avg60: "60-day average", avg120: "120-day average", full: "Full tracked period",
}
