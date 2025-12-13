// app/api/btc-locked/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the total BTC balance for a hardcoded address.
// It calls the Subfrost API, sums the UTXO values, and returns the total in BTC.
// This is part of the task to display the "BTC Locked" value on the frontend.

import { NextRequest, NextResponse } from 'next/server';

// Revalidation is handled by the `next: { revalidate: ... }` option in the fetch call.
// This is the recommended approach for the App Router.

interface Utxo {
  txid: string;
  vout: number;
  status: {
    confirmed: boolean;
    block_height: number;
    block_hash: string;
    block_time: number;
  };
  value: number;
}

export async function GET() {
  const address = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';
  const apiUrl = 'https://mainnet.subfrost.io/v4/subfrost';

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'esplora_address::utxo',
        params: [address],
      }),
    });

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`API returned an error: ${data.error.message}`);
    }

    const utxos: Utxo[] = data.result;
    const totalSats = utxos.reduce((sum, utxo) => sum + utxo.value, 0);
    const totalBtc = totalSats / 100_000_000;

    return NextResponse.json({ btcLocked: totalBtc });
  } catch (error) {
    console.error('Error fetching BTC balance:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BTC balance.' },
      { status: 500 }
    );
  }
}