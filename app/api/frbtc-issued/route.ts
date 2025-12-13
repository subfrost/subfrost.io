// app/api/frbtc-issued/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the total supply of frBTC.
// 2025-12-12: Updated to use Subfrost API endpoint with metashrew_view for getstorageat.

import { NextResponse } from 'next/server';
import { AlkanesRpc } from 'alkanes/lib/rpc.js';

// The returned hex value is little-endian and needs to be byte-reversed
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
  const rpc = new AlkanesRpc({ baseUrl: 'https://mainnet.subfrost.io/v4/subfrost' });
  const path = new TextEncoder().encode('/totalsupply');

  try {
    const storageHex = await rpc.getstorageat({
      id: alkaneId,
      path: path,
    });

    if (storageHex === undefined || storageHex === '0x') {
      throw new Error('Failed to retrieve storage data.');
    }

    const littleEndianHex = reverseHex(storageHex);
    const totalSupply = BigInt(littleEndianHex);
    // Correction: unwraps were not calculated in total supply until a specific block
    const adjustedTotalSupply = totalSupply - 4443097n;
    const totalSupplyBtc = Number(adjustedTotalSupply) / 1e8;

    return NextResponse.json({ frBtcIssued: totalSupplyBtc });
  } catch (error) {
    console.error('Error fetching frBTC supply:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frBTC supply.' },
      { status: 500 }
    );
  }
}