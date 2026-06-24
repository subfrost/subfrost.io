/**
 * DIESEL/FIRE USD prices from ESPO (canon alkanode). Mirrors subfrost-app's
 * `fetchEspoUsdPricesFrom10mCandles` + `parseEspoScaledUsd`: ammdata.get_candles
 * on the `<id>-usd` pool, newest 10m candle, USD = Number(close) / 1e16.
 */
const ESPO_RPC_URL = process.env.ESPO_RPC_URL || 'https://api.alkanode.com/rpc'
const ESPO_PRICE_SCALE = 10_000_000_000_000_000 // 1e16

export const DIESEL_POOL = '2:0-usd'
export const FIRE_POOL = '2:77623-usd'

export async function getEspoUsdPrice(pool: string, fetchImpl: typeof fetch = fetch): Promise<number> {
  const res = await fetchImpl(ESPO_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method: 'ammdata.get_candles',
      params: { pool, timeframe: '10m', side: 'base', limit: 1, page: 1 },
    }),
    signal: AbortSignal.timeout(15_000),
  })
  if (!res.ok) throw new Error(`ESPO get_candles ${pool} responded ${res.status}`)
  const data = (await res.json()) as { result?: { candles?: { close?: string }[] } }
  const close = data.result?.candles?.[0]?.close
  if (!close || !/^\d+$/.test(close)) throw new Error(`ESPO get_candles ${pool} returned no candle`)
  const usd = Number(close) / ESPO_PRICE_SCALE
  if (!Number.isFinite(usd) || usd <= 0) throw new Error(`ESPO get_candles ${pool} parsed non-positive USD`)
  return usd
}
