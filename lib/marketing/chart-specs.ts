import { WINDOW_DAYS, type WindowKey } from "./opreturn-types"

// Chart spec map for the /metrics OP_RETURN charts (components/data/OpReturnCharts.tsx) and
// param validation for the server-rendered "Copy chart" PNG route (app/metrics/chart/opreturn,
// a later task). Pure + client-safe: no server-only imports, so both the render route and the
// page can import this module.
//
// `id`s are an append-only contract: never rename or remove one, only add. Ids reuse the
// existing Card `anchorId` where the chart already has one (e.g. "diesel-mints-per-day");
// charts that only have a share-card and no anchor get a newly minted, stable kebab id (e.g.
// "daily-alkanes-share", "bytes-donut").
//
// `series[].key` mirrors the field name on the corresponding array in
// PublicOpReturnPayload (lib/marketing/public-opreturn.ts): that's what a later task's render
// route resolves against. Colors are copied from the ACCENT/SECOND/MUTED/FOURTH/SLICE_OTHER/
// RUNES_TINT hex constants at the top of OpReturnCharts.tsx (already fixed hex, no CSS vars).

export type ChartType = "line" | "area" | "stacked" | "donut"
export type ChartScale = "linear" | "log"

export interface SeriesRef {
  key: string
  label: string
  color: string
  dashed?: boolean
}

export interface ChartSpec {
  id: string
  title: string
  type: ChartType
  scale: ChartScale
  series: SeriesRef[]
  valueFormat: "pct" | "count" | "usd" | "bytes"
  /** donut only */
  donutSlices?: { key: string; label: string; color: string }[]
}

// Colors copied verbatim from components/data/OpReturnCharts.tsx.
const ACCENT = "#5dcaa5"
const SECOND = "#f0997b"
const MUTED = "#aab8d6"
const FOURTH = "#d9a441"
const SLICE_OTHER = "#4a4a52"
const RUNES_TINT = "#a7ddca"

