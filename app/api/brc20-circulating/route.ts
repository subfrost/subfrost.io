/**
 * API Route: BRC2.0 Circulating Supply
 *
 * Returns the circulating frBTC supply on BRC2.0 by calling totalSupply()
 * on the fr-BTC contract address.
 *
 * Uses direct RPC calls for reliability in serverless environments.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { getBrc20TotalSupply } from '@/lib/rpc-client';

const CACHE_KEY = 'brc20-circulating';
const CACHE_TTL = 300; // 5 minutes

// fr-BTC contract address on BRC2.0
const FRBTC_CONTRACT_ADDRESS = '0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337';

export async function GET() {
  try {
    // Check cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Fetch total supply using direct RPC
    const supplyData = await getBrc20TotalSupply();

    const response = {
      circulatingSatoshis: supplyData.totalSupply.toString(),
      circulatingBtc: supplyData.totalSupplyBtc,
      contractAddress: FRBTC_CONTRACT_ADDRESS,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, response, CACHE_TTL);

    return NextResponse.json(response);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching BRC2.0 circulating supply:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BRC2.0 circulating supply.', details: errorMessage },
      { status: 500 }
    );
  }
}
