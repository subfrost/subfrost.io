/**
 * API Route: Unwrap History
 *
 * Returns paginated unwrap transaction history from the database.
 * Data is populated by the sync service which fetches from alkanes traces.
 * Supports pagination through `count` and `offset` query parameters.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncWrapUnwrapTransactions, getUnwrapHistory } from '@/lib/sync-service';
import { getUnwrapHistoryData } from '@/lib/blockchain-data';

const CACHE_TTL = 120; // 2 minutes

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const count = parseInt(searchParams.get('count') || '25', 10);
  const offset = parseInt(searchParams.get('offset') || '0', 10);

  // Cache key includes pagination params
  const cacheKey = `unwrap-history:${count}:${offset}`;

  try {
    // Check Redis cache first
    const cached = await cacheGet(cacheKey);
    if (cached) {
      return NextResponse.json(cached);
    }

    let result;
    try {
      // Ensure data is synced (fast if no new blocks)
      await syncWrapUnwrapTransactions();

      // Get unwrap history from database
      const { items, total } = await getUnwrapHistory(count, offset);

      // Format response to match expected API format
      result = {
        items: items.map(item => ({
          txid: item.txid,
          amount: item.amount,
          blockHeight: item.blockHeight,
          timestamp: item.timestamp.toISOString(),
          recipientAddress: item.recipientAddress,
        })),
        total,
        count,
        offset,
        timestamp: Date.now(),
      };
    } catch (dbError) {
      // Fallback: fetch directly from SDK if database is unavailable
      console.log('Database unavailable, fetching directly from SDK');
      const historyData = await getUnwrapHistoryData(count, offset);
      result = {
        items: historyData.items,
        total: historyData.total,
        count,
        offset,
        timestamp: Date.now(),
      };
    }

    // Cache the result
    await cacheSet(cacheKey, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching unwrap history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch unwrap history.' },
      { status: 500 }
    );
  }
}