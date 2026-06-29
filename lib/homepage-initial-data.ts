import { getStats, type HomeStats } from "@/lib/stats"

const CANONICAL_STATS_URL = "https://subfrost.io/api/stats"
const CANONICAL_VOLUME_URL = "https://subfrost.io/api/volume/stats?source=both"
const FETCH_TIMEOUT_MS = 10_000
const VOLUME_FETCH_TIMEOUT_MS = 1_500

export type InitialVolumeStats = {
  wrap_24h_sats?: string
  unwrap_24h_sats?: string
}

function hasStats(payload: HomeStats | null | undefined) {
  return Boolean(
    payload?.btcUsd ??
      payload?.marquee.btcUsd ??
      payload?.totalBtcLocked ??
      payload?.metrics.alkanesBtcLocked ??
      payload?.metrics.brc20BtcLocked
  )
}

async function fetchJson<T>(url: string, timeoutMs = FETCH_TIMEOUT_MS): Promise<T | null> {
  try {
    const response = await fetch(url, {
      headers: { accept: "application/json" },
      signal: AbortSignal.timeout(timeoutMs),
      next: { revalidate: 60 },
    })
    if (!response.ok) return null
    return (await response.json()) as T
  } catch {
    return null
  }
}

export async function loadInitialHomeStats() {
  try {
    const stats = await getStats()
    if (hasStats(stats)) return stats
  } catch {
    // Preview/local databases can be cold or missing HomeStat before deploy init.
  }

  return fetchJson<Partial<HomeStats>>(CANONICAL_STATS_URL)
}

export async function loadInitialVolumeStats() {
  return fetchJson<InitialVolumeStats>(CANONICAL_VOLUME_URL, VOLUME_FETCH_TIMEOUT_MS)
}
