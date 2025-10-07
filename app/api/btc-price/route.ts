// app/api/btc-price/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the current price of Bitcoin (BTC) in US Dollars (USD) from the CoinGecko API.
// It provides a simple and reliable way for the frontend to get the latest BTC price for currency conversion.
//
// 2025-10-07: Created this endpoint to support the BTC/USD toggle feature.

import { NextResponse } from 'next/server';

export async function GET() {
  const coingeckoUrl = 'https://api.coingecko.com/api/v3/simple/price?ids=bitcoin&vs_currencies=usd';

  try {
    const response = await fetch(coingeckoUrl);
    if (!response.ok) {
      throw new Error(`CoinGecko API responded with status: ${response.status}`);
    }
    const data = await response.json();
    const btcPrice = data.bitcoin.usd;

    return NextResponse.json({ btcPrice });
  } catch (error) {
    console.error('Error fetching BTC price:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BTC price.' },
      { status: 500 }
    );
  }
}