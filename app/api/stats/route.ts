import { NextResponse } from "next/server"
import { getStats, normalizeHomeStats, type HomeStats, type HomeStatsInput } from "@/lib/stats"

export const dynamic = "force-dynamic"

const CANONICAL_STATS_URL = "https://subfrost.io/api/stats"
const FETCH_TIMEOUT_MS = 10_000

function hasCriticalStats(payload: HomeStats) {
  return Boolean(
    payload.btcUsd ??
      payload.marquee.btcUsd ??
      payload.totalBtcLocked ??
      payload.metrics.alkanesBtcLocked ??
      payload.metrics.brc20BtcLocked
  )
}

async function fetchCanonicalStats(request?: Request) {
  const host = request ? new URL(request.url).host.toLowerCase() : ""
  if (host === "subfrost.io" || host === "www.subfrost.io") return null

  try {
    const response = await fetch(CANONICAL_STATS_URL, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      cache: "no-store",
    })
    if (!response.ok) return null
    return normalizeHomeStats((await response.json()) as HomeStatsInput)
  } catch {
    return null
  }
}

export async function GET(request?: Request) {
  try {
    const stats = normalizeHomeStats(await getStats())
    if (hasCriticalStats(stats)) {
      return NextResponse.json(stats, {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
        },
      })
    }

    const fallback = await fetchCanonicalStats(request)
    if (fallback) {
      return NextResponse.json(fallback, {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
        },
      })
    }

    return NextResponse.json(stats, {
      headers: {
        "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
      },
    })
  } catch {
    const fallback = await fetchCanonicalStats(request)
    if (fallback) {
      return NextResponse.json(fallback, {
        headers: {
          "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
        },
      })
    }
  }

  return NextResponse.json(normalizeHomeStats({}), {
    headers: {
      "Cache-Control": "public, max-age=60, stale-while-revalidate=180",
    },
  })
}
