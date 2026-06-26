import { storeGetAll, storeGetLatestUpdatedAt } from "@/lib/stats-store"

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
    btcDieselRatio: number | null
    btcFireRatio: number | null
  }
  stats: {
    btcHeight: number | null
    metashrewHeight: number | null
    btcPrice: number | null
    btcDieselPrice: number | null
    btcFirePrice: number | null
  }
  totalBtcLocked: number | null
  currentFrbtcSupply: number | null
  lifetimeTxValueBtc: number | null
  lifetimeTxValueUsd: number | null
  btcUsd: number | null
  btcHeight: number | null
  msHeight: number | null
  dieselUsd: number | null
  fireUsd: number | null
  btcDieselPrice: number | null
  btcFirePrice: number | null
  updatedAt: string | null
}

export type HomeStatsInput = Partial<Omit<HomeStats, "metrics" | "marquee" | "stats">> & {
  metrics?: Partial<HomeStats["metrics"]>
  marquee?: Partial<HomeStats["marquee"]>
  stats?: Partial<HomeStats["stats"]>
}

const numOrNull = (value: unknown): number | null =>
  typeof value === "number" && Number.isFinite(value) ? value : null

const btcUsdOrNull = (value: unknown): number | null => {
  const number = numOrNull(value)
  if (number === null || number <= 0) return null
  return number < 1_000 ? number * 1_000 : number
}

const strOrNull = (value: unknown): string | null =>
  typeof value === "string" && value ? value : null

function sumKnown(values: Array<number | null>) {
  return values.every((value): value is number => typeof value === "number")
    ? values.reduce((sum, value) => sum + value, 0)
    : null
}

function ratioOrNull(numerator: number | null, denominator: number | null) {
  return typeof numerator === "number" && typeof denominator === "number" && denominator > 0
    ? numerator / denominator
    : null
}

export function normalizeHomeStats(payload: HomeStatsInput): HomeStats {
  const metrics = {
    alkanesBtcLocked: numOrNull(payload.metrics?.alkanesBtcLocked),
    brc20BtcLocked: numOrNull(payload.metrics?.brc20BtcLocked),
    alkanesBtcLockedAddress: strOrNull(payload.metrics?.alkanesBtcLockedAddress),
    brc20BtcLockedAddress: strOrNull(payload.metrics?.brc20BtcLockedAddress),
    alkanesCirculating: numOrNull(payload.metrics?.alkanesCirculating),
    brc20Circulating: numOrNull(payload.metrics?.brc20Circulating),
    alkanesTotalUnwraps: numOrNull(payload.metrics?.alkanesTotalUnwraps),
    brc20TotalUnwraps: numOrNull(payload.metrics?.brc20TotalUnwraps),
    btcPrice: btcUsdOrNull(payload.metrics?.btcPrice ?? payload.stats?.btcPrice ?? payload.btcUsd),
  }
  const btcUsd = btcUsdOrNull(payload.btcUsd ?? payload.marquee?.btcUsd ?? metrics.btcPrice)
  const btcHeight = numOrNull(payload.btcHeight ?? payload.marquee?.btcHeight ?? payload.stats?.btcHeight)
  const msHeight = numOrNull(payload.msHeight ?? payload.marquee?.metashrewHeight ?? payload.stats?.metashrewHeight)
  const dieselUsd = numOrNull(payload.dieselUsd ?? payload.marquee?.dieselUsd)
  const fireUsd = numOrNull(payload.fireUsd ?? payload.marquee?.fireUsd)
  const lifetimeTxValueBtc =
    numOrNull(payload.lifetimeTxValueBtc) ??
    sumKnown([
      metrics.alkanesTotalUnwraps,
      metrics.brc20TotalUnwraps,
      metrics.alkanesCirculating,
      metrics.brc20Circulating,
    ])
  const btcPrice = btcUsdOrNull(metrics.btcPrice ?? btcUsd)
  const btcDieselPrice =
    numOrNull(payload.stats?.btcDieselPrice ?? payload.btcDieselPrice ?? payload.marquee?.btcDieselRatio) ??
    ratioOrNull(btcPrice, dieselUsd)
  const btcFirePrice =
    numOrNull(payload.stats?.btcFirePrice ?? payload.btcFirePrice ?? payload.marquee?.btcFireRatio) ??
    ratioOrNull(btcPrice, fireUsd)
  const marquee = {
    btcUsd,
    btcHeight,
    metashrewHeight: msHeight,
    dieselUsd,
    fireUsd,
    btcDieselRatio: btcDieselPrice,
    btcFireRatio: btcFirePrice,
  }
  const stats = {
    btcHeight,
    metashrewHeight: msHeight,
    btcPrice,
    btcDieselPrice,
    btcFirePrice,
  }

  return {
    metrics,
    marquee,
    stats,
    totalBtcLocked: numOrNull(payload.totalBtcLocked) ?? sumKnown([metrics.alkanesBtcLocked, metrics.brc20BtcLocked]),
    currentFrbtcSupply:
      numOrNull(payload.currentFrbtcSupply) ?? sumKnown([metrics.alkanesCirculating, metrics.brc20Circulating]),
    lifetimeTxValueBtc,
    lifetimeTxValueUsd:
      numOrNull(payload.lifetimeTxValueUsd) ??
      (typeof lifetimeTxValueBtc === "number" && typeof btcPrice === "number" ? lifetimeTxValueBtc * btcPrice : null),
    btcUsd,
    btcHeight,
    msHeight,
    dieselUsd,
    fireUsd,
    btcDieselPrice,
    btcFirePrice,
    updatedAt: payload.updatedAt ?? null,
  }
}

