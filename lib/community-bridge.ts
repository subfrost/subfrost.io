/**
 * Community bridge — resolves a wallet's invite-code/community data.
 *
 * subfrost.io now OWNS the referral graph, so this reads the local DB
 * (lib/referral/codes) instead of calling app.subfrost.io. This is the
 * inversion of the old direction (subfrost.io → app). Non-blocking: returns
 * null if unavailable or on any error — never throws.
 */
import { lookupByAddress } from "@/lib/referral/codes"

// In-memory cache with 5-minute TTL.
const cache = new Map<string, { data: CommunityData | null; expiry: number }>()
const CACHE_TTL = 5 * 60 * 1000

export interface CommunityData {
  found: boolean
  code?: string
  codeDescription?: string
  parentCode?: string
}

export async function lookupCommunityData(taprootAddress: string): Promise<CommunityData | null> {
  if (!taprootAddress) return null

  const cached = cache.get(taprootAddress)
  if (cached && cached.expiry > Date.now()) return cached.data

  try {
    const r = await lookupByAddress(taprootAddress)
    const data: CommunityData = r.found
      ? {
          found: true,
          code: r.code,
          codeDescription: r.codeDescription ?? undefined,
          parentCode: r.parentCode ?? undefined,
        }
      : { found: false }
    cache.set(taprootAddress, { data, expiry: Date.now() + CACHE_TTL })
    return data
  } catch {
    // DB error — cache a null result briefly so we don't hammer it.
    cache.set(taprootAddress, { data: null, expiry: Date.now() + 60_000 })
    return null
  }
}
