/**
 * API Route: Alkanes Circulating Supply (frBTC)
 *
 * Returns the live circulating frBTC supply on Alkanes.
 * Core fetch logic lives in @/lib/alkanes-circulating.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { fetchAlkanesCirculating } from '@/lib/alkanes-circulating';

const CACHE_KEY = 'alkanes-circulating';
const CACHE_TTL = 2100; // 35 minutes — kept warm by /api/prefetch

export async function GET() {
  try {
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const result = await fetchAlkanesCirculating();
    await cacheSet(CACHE_KEY, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching Alkanes circulating supply:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to fetch Alkanes circulating supply.', details: errorMessage },
      { status: 500 }
    );
  }
}
