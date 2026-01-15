/**
 * API Route: Alkanes BTC Locked
 *
 * Returns the total BTC locked in the Alkanes Subfrost address.
 * Uses Redis caching for fast responses and persists snapshots to database.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncBtcLocked, getLatestBtcLocked } from '@/lib/sync-service';
import { getBtcLockedData } from '@/lib/blockchain-data';

const CACHE_KEY = 'alkanes-btc-locked';
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
      const btcData = await syncBtcLocked();
      result = {
        btcLocked: btcData.btcLocked,
        satoshis: btcData.satoshis,
        utxoCount: btcData.utxoCount,
        address: btcData.address,
        blockHeight: btcData.blockHeight,
        timestamp: Date.now(),
      };
    } catch (dbError) {
      // Fallback: fetch directly from SDK if database is unavailable
      console.log('Database unavailable, fetching directly from SDK');
      const btcData = await getBtcLockedData();
      result = {
        ...btcData,
        timestamp: Date.now(),
      };
    }

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
