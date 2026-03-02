// app/api/btc-price/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the current price of Bitcoin (BTC) in US Dollars (USD).
// It provides a simple and reliable way for the frontend to get the latest BTC price for currency conversion.
//
// 2025-10-07: Created this endpoint to support the BTC/USD toggle feature.
// 2026-01-15: Migrated from CoinGecko API to Subfrost API (https://mainnet.subfrost.io/v4/subfrost).
// 2026-03-02: Migrated from Subfrost API to mempool.space API (Subfrost endpoint returns "ammdata index empty" error).

import { NextResponse } from 'next/server';

const MEMPOOL_PRICES_URL = 'https://mempool.space/api/v1/prices';

export async function GET() {
  try {
    const response = await fetch(MEMPOOL_PRICES_URL);
    if (!response.ok) {
      throw new Error(`mempool.space API responded with status: ${response.status}`);
    }
    const data = await response.json();
    const btcPrice = data.USD;

    return NextResponse.json({ btcPrice });
  } catch (error) {
    console.error('Error fetching BTC price:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BTC price.' },
      { status: 500 }
    );
  }
}