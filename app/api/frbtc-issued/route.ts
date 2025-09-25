// app/api/frbtc-issued/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the total supply of frBTC.
// It uses the `getstorageat` method from the AlkanesRpc class to directly query the state.
// This is a more direct and reliable method than the previous implementation which used `alkanes_simulate`.
//
// Source of Truth: The successful execution of the `get_frbtc_supply.mjs` script, which validated this approach.
//
// 2025-09-25: Changed the return type to a number to fix a client-side error.
// 2025-09-25: Re-added division by 1e8 per user feedback.

import { NextResponse } from 'next/server';
import { AlkanesRpc } from 'alkanes/lib/rpc.js';
import { hexToBigInt } from 'viem';

// The returned hex value is little-endian and needs to be byte-reversed
// for correct interpretation.
function reverseHex(hex: string): string {
    if (hex.startsWith('0x')) {
        hex = hex.slice(2);
    }
    if (hex.length % 2) { hex = '0' + hex; }
    const buf = Buffer.from(hex, 'hex');
    return '0x' + buf.reverse().toString('hex');
}

export async function GET() {
  const alkaneId = { block: 32n, tx: 0n };
  const rpc = new AlkanesRpc({ baseUrl: 'https://mainnet.sandshrew.io/v2/lasereyes' });
  const path = new TextEncoder().encode('/totalsupply');

  try {
    const storageHex = await rpc.getstorageat({
      id: alkaneId,
      path: path,
    });

    const littleEndianHex = reverseHex(storageHex);
    const totalSupply = BigInt(littleEndianHex);
    const totalSupplyBtc = Number(totalSupply) / 1e8;

    return NextResponse.json({ frBtcIssued: totalSupplyBtc });
  } catch (error) {
    console.error('Error fetching frBTC supply:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frBTC supply.' },
      { status: 500 }
    );
  }
}