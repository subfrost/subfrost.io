import { NextResponse } from "next/server"
import { cacheGetOrCompute } from "@/lib/redis"
import { getPublishedPreviews, type CmsLocale } from "@/lib/cms/articles"

export const dynamic = "force-dynamic"

const SUBFROST_BASE = (process.env.ALKANES_RPC_URL || "https://mainnet.subfrost.io/v4/subfrost").replace(/\/$/, "")
const BITCOIN_RPC_URL = (process.env.BITCOIN_RPC_URL || "https://mainnet.subfrost.io/v4/jsonrpc").replace(/\/$/, "")
const ESPO_BASE = (process.env.ESPO_MAINNET_PRIMARY_URL || "https://oyl.alkanode.com").replace(/\/$/, "")
const SUBPRICER_URL = `${SUBFROST_BASE}/api/v1/bitcoin-price`
const NETWORK_HEALTH_URL = process.env.HEALTH_UPSTREAM_URL || "https://mainnet.subfrost.io/api/health"
const CACHE_KEY = "homepage:payload:v4"
const CACHE_TTL = 180
const FETCH_TIMEOUT_MS = 8_000
const ALKANE_FACTORY_ID = "4:65522"
const DIESEL_ID = "2:0"
const FRBTC_ID = "32:0"
const FIRE_ID = "2:77623"

type HealthEndpoint = {
  id?: string
  name?: string
  kind?: string
  height?: number | null
}

type HealthSnapshot = {
  endpoints?: HealthEndpoint[]
  comparison?: { height?: number | null } | null
  timestamp?: string
}

type PoolToken = {
  block?: string
  tx?: string
  alkaneId?: { block?: string; tx?: string }
  decimals?: number
}

type PoolSnapshot = {
  poolId?: { block?: string; tx?: string }
  token0?: PoolToken
  token1?: PoolToken
  token0Amount?: string
  token1Amount?: string
  reserve0?: string
  reserve1?: string
  poolTvlInUsd?: number | string
}

type PoolsResponse = {
  data?: { pools?: PoolSnapshot[] }
  pools?: PoolSnapshot[]
}

type JsonRpcResponse<T> = {
  result?: T
  error?: { code?: number; message?: string }
}

async function fetchJson<T>(url: string): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

async function fetchJsonRpcNumber(url: string, method: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify({ jsonrpc: "2.0", method, params: [], id: 1 }),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!response.ok) return null
    const data = (await response.json()) as JsonRpcResponse<number | string>
    const value = Number(data.result)
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

