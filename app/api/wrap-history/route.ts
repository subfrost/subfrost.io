// app/api/wrap-history/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the history of frBTC wrap transactions.
// It calls the OYL mainnet API's `get-all-wrap-history` endpoint.
// It supports pagination through `count` and `offset` query parameters.

import { NextResponse } from 'next/server';

export async function GET(request: Request) {
  const { searchParams } = new URL(request.url);
  const count = searchParams.get('count') || '25';
  const offset = searchParams.get('offset') || '0';

  try {
    const response = await fetch("https://mainnet-api.oyl.gg/get-all-wrap-history", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-oyl-api-key": "d6aebfed1769128379aca7d215f0b689",
      },
      body: JSON.stringify({
        count: parseInt(count, 10),
        offset: parseInt(offset, 10),
      }),
    });

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching wrap history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch wrap history.' },
      { status: 500 }
    );
  }
}