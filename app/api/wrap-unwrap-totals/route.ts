// app/api/wrap-unwrap-totals/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the total wrapped and unwrapped frBTC amounts.
// It uses the OYL mainnet API endpoints:
// - get-all-wrap-history: Fetches all wrap transactions (paginated, must sum amounts)
// - get-total-unwrap-amount: Fetches the total unwrap amount directly
//
// Since there's no get-total-wrap-amount endpoint, we fetch all wrap history and sum the amounts.

import { NextResponse } from 'next/server';

const OYL_API_KEY = "d6aebfed1769128379aca7d215f0b689";
const OYL_BASE_URL = "https://mainnet-api.oyl.gg";

async function fetchTotalUnwrapAmount(): Promise<bigint> {
  const response = await fetch(`${OYL_BASE_URL}/get-total-unwrap-amount`, {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "x-oyl-api-key": OYL_API_KEY,
    },
    body: JSON.stringify({}),
  });

  if (!response.ok) {
    throw new Error(`Failed to fetch total unwrap amount: ${response.status}`);
  }

  const data = await response.json();
  return BigInt(data.data.totalAmount);
}

async function fetchAllWrapsAndSum(): Promise<{ total: bigint; count: number }> {
  let totalAmount = 0n;
  let offset = 0;
  const pageSize = 100;
  let totalCount = 0;

  // Fetch all wraps with pagination
  while (true) {
    const response = await fetch(`${OYL_BASE_URL}/get-all-wrap-history`, {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-oyl-api-key": OYL_API_KEY,
      },
      body: JSON.stringify({
        count: pageSize,
        offset: offset,
      }),
    });

    if (!response.ok) {
      throw new Error(`Failed to fetch wrap history: ${response.status}`);
    }

    const data = await response.json();
    const items = data.data?.items || [];
    totalCount = data.data?.total || 0;

    // Sum amounts from this page
    for (const item of items) {
      totalAmount += BigInt(item.amount);
    }

    // Check if we've fetched all items
    if (items.length < pageSize || offset + items.length >= totalCount) {
      break;
    }

    offset += pageSize;
  }

  return { total: totalAmount, count: totalCount };
}

export async function GET() {
  try {
    // Fetch total unwrap amount and all wraps in parallel
    const [totalUnwrapped, wrapData] = await Promise.all([
      fetchTotalUnwrapAmount(),
      fetchAllWrapsAndSum(),
    ]);

    const totalWrapped = wrapData.total;
    const wrapCount = wrapData.count;

    // Convert from satoshis to BTC
    const totalWrappedBtc = Number(totalWrapped) / 1e8;
    const totalUnwrappedBtc = Number(totalUnwrapped) / 1e8;

    return NextResponse.json({
      totalWrappedFrbtc: totalWrapped.toString(),
      totalUnwrappedFrbtc: totalUnwrapped.toString(),
      totalWrappedBtc,
      totalUnwrappedBtc,
      wrapCount,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('Error fetching wrap/unwrap totals:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wrap/unwrap totals.' },
      { status: 500 }
    );
  }
}
