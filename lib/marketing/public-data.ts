import { listDailySnapshots } from "@/lib/marketing/snapshot-store"
import { buildProtocolSeries, type SeriesPoint } from "@/lib/marketing/protocol-series"
import { getStats, normalizeHomeStats } from "@/lib/stats"

// Public payload for /metrics, /api/data and /metrics/card/[metric].
// HARD RULE: snapshot metrics only — nothing OP_RETURN/decoder related here.

export type PublicMetricKey =
  | "btc-locked" | "frbtc-supply" | "diesel-holders" | "diesel-price"
  | "diesel-marketcap" | "fire-price" | "btc-diesel" | "btc-fire"

export interface PublicDataPayload {
  updatedAt: string | null
  seriesDays: number
  now: Record<PublicMetricKey, number | null>
  deltas7d: Record<PublicMetricKey, number | null>
  series: SeriesPoint[]
}

export const CARD_METRICS: Record<PublicMetricKey, { label: string; kind: "btc" | "usd" | "int" | "ratio" | "sats"; seriesField: keyof SeriesPoint }> = {
  "btc-locked": { label: "BTC locked", kind: "btc", seriesField: "btcLocked" },
  "frbtc-supply": { label: "frBTC supply", kind: "btc", seriesField: "frbtcSupply" },
  "diesel-holders": { label: "DIESEL holders", kind: "int", seriesField: "dieselHolders" },
  "diesel-price": { label: "DIESEL price", kind: "usd", seriesField: "dieselPrice" },
  "diesel-marketcap": { label: "DIESEL market cap", kind: "usd", seriesField: "dieselMarketcap" },
  "fire-price": { label: "FIRE price", kind: "usd", seriesField: "firePrice" },
  // Shown in the natural orientation: the token priced in BTC (in sats), not BTC/token.
  // The stored ratio is BTC/token; getPublicData flips it (1e8 / ratio) for value + series.
  "btc-diesel": { label: "DIESEL/BTC", kind: "sats", seriesField: "btcDiesel" },
  "btc-fire": { label: "FIRE/BTC", kind: "sats", seriesField: "btcFire" },
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
    case "sats": return `${int.format(value)} sats`
  }
}

// DIESEL/FIRE are presented priced in BTC (natural orientation), rendered in sats.
// Input is the BTC/token ratio (btcUsd / tokenUsd); reciprocal × 1e8 = token price in sats.
const toSats = (btcPerToken: number | null | undefined): number | null =>
  typeof btcPerToken === "number" && Number.isFinite(btcPerToken) && btcPerToken !== 0 ? 1e8 / btcPerToken : null

const DAY_MS = 24 * 60 * 60 * 1000

function delta7d(series: SeriesPoint[], field: keyof SeriesPoint): number | null {
  if (series.length < 2) return null
  const latest = series[series.length - 1]
  const latestT = Date.parse(latest.date)
  let baseline: SeriesPoint | null = null
  for (const p of series) {
    if (latestT - Date.parse(p.date) >= 7 * DAY_MS) baseline = p
    else break
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
      // Flip BTC/token → token-in-sats so the value, sparkline and delta stay consistent.
      // Local copy only — the admin analytics series (buildProtocolSeries) keeps BTC/token.
      btcDiesel: toSats(p.btcDiesel),
      btcFire: toSats(p.btcFire),
    }))
    updatedAt = rows.length ? rows[rows.length - 1].createdAt.toISOString() : null
  } catch (e) {
    console.error("[public-data] snapshot series unavailable", e)
  }

  const last = series.length ? series[series.length - 1] : null
  let live: { totalBtcLocked?: number | null; currentFrbtcSupply?: number | null; dieselUsd?: number | null; fireUsd?: number | null; btcDieselPrice?: number | null; btcFirePrice?: number | null } = {}
  try {
    live = normalizeHomeStats(await getStats())
  } catch (e) {
    console.error("[public-data] live stats unavailable", e)
  }

  const pick = (liveVal: number | null | undefined, seriesField: keyof SeriesPoint): number | null => {
    if (typeof liveVal === "number" && Number.isFinite(liveVal)) return liveVal
    const v = last?.[seriesField]
    return typeof v === "number" && Number.isFinite(v) ? v : null
  }

  const now: Record<PublicMetricKey, number | null> = {
    "btc-locked": pick(live.totalBtcLocked, "btcLocked"),
    "frbtc-supply": pick(live.currentFrbtcSupply, "frbtcSupply"),
    "diesel-holders": pick(null, "dieselHolders"), // holders exist only in snapshots
    "diesel-price": pick(live.dieselUsd, "dieselPrice"),
    "diesel-marketcap": pick(null, "dieselMarketcap"),
    "fire-price": pick(live.fireUsd, "firePrice"),
    "btc-diesel": pick(toSats(live.btcDieselPrice), "btcDiesel"),
    "btc-fire": pick(toSats(live.btcFirePrice), "btcFire"),
  }

  const deltas7d = Object.fromEntries(
    (Object.keys(CARD_METRICS) as PublicMetricKey[]).map((k) => [k, delta7d(series, CARD_METRICS[k].seriesField)]),
  ) as Record<PublicMetricKey, number | null>

  return { updatedAt, seriesDays: series.length, now, deltas7d, series }
}
