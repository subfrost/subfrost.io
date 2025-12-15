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
 * Get wrap/unwrap totals for a specific block height range using efficient block-level tracing
 *
 * This approach:
 * 1. Fetches all transactions for the subfrost address
 * 2. Extracts unique block heights
 * 3. Calls traceblock for each unique block (much more efficient than per-tx traces)
 * 4. Parses traces looking for calls to alkane 32:0 with opcodes 77 (wrap) or 78 (unwrap)
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

  // Step 1: Get all transactions for subfrost address (no traces yet)
  console.log('[BlockRange] Fetching transactions...');
  const txs = await provider.esplora.getAddressTxs(SUBFROST_ADDRESS);
  console.log(`[BlockRange] Found ${txs.length} total transactions`);

  // Step 2: Extract unique block heights within the specified range
  const blockHeights = new Set<number>();
  const txsByBlock = new Map<number, any[]>();

  for (const tx of txs) {
    const height = tx.status?.block_height;
    if (!height) continue;
    if (height < fromBlockHeight) continue;
    if (toBlockHeight && height > toBlockHeight) continue;

    blockHeights.add(height);

    if (!txsByBlock.has(height)) {
      txsByBlock.set(height, []);
    }
    txsByBlock.get(height)!.push(tx);
  }

  const sortedHeights = Array.from(blockHeights).sort((a, b) => a - b);
  console.log(`[BlockRange] Found ${sortedHeights.length} unique blocks to process`);

  // Step 3: Process each block by calling traceblock
  const wraps: Array<{ txid: string; amount: bigint; blockHeight: number; senderAddress: string }> = [];
  const unwraps: Array<{ txid: string; amount: bigint; blockHeight: number; recipientAddress: string }> = [];

  let processedBlocks = 0;
  for (const blockHeight of sortedHeights) {
    processedBlocks++;
    if (processedBlocks % 10 === 0) {
      console.log(`[BlockRange] Processing block ${processedBlocks}/${sortedHeights.length} (height ${blockHeight})...`);
    }

    try {
      // Get all traces for this block in one call using traceBlock binding
      const blockTraces = await provider.alkanes.traceBlock(blockHeight);

      // Debug: Log trace structure for first block
      if (processedBlocks === 1) {
        console.log(`[BlockRange] Block ${blockHeight} trace structure (type):`, typeof blockTraces);
        console.log(`[BlockRange] Block ${blockHeight} trace structure (full):`, JSON.stringify(blockTraces, null, 2).substring(0, 2000));
        console.log(`[BlockRange] Block ${blockHeight} trace keys:`, Object.keys(blockTraces || {}));
        if (Array.isArray(blockTraces)) {
          console.log(`[BlockRange] Block ${blockHeight} is array with length:`, blockTraces.length);
          if (blockTraces.length > 0) {
            console.log(`[BlockRange] First element:`, JSON.stringify(blockTraces[0], null, 2).substring(0, 1000));
          }
        }
      }

      // Parse the block traces for frBTC operations
      const blockTxs = txsByBlock.get(blockHeight) || [];
      const { wrapsInBlock, unwrapsInBlock } = parseBlockTracesForFrbtc(
        blockTraces,
        blockTxs,
        blockHeight,
        SUBFROST_ADDRESS
      );

      if (wrapsInBlock.length > 0 || unwrapsInBlock.length > 0) {
        console.log(`[BlockRange] Block ${blockHeight}: found ${wrapsInBlock.length} wraps, ${unwrapsInBlock.length} unwraps`);
      }

      wraps.push(...wrapsInBlock);
      unwraps.push(...unwrapsInBlock);
    } catch (error) {
      console.error(`[BlockRange] Error processing block ${blockHeight}:`, error);
    }
  }

  console.log(`[BlockRange] Processed ${processedBlocks} blocks in range ${rangeLabel}`);
  console.log(`[BlockRange] Found ${wraps.length} wraps, ${unwraps.length} unwraps`);

  // Step 4: Calculate totals
  const totalWrapped = wraps.reduce((sum, w) => sum + w.amount, 0n);
  const totalUnwrapped = unwraps.reduce((sum, u) => sum + u.amount, 0n);

  const lastBlockHeight = sortedHeights.length > 0 ? sortedHeights[sortedHeights.length - 1] : 0;

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

/**
 * Parse block traces to identify frBTC wrap/unwrap operations
 *
 * This function processes the complete trace data for a block and identifies:
 * - Wraps (opcode 77): ReceiveIntent events showing incoming frBTC (32:0) to subfrost address
 * - Unwraps (opcode 78): ValueTransfer events showing outgoing frBTC from subfrost address
 *
 * @param blockTraces - Raw trace data from traceblock call
 * @param blockTxs - Array of transactions in this block (for matching txids and extracting addresses)
 * @param blockHeight - Block height (for metadata)
 * @param subfrostAddress - Subfrost address to identify wraps/unwraps
 * @returns Arrays of wraps and unwraps found in this block
 */
