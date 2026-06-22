"use server"

import { currentUser } from "@/lib/cms/authz"
import { cacheGet, cacheSet } from "@/lib/redis"
import { fetchTreasurySnapshot } from "@/lib/financials/treasury/source/live"
import type { TreasurySnapshot } from "@/lib/financials/treasury/shapes"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"

export type TreasuryResult =
  | { ok: true; snapshot: TreasurySnapshot; stale?: boolean }
  | { ok: false; error: "unauthorized" | "not_configured" | "upstream" }

const CACHE_KEY = "financials:treasury"
const LAST_GOOD_KEY = "financials:treasury:last"
const TTL = 300 // 5 min
const LAST_GOOD_TTL = 86_400 // 24h

/** Snapshot of the BSC treasury wallets. Gated on FINANCIALS_PRIVILEGE, Redis-
 *  cached (5 min) with a 24h last-good fallback. Never throws: a provider blip
 *  serves the previous snapshot (stale) or reports `upstream`. */
export async function treasuryOverviewAction(opts?: { refresh?: boolean }): Promise<TreasuryResult> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(FINANCIALS_PRIVILEGE)) return { ok: false, error: "unauthorized" }
  if (!process.env.GOLDRUSH_API_KEY) return { ok: false, error: "not_configured" }

  if (!opts?.refresh) {
    const cached = await cacheGet<TreasurySnapshot>(CACHE_KEY)
    if (cached) return { ok: true, snapshot: cached }
  }

  try {
    const snapshot = await fetchTreasurySnapshot()
    await cacheSet(CACHE_KEY, snapshot, TTL)
    await cacheSet(LAST_GOOD_KEY, snapshot, LAST_GOOD_TTL)
    return { ok: true, snapshot }
  } catch (error) {
    console.error("[financials/treasury] upstream error:", error)
    const lastGood = await cacheGet<TreasurySnapshot>(LAST_GOOD_KEY)
    if (lastGood) return { ok: true, snapshot: lastGood, stale: true }
    return { ok: false, error: "upstream" }
  }
}
