/**
 * API Route: BTC Locked
 *
 * Returns the total BTC locked in the Subfrost address.
 * Uses Redis caching for fast responses and persists snapshots to database.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncBtcLocked, getLatestBtcLocked } from '@/lib/sync-service';
import { alkanesClient } from '@/lib/alkanes-client';

const CACHE_KEY = 'btc-locked';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Sync and persist to database
    const btcData = await syncBtcLocked();

    const result = {
      btcLocked: btcData.btcLocked,
      satoshis: btcData.satoshis,
      utxoCount: btcData.utxoCount,
      address: (await alkanesClient.getBtcLocked()).address,
      blockHeight: btcData.blockHeight,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching BTC balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BTC balance.' },
      { status: 500 }
    );
  }
}
