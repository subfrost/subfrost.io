import { listDailySnapshots } from "@/lib/marketing/snapshot-store"
import { buildProtocolSeries, type SeriesPoint } from "@/lib/marketing/protocol-series"
import { getStats, normalizeHomeStats } from "@/lib/stats"

// Public payload for /metrics, /api/data and /metrics/card/[metric].
// HARD RULE: snapshot metrics only — nothing OP_RETURN/decoder related here.

export type PublicMetricKey =
  | "btc-locked" | "frbtc-supply" | "diesel-holders" | "diesel-price"
  | "diesel-marketcap" | "fire-price"

export interface PublicDataPayload {
  updatedAt: string | null
  seriesDays: number
  now: Record<PublicMetricKey, number | null>
  deltas7d: Record<PublicMetricKey, number | null>
  series: SeriesPoint[]
}

export const CARD_METRICS: Record<PublicMetricKey, { label: string; kind: "btc" | "usd" | "int" | "ratio"; seriesField: keyof SeriesPoint }> = {
  "btc-locked": { label: "BTC locked", kind: "btc", seriesField: "btcLocked" },
  "frbtc-supply": { label: "frBTC supply", kind: "btc", seriesField: "frbtcSupply" },
  "diesel-holders": { label: "DIESEL holders", kind: "int", seriesField: "dieselHolders" },
  "diesel-price": { label: "DIESEL price", kind: "usd", seriesField: "dieselPrice" },
  "diesel-marketcap": { label: "DIESEL market cap", kind: "usd", seriesField: "dieselMarketcap" },
  "fire-price": { label: "FIRE price", kind: "usd", seriesField: "firePrice" },
}

export function isPublicMetricKey(v: string): v is PublicMetricKey {
  return Object.prototype.hasOwnProperty.call(CARD_METRICS, v)
}

const int = new Intl.NumberFormat("en-US", { maximumFractionDigits: 0 })
const two = new Intl.NumberFormat("en-US", { minimumFractionDigits: 2, maximumFractionDigits: 2 })

export function formatMetricValue(key: PublicMetricKey, value: number | null): string {
  if (value === null || !Number.isFinite(value)) return "—"
  switch (CARD_METRICS[key].kind) {
    case "int": return int.format(value)
    case "usd": return `$${two.format(value)}`
    case "btc": return `${two.format(value)} BTC`
    case "ratio": return two.format(value)
  }
}

const DAY_MS = 24 * 60 * 60 * 1000

// The latest snapshot can arrive with a token block that is entirely null: the external details
// endpoint (oyl.alkanode.com, see alkane-details.ts) blips ~1 day in 18, and getAlkaneDetails then
// records a full nullBlock. holders/marketcap have no live-stats source (unlike price/locked/supply),
// so they depend solely on the series — and reading only the newest point would blank the card on a
// single failed capture even though every prior day is intact. Anchor on the last point that
// actually carries the field instead: the card shows the last KNOWN value, not "—".
function lastWithField(series: SeriesPoint[], field: keyof SeriesPoint): SeriesPoint | null {
  for (let i = series.length - 1; i >= 0; i--) {
    const v = series[i][field]
    if (typeof v === "number" && Number.isFinite(v)) return series[i]
  }
  return null
}

function delta7d(series: SeriesPoint[], field: keyof SeriesPoint): number | null {
  if (series.length < 2) return null
  const latest = lastWithField(series, field)
  if (!latest) return null
  const latestT = Date.parse(latest.date)
  let baseline: SeriesPoint | null = null
  for (const p of series) {
    const t = Date.parse(p.date)
    if (t > latestT) break // never look past the anchor (a blip could sit after it)
    const v = p[field]
    if (latestT - t >= 7 * DAY_MS && typeof v === "number" && Number.isFinite(v)) baseline = p
  }
  if (!baseline) return null
  const a = baseline[field], b = latest[field]
  if (typeof a !== "number" || typeof b !== "number" || a === 0) return null
  return ((b - a) / a) * 100
}

export async function getPublicData(): Promise<PublicDataPayload> {
  let series: SeriesPoint[] = []
  let updatedAt: string | null = null
  try {
    const rows = await listDailySnapshots()
    // buildProtocolSeries is shared with the admin analytics page and reports frbtcSupply
    // in raw base units (per protocol-series.ts). The public payload is BTC-denominated
    // everywhere else (live.currentFrbtcSupply included), so normalize here only.
    series = buildProtocolSeries(rows).map((p) => ({
      ...p,
      frbtcSupply: p.frbtcSupply === null ? null : p.frbtcSupply / 1e8,
    }))
    updatedAt = rows.length ? rows[rows.length - 1].createdAt.toISOString() : null
  } catch (e) {
    console.error("[public-data] snapshot series unavailable", e)
  }

  let live: { totalBtcLocked?: number | null; currentFrbtcSupply?: number | null; dieselUsd?: number | null; fireUsd?: number | null } = {}
  try {
    live = normalizeHomeStats(await getStats())
  } catch (e) {
    console.error("[public-data] live stats unavailable", e)
  }

  const pick = (liveVal: number | null | undefined, seriesField: keyof SeriesPoint): number | null => {
    if (typeof liveVal === "number" && Number.isFinite(liveVal)) return liveVal
    const v = lastWithField(series, seriesField)?.[seriesField]
    return typeof v === "number" && Number.isFinite(v) ? v : null
  }

  const now: Record<PublicMetricKey, number | null> = {
    "btc-locked": pick(live.totalBtcLocked, "btcLocked"),
    "frbtc-supply": pick(live.currentFrbtcSupply, "frbtcSupply"),
    "diesel-holders": pick(null, "dieselHolders"), // holders exist only in snapshots
    "diesel-price": pick(live.dieselUsd, "dieselPrice"),
    "diesel-marketcap": pick(null, "dieselMarketcap"),
    "fire-price": pick(live.fireUsd, "firePrice"),
  }

  const deltas7d = Object.fromEntries(
    (Object.keys(CARD_METRICS) as PublicMetricKey[]).map((k) => [k, delta7d(series, CARD_METRICS[k].seriesField)]),
  ) as Record<PublicMetricKey, number | null>

  return { updatedAt, seriesDays: series.length, now, deltas7d, series }
}
