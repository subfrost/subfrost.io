export interface OpReturnRow {
  date: string
  fromHeight: number; toHeight: number; blocksScanned: number
  totalTx: number; txWithOpReturn: number; txAlkanes: number
  opReturnBytes: number; runestoneBytes: number; alkanesBytes: number; dieselMints: number
  feeTotalSats: number; feeAlkanesSats: number; feeOpReturnSats: number; btcUsd: number
  // Added with the 19-column CSV. Empty CSV cell (e.g. today's partial row) → null, never 0.
  weightTotal?: number | null; weightAlkanes?: number | null
  ugMints?: number | null; dieselUg?: number | null
  // Added with the 21-column CSV. Runestone tx counts, already extrapolated to a full 144-block
  // day (Alkanes protostones vs pure Runes). Empty CSV cell → null, never 0.
  txAlkRunestone?: number | null; txPureRunes?: number | null
}

export const OPRETURN_COLUMNS: (keyof OpReturnRow)[] = [
  "date", "fromHeight", "toHeight", "blocksScanned", "totalTx", "txWithOpReturn", "txAlkanes",
  "opReturnBytes", "runestoneBytes", "alkanesBytes", "dieselMints",
  "feeTotalSats", "feeAlkanesSats", "feeOpReturnSats", "btcUsd",
]

// New in the 19-/21-column CSV. Header-mapped, not positional; missing/blank cell → null.
export const OPRETURN_OPTIONAL_COLUMNS: (keyof OpReturnRow)[] = [
  "weightTotal", "weightAlkanes", "ugMints", "dieselUg",
  "txAlkRunestone", "txPureRunes",
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
