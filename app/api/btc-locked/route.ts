/**
 * API Route: BTC Locked
 *
 * Returns the total BTC locked in the Subfrost address.
 * Uses Redis caching for performance and optionally persists to database.
 */

import { NextResponse } from 'next/server';
import { alkanesClient } from '@/lib/alkanes-client';
import { cacheGetOrCompute } from '@/lib/redis';

const CACHE_KEY = 'btc-locked';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    const result = await cacheGetOrCompute(
      CACHE_KEY,
      async () => {
        const btcData = await alkanesClient.getBtcLocked();
        return {
          btcLocked: btcData.btc,
          satoshis: btcData.satoshis,
          utxoCount: btcData.utxoCount,
          address: btcData.address,
          timestamp: Date.now(),
        };
      },
      CACHE_TTL
    );

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching BTC balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BTC balance.' },
      { status: 500 }
    );
  }
}
