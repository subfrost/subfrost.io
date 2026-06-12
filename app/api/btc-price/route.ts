// app/api/btc-price/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the current price of Bitcoin (BTC) in US Dollars (USD).
// It provides a simple and reliable way for the frontend to get the latest BTC price for currency conversion.
//
// 2025-10-07: Created this endpoint to support the BTC/USD toggle feature.
// 2026-01-15: Migrated from CoinGecko API to Subfrost API (https://mainnet.subfrost.io/v4/subfrost).
// 2026-03-02: Migrated from Subfrost API to mempool.space API (Subfrost endpoint returns "ammdata index empty" error).
// 2026-06-12: Migrated back to the Subfrost subpricer (Uniswap V3 WBTC/USDC) at
//             {RPC}/api/v1/bitcoin-price — mempool.space was timing out from Cloud Run,
//             and subpricer is the canonical source (see ~/subkube apps/subpricer).

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';

const SUBFROST_BASE = (process.env.ALKANES_RPC_URL || 'https://mainnet.subfrost.io/v4/subfrost').replace(/\/$/, '');
const SUBPRICER_URL = `${SUBFROST_BASE}/api/v1/bitcoin-price`;
const CACHE_KEY = 'btc-price';
const CACHE_TTL = 2100; // 35 minutes — kept warm by /api/prefetch
const FETCH_TIMEOUT_MS = 8000;

const isTest = process.env.NODE_ENV === 'test';

export async function GET() {
  try {
    if (!isTest) {
      const cached = await cacheGet<{ btcPrice: number }>(CACHE_KEY);
      if (cached) {
        return NextResponse.json(cached);
      }
    }

    // subpricer returns: { source, timestamp, usd }
    const response = await fetch(SUBPRICER_URL, {
      signal: AbortSignal.timeout(FETCH_TIMEOUT_MS),
      headers: { accept: 'application/json' },
    });
    if (!response.ok) {
      throw new Error(`subpricer responded with status: ${response.status}`);
    }
    const data = await response.json();
    const usd = typeof data.usd === 'number' ? data.usd : Number(data?.bitcoin?.usd);
    if (!usd || !Number.isFinite(usd)) {
      throw new Error('subpricer returned no usd price');
    }
    const result = { btcPrice: usd };

    if (!isTest) {
      await cacheSet(CACHE_KEY, result, CACHE_TTL);
    }

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching BTC price:', error);
    // Serve a stale cached value if available rather than breaking the UI.
    if (!isTest) {
      const stale = await cacheGet<{ btcPrice: number }>(CACHE_KEY);
      if (stale) return NextResponse.json(stale);
    }
    return NextResponse.json(
      { error: 'Failed to fetch BTC price.' },
      { status: 500 }
    );
  }
}
