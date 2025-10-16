// app/api/total-unwraps/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the total amount of frBTC unwrapped.
// It calls the OYL staging API's `get_total_unwrap_amount` endpoint.
// The URL was updated from mainnet to staging to align with the development environment.

import { NextResponse } from 'next/server';

export async function GET() {
  try {
    const response = await fetch("https://mainnet-api.oyl.gg/get-total-unwrap-amount", {
      method: "POST",
      headers: {
        "accept": "application/json",
        "content-type": "application/json",
        "x-oyl-api-key": "d6aebfed1769128379aca7d215f0b689",
      },
      body: JSON.stringify({}),
    });

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }

    const data = await response.json();
    
    
    // Assuming the API returns a JSON object with a key containing the total unwrap amount.
    // Based on the task, we'll look for a property like 'totalUnwrapAmount'. This is a guess.
    const totalUnwraps = data.data.totalAmount; 

    return NextResponse.json({ totalUnwraps });
  } catch (error) {
    console.error('Error fetching total unwraps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch total unwraps.' },
      { status: 500 }
    );
  }
}