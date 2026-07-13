/**
 * Network health — proxies the mainnet.subfrost.io multi-indexer divergence
 * snapshot (the same /api/health surface the subkube mainnet-dashboard serves,
 * backed by subfrost-mobile-api /v1/health/snapshot) and caches it with a 3-min
 * TTL so the admin Dashboard isn't hammering the upstream. Distinct from this
 * app's own /api/health (the Cloud Run / k8s readiness check).
 */
import { NextResponse } from "next/server"
import { cacheGetOrCompute } from "@/lib/redis"

export const dynamic = "force-dynamic"

const UPSTREAM = process.env.HEALTH_UPSTREAM_URL || "https://mainnet.subfrost.io/api/health"
const CACHE_KEY = "network:health:mainnet"
const TTL_SECONDS = 180 // 3 minutes
const TIMEOUT_MS = 12_000

async function fetchNetworkHealth(): Promise<unknown> {
  const ctrl = new AbortController()
  const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS)
  try {
    const res = await fetch(UPSTREAM, {
      signal: ctrl.signal,
      headers: { accept: "application/json" },
      cache: "no-store",
    })
    if (!res.ok) throw new Error(`upstream ${res.status}`)
    const data = await res.json()
    // A 200 with a partial body (e.g. missing endpoints[] during an upstream
    // rollout) must NOT be cached and served: the dashboard maps over endpoints,
    // so a shape without it crashes every load for the 3-min TTL. Reject it here
    // so it falls through to the degraded envelope instead of poisoning the cache.
    if (!data || !Array.isArray((data as { endpoints?: unknown }).endpoints)) {
      throw new Error("upstream health payload missing endpoints[]")
    }
    return data
  } finally {
    clearTimeout(timer)
  }
}

export async function GET() {
  try {
    const data = await cacheGetOrCompute(CACHE_KEY, fetchNetworkHealth, TTL_SECONDS)
    return NextResponse.json(data, {
      headers: { "Cache-Control": "public, max-age=60, stale-while-revalidate=180" },
    })
  } catch (error) {
    // Degraded envelope — mirrors the upstream's failure shape so the dashboard
    // can render a red state instead of crashing.
    return NextResponse.json(
      {
        healthy: false,
        endpoints: [],
        comparison: null,
        error: error instanceof Error ? error.message : "network health unavailable",
        timestamp: new Date().toISOString(),
      },
      { status: 502 },
    )
  }
}
