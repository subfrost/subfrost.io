/**
 * API Route: frBTC Issued (Total Supply)
 *
 * Returns the total frBTC supply.
 * Uses Redis caching for performance and optionally persists to database.
 */

import { NextResponse } from 'next/server';
import { alkanesClient } from '@/lib/alkanes-client';
import { cacheGetOrCompute } from '@/lib/redis';

const CACHE_KEY = 'frbtc-issued';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    const result = await cacheGetOrCompute(
      CACHE_KEY,
      async () => {
        const supplyData = await alkanesClient.getFrbtcTotalSupply();
        return {
          frBtcIssued: supplyData.btc,
          rawSupply: supplyData.raw.toString(),
          adjustedSupply: supplyData.adjusted.toString(),
          timestamp: Date.now(),
        };
      },
      CACHE_TTL
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching frBTC supply:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frBTC supply.' },
      { status: 500 }
    );
  }
}
