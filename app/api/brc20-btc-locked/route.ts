/**
 * API Route: BRC2.0 BTC Locked
 *
 * Returns the total BTC locked in the BRC2.0 frBTC signer address.
 * Uses direct RPC calls for reliability in serverless environments.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { getBrc20BtcLocked } from '@/lib/rpc-client';

const CACHE_KEY = 'brc20-btc-locked';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch BTC locked using direct RPC
    const btcData = await getBrc20BtcLocked();

    const result = {
      btcLocked: btcData.btcLocked,
      satoshis: btcData.satoshis,
      utxoCount: btcData.utxoCount,
      address: btcData.address,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching BRC2.0 BTC locked:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BRC2.0 BTC locked.', details: errorMessage },
      { status: 500 }
    );
  }
}
