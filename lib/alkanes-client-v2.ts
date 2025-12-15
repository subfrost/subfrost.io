/**
 * Alkanes Client V2 - Efficient block-level trace aggregation
 *
 * This implements a more efficient approach for aggregating wrap/unwrap data:
 * 1. Fetch all txs for subfrost address (esplora_addresstxs)
 * 2. Extract unique block heights with potential wraps/unwraps
 * 3. Use traceblock to fetch complete block traces
 * 4. Filter for frBTC (32:0) transfers
 * 5. Parse wrap/unwrap amounts from traces
 */

import { AlkanesProvider } from '@alkanes/ts-sdk';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);

// ============================================================================
// Constants
// ============================================================================

const FRBTC_ALKANE_ID = { block: 32n, tx: 0n };
const SUBFROST_ADDRESS = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';

// ============================================================================
// Types
// ============================================================================

interface WrapUnwrapResult {
  totalWrapped: bigint;
  totalUnwrapped: bigint;
  wrapCount: number;
  unwrapCount: number;
  wraps: Array<{
    txid: string;
    amount: bigint;
    blockHeight: number;
    senderAddress: string;
  }>;
  unwraps: Array<{
    txid: string;
    amount: bigint;
    blockHeight: number;
    recipientAddress: string;
  }>;
  lastBlockHeight: number;
}

// ============================================================================
// Main Function
// ============================================================================

/**
 * Get wrap/unwrap totals for a specific block height range
 *
 * @param provider - AlkanesProvider instance
 * @param fromBlockHeight - Starting block height (inclusive), defaults to 0
 * @param toBlockHeight - Ending block height (inclusive), defaults to latest
 */
export async function getWrapUnwrapFromBlockRange(
  provider: AlkanesProvider,
  fromBlockHeight: number = 0,
  toBlockHeight?: number
): Promise<WrapUnwrapResult> {
  const rangeLabel = toBlockHeight
    ? `[${fromBlockHeight} - ${toBlockHeight}]`
    : `[${fromBlockHeight} - latest]`;

  console.log(`[BlockRange] Processing block range: ${rangeLabel}`);

  // Step 1: Get all transactions with traces in one call
  console.log('[BlockRange] Fetching transactions with traces...');
  const txsWithTraces = await provider.esplora.getAddressTxsWithTraces(
    SUBFROST_ADDRESS,
    true, // exclude coinbase
    fromBlockHeight
  );
  console.log(`[BlockRange] Found ${txsWithTraces.length} transactions with traces`);

  // Step 2: Filter transactions by block height range and process traces
  const wraps: Array<{ txid: string; amount: bigint; blockHeight: number; senderAddress: string }> = [];
  const unwraps: Array<{ txid: string; amount: bigint; blockHeight: number; recipientAddress: string }> = [];

  let lastBlockHeight = 0;
  let processedTxs = 0;

  for (const tx of txsWithTraces) {
    const blockHeight = tx.status?.block_height || 0;

    // Skip transactions outside the specified range
    if (blockHeight < fromBlockHeight) continue;
    if (toBlockHeight && blockHeight > toBlockHeight) continue;

    if (!tx.alkanes_traces) continue;

    processedTxs++;
    if (blockHeight > lastBlockHeight) {
      lastBlockHeight = blockHeight;
    }

    // Process each trace entry in the transaction
    for (const traceEntry of tx.alkanes_traces) {
      const trace = traceEntry.trace?.trace;
      if (!trace?.events) continue;

      for (const eventWrapper of trace.events) {
        const event = eventWrapper.event;
        if (!event) continue;

        // Check for wraps (ReceiveIntent with incoming frBTC)
        if (event.ReceiveIntent?.incoming_alkanes) {
          for (const transfer of event.ReceiveIntent.incoming_alkanes) {
            if (isFrbtc(transfer.id)) {
              const amount = parseValue(transfer);
              if (amount > 0n) {
                const senderAddress = extractSenderAddress(tx);
                wraps.push({
                  txid: tx.txid,
                  amount,
                  blockHeight,
                  senderAddress,
                });
              }
            }
          }
        }

        // Check for unwraps (ValueTransfer with frBTC)
        if (event.ValueTransfer?.transfers) {
          for (const transfer of event.ValueTransfer.transfers) {
            if (isFrbtc(transfer.id)) {
              const amount = parseValue(transfer);
              if (amount > 0n) {
                const recipientAddress = extractRecipientAddress(tx, SUBFROST_ADDRESS);
                unwraps.push({
                  txid: tx.txid,
                  amount,
                  blockHeight,
                  recipientAddress,
                });
              }
            }
          }
        }
      }
    }
  }

  console.log(`[BlockRange] Processed ${processedTxs} transactions in range ${rangeLabel}`);
  console.log(`[BlockRange] Found ${wraps.length} wraps, ${unwraps.length} unwraps`);

  // Step 3: Calculate totals
  const totalWrapped = wraps.reduce((sum, w) => sum + w.amount, 0n);
  const totalUnwrapped = unwraps.reduce((sum, u) => sum + u.amount, 0n);

  return {
    totalWrapped,
    totalUnwrapped,
    wrapCount: wraps.length,
    unwrapCount: unwraps.length,
    wraps,
    unwraps,
    lastBlockHeight,
  };
}

/**
 * Convenience function: Get wrap/unwrap totals from a starting block height to latest
 */
export async function getWrapUnwrapFromBlockTraces(
  provider: AlkanesProvider,
  fromBlockHeight: number = 0
): Promise<WrapUnwrapResult> {
  return getWrapUnwrapFromBlockRange(provider, fromBlockHeight);
}

// ============================================================================
// Helper Functions
// ============================================================================

/**
 * Check if an alkane ID is frBTC (32:0)
 */
function isFrbtc(alkaneId: any): boolean {
  if (!alkaneId) return false;

  // Handle both bigint and object formats
  const blockNum = typeof alkaneId.block === 'object' ? alkaneId.block.lo : Number(alkaneId.block);
  const txNum = typeof alkaneId.tx === 'object' ? alkaneId.tx.lo : Number(alkaneId.tx);

  return blockNum === 32 && txNum === 0;
}

/**
 * Parse uint128 value from transfer
 */
function parseValue(transfer: any): bigint {
  if (!transfer?.value) return 0n;

  const value = transfer.value;

  // Handle uint128 format: (hi << 64) | lo
  if (typeof value === 'object' && 'lo' in value) {
    const lo = BigInt(value.lo || 0);
    const hi = BigInt(value.hi || 0);
    return (hi << 64n) | lo;
  }

  return BigInt(value);
}

/**
 * Extract sender address from transaction inputs (for wraps)
 */
function extractSenderAddress(tx: any): string {
  try {
    if (tx.vin && Array.isArray(tx.vin)) {
      for (const input of tx.vin) {
        if (input.prevout?.scriptpubkey_address) {
          return input.prevout.scriptpubkey_address;
        }
      }
    }
  } catch (error) {
    console.error('[extractSenderAddress] Error:', error);
  }
  return '';
}

/**
 * Extract recipient address from transaction outputs (for unwraps)
 */
function extractRecipientAddress(tx: any, subfrostAddress: string): string {
  try {
    if (tx.vout && Array.isArray(tx.vout)) {
      for (const output of tx.vout) {
        const address = output.scriptpubkey_address;
        if (address && address !== subfrostAddress && output.scriptpubkey_type !== 'op_return') {
          return address;
        }
      }
    }
  } catch (error) {
    console.error('[extractRecipientAddress] Error:', error);
  }
  return '';
}