/**
 * Convert byte array to hex string (for txid)
 * Bitcoin txids are stored in reverse byte order
 */
function bytesToHex(bytes: number[]): string {
  return bytes.slice().reverse().map(b => b.toString(16).padStart(2, '0')).join('');
}

function parseBlockTracesForFrbtc(
  blockTraces: any,
  blockTxs: any[],
  blockHeight: number,
  subfrostAddress: string
): {
  wrapsInBlock: Array<{ txid: string; amount: bigint; blockHeight: number; senderAddress: string }>;
  unwrapsInBlock: Array<{ txid: string; amount: bigint; blockHeight: number; recipientAddress: string }>;
} {
  const wrapsInBlock: Array<{ txid: string; amount: bigint; blockHeight: number; senderAddress: string }> = [];
  const unwrapsInBlock: Array<{ txid: string; amount: bigint; blockHeight: number; recipientAddress: string }> = [];

  try {
    // Create a map of txid to transaction for quick lookups
    const txMap = new Map<string, any>();
    for (const tx of blockTxs) {
      txMap.set(tx.txid, tx);
    }

    // The blockTraces structure is:
    // { events: [ { traces: { events: [ ... ] }, outpoint: { txid, vout }, txindex } ] }
    if (!blockTraces?.events || !Array.isArray(blockTraces.events)) {
      console.log(`[parseBlockTracesForFrbtc] No events in block traces`);
      return { wrapsInBlock, unwrapsInBlock };
    }

    console.log(`[parseBlockTracesForFrbtc] Total trace events in block: ${blockTraces.events.length}`);
    console.log(`[parseBlockTracesForFrbtc] Transactions in our list: ${txMap.size}`);

    // Iterate through each transaction trace in the block
    let processedCount = 0;

    for (const txTrace of blockTraces.events) {
      // Get the txid from outpoint (it's a byte array)
      const txidBytes = txTrace.outpoint?.txid;
      if (!txidBytes || !Array.isArray(txidBytes)) {
        continue;
      }

      const txid = bytesToHex(txidBytes);

      // Get the trace events
      const traceEvents = txTrace.traces?.events;
      if (!traceEvents || !Array.isArray(traceEvents)) {
        continue;
      }

      processedCount++;

      // Parse trace events to find frBTC transfers
      // Look for:
      // - ReceiveIntent with incoming_alkanes containing frBTC (32:0) -> WRAP
      // - ValueTransfer with transfers containing frBTC (32:0) -> UNWRAP
      for (const eventWrapper of traceEvents) {
        const event = eventWrapper.event;
        if (!event) {
          continue;
        }

        // Check ReceiveIntent for incoming alkanes (wrap - BTC in, frBTC minted)
        if (event.ReceiveIntent?.incoming_alkanes) {
          const incoming = event.ReceiveIntent.incoming_alkanes;
          for (const transfer of incoming) {
            if (isFrbtc(transfer.id)) {
              const amount = parseValue(transfer);
              if (amount > 0n) {
                // This is a wrap - frBTC received means someone wrapped BTC
                const tx = txMap.get(txid);
                const senderAddress = tx ? extractSenderAddress(tx) : '';

                wrapsInBlock.push({
                  txid,
                  amount,
                  blockHeight,
                  senderAddress,
                });

                console.log(`[parseBlockTracesForFrbtc] Found WRAP: ${txid} amount=${amount} sender=${senderAddress}`);
              }
            }
          }
        }

        // Check ValueTransfer for outgoing transfers (unwrap - frBTC out)
        if (event.ValueTransfer?.transfers) {
          const transfers = event.ValueTransfer.transfers;
          for (const transfer of transfers) {
            if (isFrbtc(transfer.id)) {
              const amount = parseValue(transfer);
              if (amount > 0n) {
                // This is an unwrap - frBTC leaving subfrost
                const tx = txMap.get(txid);
                const recipientAddress = tx ? extractRecipientAddress(tx, subfrostAddress) : '';

                unwrapsInBlock.push({
                  txid,
                  amount,
                  blockHeight,
                  recipientAddress,
                });

                console.log(`[parseBlockTracesForFrbtc] Found UNWRAP: ${txid} amount=${amount} recipient=${recipientAddress}`);
              }
            }
          }
        }
      }
    }

    console.log(`[parseBlockTracesForFrbtc] Processed ${processedCount} transactions in block ${blockHeight}`);
    console.log(`[parseBlockTracesForFrbtc] Found ${wrapsInBlock.length} wraps and ${unwrapsInBlock.length} unwraps`);
  } catch (error) {
    console.error(`[parseBlockTracesForFrbtc] Error parsing traces for block ${blockHeight}:`, error);
  }

  return { wrapsInBlock, unwrapsInBlock };
}