export async function getStats(): Promise<HomeStats> {
  const [store, updatedAt] = await Promise.all([storeGetAll(), storeGetLatestUpdatedAt()])
  const at = (key: string): Record<string, unknown> | undefined =>
    store[key] && typeof store[key] === "object" ? (store[key] as Record<string, unknown>) : undefined

  const alkanesLocked = at("alkanes-btc-locked")
  const brc20Locked = at("brc20-btc-locked")
  const alkanesCirc = at("alkanes-circulating")
  const brc20Circ = at("brc20-circulating")
  const alkanesUnwraps = at("alkanes-total-unwraps")
  const brc20Unwraps = at("brc20-total-unwraps")
  const price = at("btc-price")
  const btcHeight = at("btc-height")
  const msHeight = at("metashrew-height")
  const diesel = at("diesel-price")
  const fire = at("fire-price")

  const btcPrice = btcUsdOrNull(price?.btcPrice)
  const metrics = {
    alkanesBtcLocked: numOrNull(alkanesLocked?.btcLocked),
    brc20BtcLocked: numOrNull(brc20Locked?.btcLocked),
    alkanesBtcLockedAddress: strOrNull(alkanesLocked?.address),
    brc20BtcLockedAddress: strOrNull(brc20Locked?.address),
    alkanesCirculating: numOrNull(alkanesCirc?.circulatingBtc),
    brc20Circulating: numOrNull(brc20Circ?.circulatingBtc),
    alkanesTotalUnwraps: numOrNull(alkanesUnwraps?.totalUnwrapsBtc),
    brc20TotalUnwraps: numOrNull(brc20Unwraps?.totalUnwrapsBtc),
    btcPrice,
  }
  const marquee = {
    btcUsd: btcPrice,
    btcHeight: numOrNull(btcHeight?.height),
    metashrewHeight: numOrNull(msHeight?.height),
    dieselUsd: numOrNull(diesel?.usd),
    fireUsd: numOrNull(fire?.usd),
  }
  const totalBtcLocked = sumKnown([metrics.alkanesBtcLocked, metrics.brc20BtcLocked])
  const currentFrbtcSupply = sumKnown([metrics.alkanesCirculating, metrics.brc20Circulating])
  const lifetimeTxValueBtc = sumKnown([
    metrics.alkanesTotalUnwraps,
    metrics.brc20TotalUnwraps,
    metrics.alkanesCirculating,
    metrics.brc20Circulating,
  ])

  return normalizeHomeStats({
    metrics,
    marquee,
    totalBtcLocked,
    currentFrbtcSupply,
    lifetimeTxValueBtc,
    btcUsd: marquee.btcUsd,
    btcHeight: marquee.btcHeight,
    msHeight: marquee.metashrewHeight,
    dieselUsd: marquee.dieselUsd,
    fireUsd: marquee.fireUsd,
    updatedAt,
  })
}
