import { storeGetAll } from '@/lib/stats-store'

export interface HomeStats {
  metrics: {
    alkanesBtcLocked: number | null
    brc20BtcLocked: number | null
    alkanesBtcLockedAddress: string | null
    brc20BtcLockedAddress: string | null
    alkanesCirculating: number | null
    brc20Circulating: number | null
    alkanesTotalUnwraps: number | null
    brc20TotalUnwraps: number | null
    btcPrice: number | null
  }
  marquee: {
    btcUsd: number | null
    btcHeight: number | null
    metashrewHeight: number | null
    dieselUsd: number | null
    fireUsd: number | null
    // BTC priced in the token (token-per-BTC) = btcUsd / tokenUsd. Derived from the
    // USD fields above; null when either operand is missing or the divisor is zero.
    btcDieselRatio: number | null
    btcFireRatio: number | null
  }
}

const numOrNull = (v: unknown): number | null => (typeof v === 'number' && Number.isFinite(v) ? v : null)
const strOrNull = (v: unknown): string | null => (typeof v === 'string' && v ? v : null)
const ratioOrNull = (num: number | null, den: number | null): number | null =>
  num !== null && den !== null && den !== 0 ? num / den : null

/** Assemble the full home stat set from the durable store. Reads the store only —
 *  never calls the live cascade. A cold/missing/malformed key yields null for that
 *  field; never throws. */
export async function getStats(): Promise<HomeStats> {
  const store = await storeGetAll()
  const at = (k: string): Record<string, unknown> | undefined =>
    (store[k] && typeof store[k] === 'object' ? (store[k] as Record<string, unknown>) : undefined)

  const alkanesLocked = at('alkanes-btc-locked')
  const brc20Locked = at('brc20-btc-locked')
  const alkanesCirc = at('alkanes-circulating')
  const brc20Circ = at('brc20-circulating')
  const alkanesUnwraps = at('alkanes-total-unwraps')
  const brc20Unwraps = at('brc20-total-unwraps')
  const price = at('btc-price')
  const btcHeight = at('btc-height')
  const msHeight = at('metashrew-height')
  const diesel = at('diesel-price')
  const fire = at('fire-price')

  const btcPrice = numOrNull(price?.btcPrice)
  const dieselUsd = numOrNull(diesel?.usd)
  const fireUsd = numOrNull(fire?.usd)
  return {
    metrics: {
      alkanesBtcLocked: numOrNull(alkanesLocked?.btcLocked),
      brc20BtcLocked: numOrNull(brc20Locked?.btcLocked),
      alkanesBtcLockedAddress: strOrNull(alkanesLocked?.address),
      brc20BtcLockedAddress: strOrNull(brc20Locked?.address),
      alkanesCirculating: numOrNull(alkanesCirc?.circulatingBtc),
      brc20Circulating: numOrNull(brc20Circ?.circulatingBtc),
      alkanesTotalUnwraps: numOrNull(alkanesUnwraps?.totalUnwrapsBtc),
      brc20TotalUnwraps: numOrNull(brc20Unwraps?.totalUnwrapsBtc),
      btcPrice,
    },
    marquee: {
      btcUsd: btcPrice,
      btcHeight: numOrNull(btcHeight?.height),
      metashrewHeight: numOrNull(msHeight?.height),
      dieselUsd,
      fireUsd,
      btcDieselRatio: ratioOrNull(btcPrice, dieselUsd),
      btcFireRatio: ratioOrNull(btcPrice, fireUsd),
    },
  }
}
