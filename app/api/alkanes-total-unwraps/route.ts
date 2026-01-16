/**
 * API Route: Alkanes Total Unwraps
 *
 * Calculates the total BTC unwrapped from the Alkanes signer address.
 * Uses direct RPC calls for reliability in serverless environments.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { calculateTotalUnwraps, getAlkanesSubfrostAddress } from '@/lib/rpc-client';

const CACHE_KEY = 'alkanes-total-unwraps';
const CACHE_TTL = 300; // 5 minutes

export async function GET() {
  try {
    // Check cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get the Alkanes signer address
    const signerAddress = getAlkanesSubfrostAddress();

    // Calculate total unwraps using direct RPC
    const unwrapData = await calculateTotalUnwraps(signerAddress);

    const result = {
      totalUnwrapsSatoshis: unwrapData.totalUnwrapsSatoshis,
      totalUnwrapsBtc: unwrapData.totalUnwrapsBtc,
      unwrapCount: unwrapData.unwrapCount,
      signerAddress,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching Alkanes total unwraps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Alkanes total unwraps.', details: errorMessage },
      { status: 500 }
    );
  }
}
