/**
 * Community bridge — looks up wallet addresses in subfrost-app's invite code system.
 * Non-blocking: returns null if unavailable or misconfigured.
 */

const SUBFROST_APP_URL = process.env.SUBFROST_APP_URL || 'https://app.subfrost.io';
const SUBFROST_APP_API_KEY = process.env.SUBFROST_APP_API_KEY || '';

// In-memory cache with 5-minute TTL
const cache = new Map<string, { data: CommunityData | null; expiry: number }>();
const CACHE_TTL = 5 * 60 * 1000; // 5 minutes

export interface CommunityData {
  found: boolean;
  code?: string;
  codeDescription?: string;
  parentCode?: string;
}

/**
 * Look up community/referral data for a taproot address.
 * Returns null if unavailable — never throws.
 */
export async function lookupCommunityData(taprootAddress: string): Promise<CommunityData | null> {
  if (!SUBFROST_APP_API_KEY || !taprootAddress) return null;

  // Check cache
  const cached = cache.get(taprootAddress);
  if (cached && cached.expiry > Date.now()) return cached.data;

  try {
    const url = `${SUBFROST_APP_URL}/api/invite-codes/lookup?address=${encodeURIComponent(taprootAddress)}`;
    const res = await fetch(url, {
      headers: { 'X-API-Key': SUBFROST_APP_API_KEY },
      signal: AbortSignal.timeout(3000),
    });

    if (!res.ok) {
      cache.set(taprootAddress, { data: null, expiry: Date.now() + CACHE_TTL });
      return null;
    }

    const data: CommunityData = await res.json();
    cache.set(taprootAddress, { data, expiry: Date.now() + CACHE_TTL });
    return data;
  } catch {
    // Network error or timeout — cache null result for a shorter period
    cache.set(taprootAddress, { data: null, expiry: Date.now() + 60_000 });
    return null;
  }
}
