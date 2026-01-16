/**
 * API Route: Alkanes BTC Locked
 *
 * Returns the total BTC locked in the Alkanes Subfrost address.
 * Uses direct RPC calls for reliability in serverless environments.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { getAlkanesBtcLocked } from '@/lib/rpc-client';

const CACHE_KEY = 'alkanes-btc-locked';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch BTC locked using direct RPC
    const btcData = await getAlkanesBtcLocked();

    const result = {
      btcLocked: btcData.btcLocked,
      satoshis: btcData.satoshis.toString(),
      utxoCount: btcData.utxoCount,
      address: btcData.address,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching BTC balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BTC balance.', details: errorMessage },
      { status: 500 }
    );
  }
}