export const CHART_SPECS: Record<string, ChartSpec> = {
  "daily-alkanes-share": {
    id: "daily-alkanes-share",
    title: "Daily Alkanes share",
    type: "line",
    scale: "linear",
    valueFormat: "pct",
    series: [
      { key: "txShare", label: "Transactions", color: ACCENT },
      { key: "opReturnPenetration", label: "OP_RETURN penetration", color: MUTED, dashed: true },
    ],
  },
  "alkanes-share-of-opreturn": {
    id: "alkanes-share-of-opreturn",
    title: "Alkanes' share of OP_RETURN",
    type: "line",
    scale: "linear",
    valueFormat: "pct",
    series: [
      { key: "txPct", label: "% of OP_RETURN transactions", color: ACCENT },
      { key: "bytesPct", label: "% of OP_RETURN bytes", color: SECOND },
    ],
  },
  "alkanes-weight-share": {
    id: "alkanes-weight-share",
    title: "Alkanes' share of block space (by weight)",
    type: "area",
    scale: "linear",
    valueFormat: "pct",
    series: [{ key: "value", label: "Alkanes' share of block space (by weight)", color: ACCENT }],
  },
  "four-answers": {
    id: "four-answers",
    title: "How much of Bitcoin is Alkanes? Four answers",
    type: "line",
    scale: "linear",
    valueFormat: "pct",
    series: [
      { key: "byTx", label: "By transaction count", color: ACCENT },
      { key: "byWeight", label: "By block weight", color: MUTED },
      { key: "byFee", label: "By miner fee revenue", color: FOURTH },
      { key: "byBytes", label: "By OP_RETURN bytes", color: SECOND },
    ],
  },
  "last-day-composition": {
    id: "last-day-composition",
    title: "Last day: share of OP_RETURN transactions",
    type: "donut",
    scale: "linear",
    valueFormat: "count",
    series: [],
    donutSlices: [
      { key: "alkanes", label: "Alkanes", color: ACCENT },
      { key: "other", label: "Other OP_RETURN", color: SLICE_OTHER },
    ],
  },
  "diesel-tx-share": {
    id: "diesel-tx-share",
    title: "DIESEL mints: share of all Bitcoin transactions",
    type: "area",
    scale: "linear",
    valueFormat: "pct",
    series: [{ key: "value", label: "DIESEL mints: share of all Bitcoin transactions", color: SECOND }],
  },
  "diesel-mints-per-day": {
    id: "diesel-mints-per-day",
    title: "DIESEL mints per day: the birth curve",
    type: "line",
    scale: "log",
    valueFormat: "count",
    series: [{ key: "value", label: "DIESEL mints per day: the birth curve", color: SECOND }],
  },
  "diesel-mints-cumulative": {
    id: "diesel-mints-cumulative",
    title: "DIESEL mint transactions, cumulative since genesis",
    type: "area",
    scale: "linear",
    valueFormat: "count",
    series: [{ key: "value", label: "DIESEL mint transactions, cumulative since genesis", color: ACCENT }],
  },
  "ug-diesel-share": {
    id: "ug-diesel-share",
    title: "UNCOMMON•GOODS mints that are DIESEL",
    type: "area",
    scale: "linear",
    valueFormat: "pct",
    series: [{ key: "value", label: "UNCOMMON•GOODS mints that are DIESEL", color: ACCENT }],
  },
  "ug-mints-per-day": {
    id: "ug-mints-per-day",
    title: "UNCOMMON•GOODS mints per day: DIESEL-driven vs independent",
    type: "stacked",
    scale: "linear",
    valueFormat: "count",
    series: [
      { key: "diesel", label: "DIESEL", color: SECOND },
      { key: "independent", label: "Independent Runes", color: MUTED },
    ],
  },
  "runes-vs-alkanes-share": {
    id: "runes-vs-alkanes-share",
    title: "Runes (non-Alkanes) vs Alkanes: share of OP_RETURN bytes",
    type: "line",
    scale: "linear",
    valueFormat: "pct",
    series: [
      { key: "alkanes", label: "Alkanes", color: ACCENT },
      { key: "pureRunes", label: "Runes (non-Alkanes)", color: SECOND },
    ],
  },
  "runes-vs-alkanes-bytes": {
    id: "runes-vs-alkanes-bytes",
    title: "Runes (non-Alkanes) vs Alkanes: absolute bytes per day",
    type: "line",
    scale: "log",
    valueFormat: "bytes",
    series: [
      { key: "alkanes", label: "Alkanes", color: ACCENT },
      { key: "pureRunes", label: "Runes (non-Alkanes)", color: SECOND },
    ],
  },
  "byte-composition": {
    id: "byte-composition",
    title: "OP_RETURN byte composition over time",
    type: "stacked",
    scale: "linear",
    valueFormat: "pct",
    series: [
      { key: "alkanes", label: "Alkanes", color: ACCENT },
      { key: "pureRunes", label: "Runes (non-Alkanes)", color: SECOND },
      { key: "other", label: "Other", color: SLICE_OTHER },
    ],
  },
  "runestone-tx-share": {
    id: "runestone-tx-share",
    title: "Runestone transactions: Alkanes vs Runes (non-Alkanes)",
    type: "line",
    scale: "linear",
    valueFormat: "pct",
    series: [
      { key: "alkanes", label: "Alkanes", color: ACCENT },
      { key: "pureRunes", label: "Runes (non-Alkanes)", color: SECOND },
    ],
  },
  "runestone-tx-count": {
    id: "runestone-tx-count",
    title: "Runestone transactions per day: Alkanes vs Runes (non-Alkanes)",
    type: "line",
    scale: "log",
    valueFormat: "count",
    series: [
      { key: "alkanes", label: "Alkanes", color: ACCENT },
      { key: "pureRunes", label: "Runes (non-Alkanes)", color: SECOND },
    ],
  },
  "bytes-donut": {
    id: "bytes-donut",
    title: "OP_RETURN bytes (since DIESEL genesis)",
    type: "donut",
    scale: "linear",
    valueFormat: "pct",
    series: [],
    donutSlices: [
      { key: "alkanes", label: "Alkanes", color: ACCENT },
      { key: "runes", label: "Other Runes", color: RUNES_TINT },
      { key: "other", label: "Non-Runes OP_RETURN", color: SLICE_OTHER },
    ],
  },
  "bytes-per-tx": {
    id: "bytes-per-tx",
    title: "OP_RETURN bytes per transaction",
    type: "line",
    scale: "linear",
    valueFormat: "bytes",
    series: [
      { key: "alkanes", label: "Alkanes", color: ACCENT },
      { key: "rest", label: "Other OP_RETURN", color: SECOND },
    ],
  },
  "miner-revenue-usd": {
    id: "miner-revenue-usd",
    title: "Miner fee revenue",
    type: "area",
    scale: "linear",
    valueFormat: "usd",
    series: [{ key: "value", label: "Miner fee revenue", color: SECOND }],
  },
  "fees-split-btc": {
    id: "fees-split-btc",
    title: "Miner fee revenue from fees (BTC): Alkanes vs rest",
    type: "stacked",
    scale: "linear",
    // No BTC/sats option in valueFormat; "count" is the closest generic numeric format
    // (see task-1-report.md for the note on this ambiguity).
    valueFormat: "count",
    series: [
      { key: "alkanes", label: "Alkanes fees", color: ACCENT },
      { key: "rest", label: "Other fees", color: SECOND },
    ],
  },
  "alkanes-fee-share": {
    id: "alkanes-fee-share",
    title: "Alkanes' share of miner fee revenue",
    type: "area",
    scale: "linear",
    valueFormat: "pct",
    series: [{ key: "value", label: "Alkanes' share of miner fee revenue", color: ACCENT }],
  },
  "fee-per-tx": {
    id: "fee-per-tx",
    title: "Fee per transaction: Alkanes vs everyone else",
    type: "line",
    scale: "linear",
    // Sats, not a raw count or USD; "count" is the closest generic numeric format available
    // (see task-1-report.md for the note on this ambiguity).
    valueFormat: "count",
    series: [
      { key: "alkanes", label: "Alkanes tx", color: ACCENT },
      { key: "rest", label: "Non-Alkanes tx", color: SECOND },
    ],
  },
}

