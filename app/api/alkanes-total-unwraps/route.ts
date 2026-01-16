/**
 * API Route: Alkanes Total Unwraps
 *
 * Calculates the total BTC unwrapped from the Alkanes signer address.
 *
 * Logic:
 * - Fetches all transactions for the Alkanes signer address
 * - For each transaction where the signer is an input:
 *   - Sum outputs going to addresses OTHER than the signer (these are unwraps)
 *   - Outputs back to the signer are "change" and not counted
 *
 * Uses Redis/memory caching for fast responses.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { alkanesClient } from '@/lib/alkanes-client';

const CACHE_KEY = 'alkanes-total-unwraps';
const CACHE_TTL = 300; // 5 minutes

interface UnwrapTransaction {
  txid: string;
  blockHeight: number;
  unwrapAmount: number; // satoshis sent to non-signer addresses
}

export async function GET() {
  try {
    // Check cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Get the Alkanes signer address
    const signerAddress = await alkanesClient.getSubfrostAddress();

    // Fetch all transactions for the signer address with pagination
    const provider = await alkanesClient.getProvider();
    let allTxs: any[] = [];
    let lastSeenTxid: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 100000; // Safety limit

    console.log(`[alkanes-total-unwraps] Fetching transactions for ${signerAddress}...`);

    while (pageCount < maxPages) {
      pageCount++;

      let page: any[];
      if (lastSeenTxid === undefined) {
        // First page
        page = await provider.esplora.getAddressTxs(signerAddress);
      } else {
        // Subsequent pages - use chain method for pagination
        page = await provider.esplora.getAddressTxsChain(signerAddress, lastSeenTxid);
      }

      const pageSize = Array.isArray(page) ? page.length : 0;

      if (pageSize === 0) {
        break;
      }

      allTxs.push(...page);

      // Update last seen txid for next iteration
      lastSeenTxid = page[pageSize - 1].txid;

      // If we got less than 25 transactions, this is the last page
      if (pageSize < 25) {
        break;
      }
    }

    console.log(`[alkanes-total-unwraps] Fetched ${allTxs.length} total transactions in ${pageCount} pages`);

    // Calculate unwraps
    const unwrapTxs: UnwrapTransaction[] = [];
    let totalUnwrapsSatoshis = 0;

    for (const tx of allTxs) {
      // Skip unconfirmed transactions
      if (!tx.status?.confirmed) continue;

      // Check if signer address is in any of the inputs
      const signerInputs = tx.vin?.filter(
        (vin: any) => vin.prevout?.scriptpubkey_address === signerAddress
      ) || [];

      // If signer is not an input, this is not an unwrap (it's a wrap/deposit)
      if (signerInputs.length === 0) continue;

      // Sum the value of outputs going to addresses OTHER than the signer
      // These are the actual unwrap amounts (not change)
      let unwrapAmount = 0;
      for (const vout of tx.vout || []) {
        const outputAddress = vout.scriptpubkey_address;
        // Skip outputs back to signer (change) and OP_RETURN outputs
        if (outputAddress && outputAddress !== signerAddress) {
          unwrapAmount += vout.value || 0;
        }
      }

      if (unwrapAmount > 0) {
        unwrapTxs.push({
          txid: tx.txid,
          blockHeight: tx.status.block_height || 0,
          unwrapAmount,
        });
        totalUnwrapsSatoshis += unwrapAmount;
      }
    }

    console.log(`[alkanes-total-unwraps] Found ${unwrapTxs.length} unwrap transactions totaling ${totalUnwrapsSatoshis} satoshis`);

    const result = {
      totalUnwrapsSatoshis,
      totalUnwrapsBtc: totalUnwrapsSatoshis / 100_000_000,
      unwrapCount: unwrapTxs.length,
      signerAddress,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    console.error('Error fetching Alkanes total unwraps:', error);
    return NextResponse.json(
      { error: 'Failed to fetch Alkanes total unwraps.', details: errorMessage },
      { status: 500 }
    );
  }
}
