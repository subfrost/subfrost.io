/**
 * API Route: frBTC Issued (Total Supply)
 *
 * Returns the total frBTC supply.
 * Uses Redis caching for fast responses and persists snapshots to database.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncFrbtcSupply } from '@/lib/sync-service';

const CACHE_KEY = 'frbtc-issued';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Sync and persist to database
    const supplyData = await syncFrbtcSupply();

    const result = {
      frBtcIssued: supplyData.frbtcIssued,
      rawSupply: supplyData.rawSupply,
      adjustedSupply: supplyData.adjustedSupply,
      blockHeight: supplyData.blockHeight,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching frBTC supply:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frBTC supply.' },
      { status: 500 }
    );
  }
}