const DEFAULT_WINDOW: WindowKey = "full"
const DEFAULT_THEME: "dark" | "light" = "dark"

/** Validate `?id=&window=&theme=` against the fixed enums, same pattern as parseCardParams
 *  (lib/marketing/opreturn-card.ts): missing window/theme → default, present-but-unknown →
 *  null. Unknown/missing id always → null (there's no sensible default chart to fall back to). */
export function parseChartParams(sp: URLSearchParams): { spec: ChartSpec; window: WindowKey; theme: "dark" | "light" } | null {
  const id = sp.get("id") ?? ""
  const window = sp.get("window") ?? DEFAULT_WINDOW
  const theme = sp.get("theme") ?? DEFAULT_THEME
  if (!Object.prototype.hasOwnProperty.call(CHART_SPECS, id)) return null
  const spec = CHART_SPECS[id]
  if (!Object.prototype.hasOwnProperty.call(WINDOW_DAYS, window)) return null
  if (theme !== "dark" && theme !== "light") return null
  return { spec, window: window as WindowKey, theme }
}

/** Build the canonical server-rendered chart PNG URL for a "Copy chart" button. */
export function chartImageUrl(id: string, window: WindowKey, theme: "dark" | "light" = DEFAULT_THEME): string {
  const p = new URLSearchParams()
  p.set("id", id)
  p.set("window", window)
  p.set("theme", theme)
  return `https://subfrost.io/metrics/chart/opreturn?${p.toString()}`
}
