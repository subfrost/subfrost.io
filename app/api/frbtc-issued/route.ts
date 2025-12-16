/**
 * API Route: frBTC Issued (Total Supply)
 *
 * Returns the total frBTC supply.
 * Uses Redis caching for fast responses and persists snapshots to database.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncFrbtcSupply } from '@/lib/sync-service';
import { getFrbtcIssuedData } from '@/lib/blockchain-data';

const CACHE_KEY = 'frbtc-issued';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Try to sync and persist to database
    let result;
    try {
      const supplyData = await syncFrbtcSupply();
      result = {
        frBtcIssued: supplyData.frbtcIssued,
        rawSupply: supplyData.rawSupply,
        adjustedSupply: supplyData.adjustedSupply,
        blockHeight: supplyData.blockHeight,
        timestamp: Date.now(),
      };
    } catch (dbError) {
      // Fallback: fetch directly from SDK if database is unavailable
      console.log('Database unavailable, fetching directly from SDK');
      const supplyData = await getFrbtcIssuedData();
      result = {
        ...supplyData,
        timestamp: Date.now(),
      };
    }

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
