// app/api/get-address-unwrap-history/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the history of frBTC unwrap transactions for a specific address.
// It calls the OYL mainnet API's `get-address-unwrap-history` endpoint.
// It supports pagination through `count` and `offset` query parameters, and requires an `address`.

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  const { searchParams } = new URL(request.url);
  const count = searchParams.get('count') || '25';
  const offset = searchParams.get('offset') || '0';

  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json({ error: 'Address is required.' }, { status: 400 });
    }

    const response = await fetch("https://mainnet-api.oyl.gg/get-address-unwrap-history", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-oyl-api-key": "d6aebfed1769128379aca7d215f0b689",
      },
      body: JSON.stringify({
        address,
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
    console.error('Error fetching address unwrap history:', error);
    return NextResponse.json(
      { error: 'Failed to fetch address unwrap history.' },
      { status: 500 }
    );
  }
}