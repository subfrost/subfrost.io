/**
 * API Route: Total Unwraps
 *
 * Returns the total amount of frBTC unwrapped.
 * Uses the sync service for efficient incremental fetching.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncWrapUnwrapTransactions, getAggregatedTotals } from '@/lib/sync-service';

const CACHE_KEY = 'total-unwraps';
const CACHE_TTL = 60; // 60 seconds

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Run incremental sync (fast if no new blocks)
    await syncWrapUnwrapTransactions();

    // Get aggregated totals from database
    const totals = await getAggregatedTotals();

    // Convert from satoshis to BTC (divide by 1e8)
    const totalUnwrapsBtc = Number(totals.totalUnwrapped) / 1e8;

    const result = {
      totalUnwraps: totalUnwrapsBtc,
      totalUnwrapsSatoshis: totals.totalUnwrapped.toString(),
      unwrapCount: totals.unwrapCount,
      lastBlockHeight: totals.lastBlockHeight,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching total unwraps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch total unwraps.' },
      { status: 500 }
    );
  }
}
