/**
 * API Route: Alkanes Circulating Supply
 *
 * Returns the circulating frBTC supply on Alkanes by summing all holder balances
 * EXCEPT for the 32:0 holder (which represents burned/unwrapped frBTC).
 *
 * Uses the espo.getHolders API via @alkanes/ts-sdk with pagination.
 * Uses Redis/memory caching for fast responses.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { alkanesClient } from '@/lib/alkanes-client';

const CACHE_KEY = 'alkanes-circulating';
const CACHE_TTL = 300; // 5 minutes

export async function GET() {
  try {
    // Check cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const provider = await alkanesClient.getProvider();

    let circulatingSatoshis = 0;
    let burnedSatoshis = 0;
    let holderCount = 0;
    let page = 0;
    let hasMore = true;
    const limit = 100000;

    // Paginate through all holders
    while (hasMore) {
      const holders = await provider.espo.getHolders('32:0', page, limit);

      for (const holder of holders.items || []) {
        const amount = parseInt(holder.amount, 10);

        // Exclude the 32:0 holder (burned/unwrapped frBTC)
        if (holder.alkane === '32:0' && holder.type === 'alkane') {
          burnedSatoshis = amount;
        } else {
          circulatingSatoshis += amount;
          holderCount++;
        }
      }

      hasMore = holders.has_more === true;
      page++;

      // Safety limit to prevent infinite loops
      if (page > 10000) break;
    }

    const result = {
      circulatingSatoshis,
      circulatingBtc: circulatingSatoshis / 100_000_000,
      burnedSatoshis,
      burnedBtc: burnedSatoshis / 100_000_000,
      holderCount,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching Alkanes circulating supply:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Alkanes circulating supply.' },
      { status: 500 }
    );
  }
}
