// app/api/total-unwraps/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the total amount of frBTC unwrapped.
// Uses the OYL mainnet API's get-all-unwrap-history endpoint and sums up the amounts.

import { NextResponse } from 'next/server';

async function fetchUnwrapPage(count: number, offset: number): Promise<{ items: any[]; total: number }> {
  const response = await fetch("https://mainnet-api.oyl.gg/get-all-unwrap-history", {
    method: "POST",
    headers: {
      "accept": "application/json",
      "content-type": "application/json",
      "x-oyl-api-key": "d6aebfed1769128379aca7d215f0b689",
    },
    body: JSON.stringify({ count, offset }),
  });

  if (!response.ok) {
    throw new Error(`API call failed with status: ${response.status}`);
  }

  const data = await response.json();
  return {
    items: data.data?.items || [],
    total: data.data?.total || 0,
  };
}

export async function GET() {
  try {
    // Fetch all unwrap history by paginating
    let totalUnwraps = 0n;
    let offset = 0;
    const pageSize = 100;
    let totalItems = 0;

    // First request to get total count
    const firstPage = await fetchUnwrapPage(pageSize, 0);
    totalItems = firstPage.total;

    // Sum amounts from first page
    for (const unwrap of firstPage.items) {
      if (unwrap.amount) {
        totalUnwraps += BigInt(unwrap.amount);
      }
    }
    offset += firstPage.items.length;

    // Fetch remaining pages
    while (offset < totalItems) {
      const page = await fetchUnwrapPage(pageSize, offset);
      for (const unwrap of page.items) {
        if (unwrap.amount) {
          totalUnwraps += BigInt(unwrap.amount);
        }
      }
      offset += page.items.length;
      if (page.items.length === 0) break;
    }

    // Convert from satoshis to BTC (divide by 1e8)
    const totalUnwrapsBtc = Number(totalUnwraps) / 1e8;

    return NextResponse.json({ totalUnwraps: totalUnwrapsBtc });
  } catch (error) {
    console.error('Error fetching total unwraps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch total unwraps.' },
      { status: 500 }
    );
  }
}
