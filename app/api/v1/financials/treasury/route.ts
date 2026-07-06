import { NextRequest, NextResponse } from "next/server"
import { fetchTreasurySnapshot } from "@/lib/financials/treasury/source/live"
import { BSC_RPC_URL } from "@/lib/financials/treasury/config"
import { cacheGet, cacheSet } from "@/lib/redis"
import type { TreasurySnapshot } from "@/lib/financials/treasury/shapes"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const CACHE_KEY = "financials:treasury"
const LAST_GOOD_KEY = "financials:treasury:last"
const TTL = 300 // 5 min
const LAST_GOOD_TTL = 86_400 // 24h

// GET /api/v1/financials/treasury — BSC treasury snapshot (scope: financials.view).
// Redis-cached (5 min) with a 24h last-good fallback. `?refresh=true` bypasses
// the cache. Mirrors treasuryOverviewAction.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "financials.view")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    if (!BSC_RPC_URL) return fail("Treasury source not configured", 503)
    const refresh = req.nextUrl.searchParams.get("refresh") === "true"

    if (!refresh) {
      const cached = await cacheGet<TreasurySnapshot>(CACHE_KEY)
      if (cached) return ok({ snapshot: cached, stale: false })
    }

    try {
      const snapshot = await fetchTreasurySnapshot()
      await cacheSet(CACHE_KEY, snapshot, TTL)
      await cacheSet(LAST_GOOD_KEY, snapshot, LAST_GOOD_TTL)
      return ok({ snapshot, stale: false })
    } catch (error) {
      console.error("[financials/treasury] upstream error:", error)
      const lastGood = await cacheGet<TreasurySnapshot>(LAST_GOOD_KEY)
      if (lastGood) return ok({ snapshot: lastGood, stale: true })
      return fail("Treasury upstream unavailable", 502)
    }
  })
}
