/**
 * API Route: Alkanes Circulating Supply
 *
 * Returns the circulating frBTC supply on Alkanes by summing all holder balances
 * EXCEPT for the 32:0 holder (which represents burned/unwrapped frBTC).
 *
 * Uses the Alkanode essentials.get_holders RPC API with pagination.
 * Uses Redis/memory caching for fast responses.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';

const CACHE_KEY = 'alkanes-circulating';
const CACHE_TTL = 300; // 5 minutes
const ALKANODE_RPC_URL = 'https://api.alkanode.com/rpc';

interface HolderItem {
  address?: string;
  alkane?: string;
  amount: string;
  type: 'address' | 'alkane';
}

interface GetHoldersResponse {
  ok?: boolean;
  error?: string;
  alkane: string;
  items: HolderItem[];
  total?: number;
  page?: number;
  has_more: boolean;
}

async function rpcCall<T>(method: string, params: object): Promise<T> {
  const response = await fetch(ALKANODE_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: 1,
      method,
      params,
    }),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  }

  return data.result as T;
}

export async function GET() {
  try {
    // Check cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    let circulatingSatoshis = 0;
    let burnedSatoshis = 0;
    let holderCount = 0;
    let page = 1;
    let hasMore = true;
    const limit = 1000;

    // Paginate through all holders using Alkanode RPC
    while (hasMore) {
      const holders = await rpcCall<GetHoldersResponse>('essentials.get_holders', {
        alkane: '32:0',
        limit,
        page,
      });

      if (holders.error) {
        throw new Error(`API error: ${holders.error}`);
      }

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
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to fetch Alkanes circulating supply.', details: errorMessage },
      { status: 500 }
    );
  }
}
