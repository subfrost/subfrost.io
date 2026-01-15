// app/api/btc-price/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the current price of Bitcoin (BTC) in US Dollars (USD) from the Subfrost API.
// It provides a simple and reliable way for the frontend to get the latest BTC price for currency conversion.
//
// 2025-10-07: Created this endpoint to support the BTC/USD toggle feature.
// 2026-01-15: Migrated from CoinGecko API to Subfrost API (https://mainnet.subfrost.io/v4/subfrost).

import { NextResponse } from 'next/server';

const SUBFROST_API_URL = 'https://mainnet.subfrost.io/v4/subfrost/get-bitcoin-price';

export async function GET() {
  try {
    const response = await fetch(SUBFROST_API_URL, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
    });
    if (!response.ok) {
      throw new Error(`Subfrost API responded with status: ${response.status}`);
    }
    const data = await response.json();
    const btcPrice = data.data.bitcoin.usd;

    return NextResponse.json({ btcPrice });
  } catch (error) {
    console.error('Error fetching BTC price:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BTC price.' },
      { status: 500 }
    );
  }
}