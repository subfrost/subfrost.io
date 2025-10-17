// app/api/get-alkanes-by-address/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the alkanes for a specific address.
// It calls the OYL mainnet API's `get-alkanes-by-address` endpoint.
// V5: Adding a log to see if the route is being hit.
// The API expects a POST to /get-alkanes-by-address with only the address in the body.
// ref: Manual curl test produced a successful response with this structure.

import { NextResponse } from 'next/server';

export async function POST(request: Request) {
  console.log("get-alkanes-by-address route hit");
  try {
    const body = await request.json();
    const { address } = body;

    if (!address) {
      return NextResponse.json({ error: 'Address is required.' }, { status: 400 });
    }

    const response = await fetch("https://mainnet-api.oyl.gg/get-alkanes-by-address", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-oyl-api-key": "d6aebfed1769128379aca7d215f0b689",
      },
      body: JSON.stringify({
        address,
      }),
    });

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    return NextResponse.json(data);
  } catch (error) {
    console.error('Error fetching alkanes by address:', error);
    return NextResponse.json(
      { error: 'Failed to fetch alkanes by address.' },
      { status: 500 }
    );
  }
}