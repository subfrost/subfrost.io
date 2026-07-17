// lib/ecosystem/candles.ts
import { unstable_cache } from "next/cache"
import { prisma } from "@/lib/prisma"

/**
 * Daily USD price series for ecosystem token profiles, from ESPO AMM candles.
 *
 * Same RPC + scale as lib/espo-price.ts, kept separate on purpose: that one is
 * a hot "latest 10m candle" price for home stats; this is a 90-day daily
 * series with pool-grammar fallback and a data cache.
 */
const ESPO_RPC_URL = process.env.ESPO_RPC_URL || "https://api.alkanode.com/rpc"
const ESPO_PRICE_SCALE = 10_000_000_000_000_000
const DAILY_LIMIT = 90

export interface PricePoint {
  /** Unix seconds (UTC day bucket). */
  t: number
  usd: number
}

interface EspoCandle {
  close?: string
  ts?: number
}

/** Daily close series for one ESPO pool key, oldest→newest. Throws on HTTP failure. */
export async function fetchDailyCandles(pool: string, fetchImpl: typeof fetch = fetch): Promise<PricePoint[]> {
  const response = await fetchImpl(ESPO_RPC_URL, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({
      jsonrpc: "2.0",
      id: 1,
      method: "ammdata.get_candles",
      params: { pool, timeframe: "1d", side: "base", limit: DAILY_LIMIT, page: 1 },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!response.ok) throw new Error(`ESPO get_candles ${pool} responded ${response.status}`)
  const data = (await response.json()) as { result?: { candles?: EspoCandle[] } }
  const points: PricePoint[] = []
  for (const c of data.result?.candles ?? []) {
    if (typeof c.ts !== "number" || !c.close || !/^\d+$/.test(c.close)) continue
    const usd = Number(c.close) / ESPO_PRICE_SCALE
    if (!Number.isFinite(usd) || usd <= 0) continue
    points.push({ t: c.ts, usd })
  }
  // ESPO answers newest-first; plot chronologically.
  return points.sort((a, b) => a.t - b.t)
}

/**
 * Pool grammar: direct `<id>-usd`, else DIESEL-derived `<id>-derived_2:0-usd`.
 * Unknown pools answer `candles: []` with ok, so an empty series means
 * "no pool", not an error. Never throws — the chart is decorative.
 */
export async function resolveDailyCandles(alkaneId: string, fetchImpl: typeof fetch = fetch): Promise<PricePoint[] | null> {
  try {
    const direct = await fetchDailyCandles(`${alkaneId}-usd`, fetchImpl)
    if (direct.length > 0) return direct
    const derived = await fetchDailyCandles(`${alkaneId}-derived_2:0-usd`, fetchImpl)
    return derived.length > 0 ? derived : null
  } catch {
    return null
  }
}

// 15min data cache (candles are UX-grade); the page itself stays force-dynamic.
// unstable_cache keys include the call args, so this is per-alkaneId.
const cachedResolveDailyCandles = unstable_cache(
  (alkaneId: string) => resolveDailyCandles(alkaneId),
  ["ecosystem-daily-candles"],
  { revalidate: 900 },
)

/** slug → published project's alkaneId → cached daily series. Null when no token/pool. */
export async function getEcosystemPriceSeries(slug: string): Promise<PricePoint[] | null> {
  const p = await prisma.ecosystemProject.findFirst({
    where: { slug, published: true },
    select: { alkaneId: true },
  })
  if (!p?.alkaneId) return null
  return cachedResolveDailyCandles(p.alkaneId)
}
