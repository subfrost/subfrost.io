/**
 * API Route: BRC2.0 BTC Locked
 *
 * Returns the total BTC locked in the BRC2.0 frBTC signer address.
 * Uses Redis caching for fast responses.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { brc20Client } from '@/lib/brc20-client';

const CACHE_KEY = 'brc20-btc-locked';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch BTC locked at the BRC2.0 signer address
    const btcData = await brc20Client.getBtcLockedAtSignerAddress();

    const result = {
      btcLocked: btcData.btc,
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