async function postJson<T>(url: string, body: unknown): Promise<T | null> {
  try {
    const response = await fetch(url, {
      method: "POST",
      headers: { accept: "application/json", "content-type": "application/json" },
      body: JSON.stringify(body),
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

async function firstAvailableNumber(tasks: Array<Promise<number | null>>) {
  try {
    return await Promise.any(
      tasks.map(async (task) => {
        const value = await task
        if (typeof value === "number" && Number.isFinite(value)) return value
        throw new Error("number unavailable")
      }),
    )
  } catch {
    return null
  }
}

async function fetchTextNumber(url: string): Promise<number | null> {
  try {
    const response = await fetch(url, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!response.ok) return null
    const value = Number(await response.text())
    return Number.isFinite(value) ? value : null
  } catch {
    return null
  }
}

function getHealthHeight(health: HealthSnapshot | null) {
  const comparisonHeight = health?.comparison?.height
  if (typeof comparisonHeight === "number" && Number.isFinite(comparisonHeight)) {
    return comparisonHeight
  }

  const endpoints = health?.endpoints ?? []
  const heights = endpoints
    .map((endpoint) => endpoint.height)
    .filter((height): height is number => typeof height === "number" && Number.isFinite(height))

  return heights[0] ?? null
}

async function fetchBtcHeightWithHealthFallback(healthTask: Promise<HealthSnapshot | null>) {
  const ownRpcHeight = await firstAvailableNumber([
    fetchJsonRpcNumber(BITCOIN_RPC_URL, "getblockcount"),
    fetchJsonRpcNumber(SUBFROST_BASE, "getblockcount"),
  ])
  if (ownRpcHeight != null) return ownRpcHeight

  const healthHeight = getHealthHeight(await healthTask)
  if (healthHeight != null) return healthHeight

  return firstAvailableNumber([
    fetchTextNumber("https://blockstream.info/api/blocks/tip/height"),
    fetchTextNumber("https://blockchain.info/q/getblockcount"),
    fetchTextNumber("https://mempool.space/api/blocks/tip/height"),
  ])
}

async function fetchMetashrewHeightWithHealthFallback(healthTask: Promise<HealthSnapshot | null>) {
  const rpcHeight = await fetchJsonRpcNumber(SUBFROST_BASE, "metashrew_height")
  return rpcHeight ?? getHealthHeight(await healthTask)
}

function tokenId(token?: PoolToken) {
  const block = token?.alkaneId?.block ?? token?.block
  const tx = token?.alkaneId?.tx ?? token?.tx
  return block != null && tx != null ? `${block}:${tx}` : ""
}

function displayReserve(pool: PoolSnapshot, side: "token0" | "token1") {
  const raw =
    side === "token0"
      ? pool.token0Amount ?? pool.reserve0 ?? "0"
      : pool.token1Amount ?? pool.reserve1 ?? "0"
  const decimals = side === "token0" ? pool.token0?.decimals ?? 8 : pool.token1?.decimals ?? 8
  const value = Number(raw)
  return Number.isFinite(value) ? value / 10 ** decimals : 0
}

function poolTvl(pool: PoolSnapshot) {
  const value = Number(pool.poolTvlInUsd ?? 0)
  return Number.isFinite(value) ? value : 0
}

function getTokenReserves(pool: PoolSnapshot) {
  return {
    token0Id: tokenId(pool.token0),
    token1Id: tokenId(pool.token1),
    reserve0: displayReserve(pool, "token0"),
    reserve1: displayReserve(pool, "token1"),
  }
}

function findHighestTvlPool(pools: PoolSnapshot[], tokenA: string, tokenB: string) {
  return pools
    .filter((pool) => {
      const { token0Id, token1Id } = getTokenReserves(pool)
      return (
        (token0Id === tokenA && token1Id === tokenB) ||
        (token0Id === tokenB && token1Id === tokenA)
      )
    })
    .sort((a, b) => poolTvl(b) - poolTvl(a))[0]
}

function ratioForPair(pool: PoolSnapshot, baseToken: string, quoteToken: string) {
  const { token0Id, token1Id, reserve0, reserve1 } = getTokenReserves(pool)
  if (reserve0 <= 0 || reserve1 <= 0) return null

  if (token0Id === baseToken && token1Id === quoteToken) return reserve1 / reserve0
  if (token1Id === baseToken && token0Id === quoteToken) return reserve0 / reserve1
  return null
}

function deriveAmmPrices(pools: PoolSnapshot[]) {
  const dieselFrbtcPool = findHighestTvlPool(pools, DIESEL_ID, FRBTC_ID)
  const btcDieselPrice = dieselFrbtcPool ? ratioForPair(dieselFrbtcPool, FRBTC_ID, DIESEL_ID) : null

  const fireCandidates = pools
    .map((pool) => {
      const { token0Id, token1Id, reserve0, reserve1 } = getTokenReserves(pool)
      if (reserve0 <= 0 || reserve1 <= 0) return null

      if (token0Id === FIRE_ID && token1Id === FRBTC_ID) {
        return { tvl: poolTvl(pool), firePerBtc: reserve0 / reserve1 }
      }
      if (token1Id === FIRE_ID && token0Id === FRBTC_ID) {
        return { tvl: poolTvl(pool), firePerBtc: reserve1 / reserve0 }
      }
      if (btcDieselPrice && token0Id === FIRE_ID && token1Id === DIESEL_ID) {
        return { tvl: poolTvl(pool), firePerBtc: (reserve0 / reserve1) * btcDieselPrice }
      }
      if (btcDieselPrice && token1Id === FIRE_ID && token0Id === DIESEL_ID) {
        return { tvl: poolTvl(pool), firePerBtc: (reserve1 / reserve0) * btcDieselPrice }
      }

      return null
    })
    .filter((candidate): candidate is { tvl: number; firePerBtc: number } => {
      return !!candidate && Number.isFinite(candidate.firePerBtc) && candidate.firePerBtc > 0
    })
    .sort((a, b) => b.tvl - a.tvl)

  return {
    btcDieselPrice,
    btcFirePrice: fireCandidates[0]?.firePerBtc ?? null,
  }
}

async function fetchAmmPrices() {
  const [factoryBlock, factoryTx] = ALKANE_FACTORY_ID.split(":")
  const poolsData = await postJson<PoolsResponse>(`${ESPO_BASE}/get-all-pools-details`, {
    factoryId: { block: factoryBlock, tx: factoryTx },
  })
  const pools = poolsData?.data?.pools ?? poolsData?.pools ?? []
  return deriveAmmPrices(pools)
}

function requestLocale(request: Request): CmsLocale {
  const params = new URL(request.url).searchParams
  return params.get("lang") === "zh" || params.get("locale") === "zh" ? "zh" : "en"
}

async function buildHomepagePayload(locale: CmsLocale) {
  const healthTask = fetchJson<HealthSnapshot>(NETWORK_HEALTH_URL)
  const [, btcHeight, metashrewHeight, btcPriceData, ammPrices, articles] = await Promise.all([
    healthTask,
    fetchBtcHeightWithHealthFallback(healthTask),
    fetchMetashrewHeightWithHealthFallback(healthTask),
    fetchJson<{ usd?: number; bitcoin?: { usd?: number } }>(SUBPRICER_URL),
    fetchAmmPrices(),
    getPublishedPreviews({ limit: 3, locale, previewFallback: true }).catch(() => []),
  ])

  const btcPrice = typeof btcPriceData?.usd === "number" ? btcPriceData.usd : btcPriceData?.bitcoin?.usd ?? null

  return {
    stats: {
      btcHeight,
      metashrewHeight,
      btcPrice,
      btcDieselPrice: ammPrices.btcDieselPrice,
      btcFirePrice: ammPrices.btcFirePrice,
      updatedAt: new Date().toISOString(),
    },
    sources: {
      btcHeight: [BITCOIN_RPC_URL, SUBFROST_BASE, NETWORK_HEALTH_URL, "blockstream.info", "blockchain.info", "mempool.space"],
      metashrewHeight: [SUBFROST_BASE, NETWORK_HEALTH_URL],
      btcPrice: [SUBPRICER_URL],
      ammPools: [`${ESPO_BASE}/get-all-pools-details`],
    },
    articles,
  }
}

export async function GET(request: Request) {
  const locale = requestLocale(request)
  const payload = await cacheGetOrCompute(`${CACHE_KEY}:${locale}`, () => buildHomepagePayload(locale), CACHE_TTL)

  return NextResponse.json(payload, {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
    },
  })
}
