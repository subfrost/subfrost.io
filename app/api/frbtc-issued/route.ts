// app/api/frbtc-issued/route.ts

// Chadson's Journal:
// Purpose: This API route fetches the total supply of frBTC from the Sandshrew API.
// It uses the 'alkanes_simulate' method to call the 'get_total_supply' view function (opcode 101)
// on the frBTC Alkane contract.
//
// Source of Truth: The user-provided example code, which demonstrates the correct usage
// of `alkanes_simulate` with opcode 101. My previous implementation using `alkanes_runtime` was incorrect.

import { NextResponse } from 'next/server';

// This function converts a Buffer to a BigInt.
// Based on the `fromBuffer` function in the user's example.
function fromBuffer(buffer: Buffer): bigint {
  if (buffer.length === 0) {
    return BigInt(0);
  }
  const hex = buffer.toString('hex');
  return BigInt(`0x${hex}`);
}

export async function GET() {
  const apiUrl = 'https://mainnet.sandshrew.io/v2/lasereyes';
  const frBtcAlkaneId = {
    block: "32",
    tx: "0"
  };

  try {
    const response = await fetch(apiUrl, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        jsonrpc: '2.0',
        id: 1,
        method: 'alkanes_simulate',
        params: [{
          alkanes: [],
          transaction: "0x",
          block: "0x",
          height: 0,
          txindex: 0,
          target: {
            block: frBtcAlkaneId.block,
            tx: frBtcAlkaneId.tx,
          },
          inputs: ["101"], // Opcode for "get_total_supply"
          pointer: 0,
          refundPointer: 0,
          vout: 0,
        }],
      }),
    });

    if (!response.ok) {
      throw new Error(`API call failed with status: ${response.status}`);
    }

    const data = await response.json();

    if (data.error) {
      throw new Error(`API returned an error: ${data.error.message}`);
    }

    let totalSupply = BigInt(0);
    const executionResult = data.result.execution;

    if (executionResult && executionResult.data && executionResult.data.length > 2) {
      const dataBuffer = Buffer.from(executionResult.data.slice(2), 'hex');
      totalSupply = fromBuffer(dataBuffer);
    }

    // The balance is returned in the smallest unit, so we divide by 10^8 to get the full coin value.
    const totalSupplyBtc = Number(totalSupply) / 100_000_000;

    return NextResponse.json({ frBtcIssued: totalSupplyBtc });
  } catch (error) {
    console.error('Error fetching frBTC supply:', error);
    return NextResponse.json(
      { error: 'Failed to fetch frBTC supply.' },
      { status: 500 }
    );
  }
}