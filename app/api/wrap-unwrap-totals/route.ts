/**
 * API Route: Wrap/Unwrap Totals
 *
 * Returns total wrapped and unwrapped frBTC amounts from alkanes traces.
 * Uses incremental sync service to avoid re-fetching historical data.
 *
 * Flow:
 * 1. Check Redis cache for recent data
 * 2. If cache miss/stale, trigger incremental sync (only fetches new blocks)
 * 3. Read aggregated totals from PostgreSQL
 * 4. Cache the result in Redis
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncWrapUnwrapTransactions, getAggregatedTotals } from '@/lib/sync-service';
import { alkanesClient } from '@/lib/alkanes-client';

const CACHE_KEY = 'wrap-unwrap-totals-v3';
const CACHE_TTL = 60; // 60 seconds - short since sync is fast after initial load

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get current block height to check if we need to sync
    const currentHeight = await alkanesClient.getCurrentHeight();

    // Run incremental sync (fast if no new blocks)
    const syncResult = await syncWrapUnwrapTransactions();
    console.log(`[API wrap-unwrap-totals] Sync complete: ${syncResult.newWraps} wraps, ${syncResult.newUnwraps} unwraps`);

    // Get aggregated totals from database
    const totals = await getAggregatedTotals();

    const result = {
      totalWrappedFrbtc: totals.totalWrapped.toString(),
      totalUnwrappedFrbtc: totals.totalUnwrapped.toString(),
      totalWrappedBtc: Number(totals.totalWrapped) / 1e8,
      totalUnwrappedBtc: Number(totals.totalUnwrapped) / 1e8,
      wrapCount: totals.wrapCount,
      unwrapCount: totals.unwrapCount,
      lastBlockHeight: totals.lastBlockHeight,
      currentBlockHeight: currentHeight,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching wrap/unwrap totals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wrap/unwrap totals.' },
      { status: 500 }
    );
  }
}
