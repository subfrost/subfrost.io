/**
 * Trace Protostone virtual outputs for all subfrost address transactions
 *
 * Process:
 * 1. Get all transactions for subfrost address
 * 2. Analyze each transaction's OP_RETURN to find Protostones
 * 3. Calculate virtual vout indices: tx.vout.length + 1 + protostone_index
 * 4. Create protobuf-encoded outpoints
 * 5. Trace all Protostone outpoints in parallel
 * 6. Parse for frBTC wrap/unwrap operations
 */

import { alkanesClient } from './lib/alkanes-client.js';

const SUBFROST_ADDRESS = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';

function isFrbtc(alkaneId: any): boolean {
  if (!alkaneId) return false;
  const blockNum = typeof alkaneId.block === 'object' ? alkaneId.block.lo : Number(alkaneId.block);
  const txNum = typeof alkaneId.tx === 'object' ? alkaneId.tx.lo : Number(alkaneId.tx);
  return blockNum === 32 && txNum === 0;
}

function parseValue(transfer: any): bigint {
  if (!transfer?.value) return 0n;
  const value = transfer.value;

  if (typeof value === 'object' && 'lo' in value) {
    const lo = BigInt(value.lo || 0);
    const hi = BigInt(value.hi || 0);
    return (hi << 64n) | lo;
  }

  return BigInt(value);
}

/**
 * Find OP_RETURN output in transaction
 */
function findOpReturnOutput(tx: any): string | null {
  if (!tx.vout || !Array.isArray(tx.vout)) return null;

  for (const output of tx.vout) {
    if (output.scriptpubkey_type === 'op_return' && output.scriptpubkey) {
      return output.scriptpubkey;
    }
  }

  return null;
}

/**
 * Encode outpoint as protobuf hex for trace call
 * Uses alkanes_support::proto::alkanes::Outpoint structure
 */
function encodeOutpointForTrace(txid: string, vout: number): string {
  // Convert txid hex to bytes (reverse for bitcoin byte order)
  const txidBytes = Buffer.from(txid, 'hex').reverse();

  // Encode as protobuf Outpoint message:
  // message Outpoint {
  //   bytes txid = 1;   // field number 1, wire type 2 (length-delimited)
  //   uint32 vout = 2;  // field number 2, wire type 0 (varint)
  // }

  const parts: Buffer[] = [];

  // Field 1: txid (bytes)
  // Tag: (field_number << 3) | wire_type = (1 << 3) | 2 = 0x0a
  parts.push(Buffer.from([0x0a]));
  // Length of txid (32 bytes)
  parts.push(Buffer.from([0x20]));
  // Txid bytes
  parts.push(txidBytes);

  // Field 2: vout (uint32)
  // Tag: (field_number << 3) | wire_type = (2 << 3) | 0 = 0x10
  parts.push(Buffer.from([0x10]));
  // Vout as varint
  parts.push(Buffer.from([vout]));

  const encoded = Buffer.concat(parts);
  return '0x' + encoded.toString('hex');
}

async function traceProtostones() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  // Step 1: Get all transactions for subfrost address
  console.log(`\nFetching transactions for ${SUBFROST_ADDRESS}...`);
  const txs = await provider.esplora.getAddressTxs(SUBFROST_ADDRESS);
  console.log(`Found ${txs.length} transactions`);

  // Step 2: Analyze transactions to find Protostones
  console.log(`\nAnalyzing transactions for Protostones...`);

  interface ProtostoneOutpoint {
    txid: string;
    vout: number;
    protostoneIndex: number;
    blockHeight: number;
    encodedOutpoint: string;
  }

  const protostoneOutpoints: ProtostoneOutpoint[] = [];
  let txsWithOpReturn = 0;
  let totalProtostones = 0;

  for (const tx of txs) {
    const opReturnScript = findOpReturnOutput(tx);
    if (!opReturnScript) continue;

    txsWithOpReturn++;

    try {
      // Analyze the runestone/OP_RETURN to count Protostones
      // For now, let's use a heuristic: check if it's an alkanes OP_RETURN
      // Real implementation would use the analyze_runestone binding

      // Alkanes OP_RETURN typically starts with specific patterns
      // Format: 6a5d<length><data>
      // Let's assume each transaction has at least 1 Protostone for testing

      const numOutputs = tx.vout?.length || 0;

      // For now, assume 1 Protostone per transaction with OP_RETURN
      // TODO: Use analyze_runestone to get actual Protostone count
      const numProtostones = 1;

      for (let i = 0; i < numProtostones; i++) {
        const vout = numOutputs + 1 + i;
        const encodedOutpoint = encodeOutpointForTrace(tx.txid, vout);

        protostoneOutpoints.push({
          txid: tx.txid,
          vout,
          protostoneIndex: i,
          blockHeight: tx.status?.block_height || 0,
          encodedOutpoint,
        });

        totalProtostones++;
      }
    } catch (error) {
      console.error(`Error analyzing tx ${tx.txid}:`, error);
    }
  }

  console.log(`Transactions with OP_RETURN: ${txsWithOpReturn}`);
  console.log(`Total Protostones found: ${totalProtostones}`);
  console.log(`Protostone outpoints to trace: ${protostoneOutpoints.length}`);

  if (protostoneOutpoints.length === 0) {
    console.log('\n⚠️  No Protostones found to trace!');
    return;
  }

  // Step 3: Trace all Protostone outpoints in parallel
  console.log(`\nTracing ${protostoneOutpoints.length} Protostone outpoints in parallel...`);
  const startTime = Date.now();

  const tracePromises = protostoneOutpoints.map(async (po) => {
    try {
      // Call trace with plain txid:vout format (NOT protobuf encoded)
      const outpointString = `${po.txid}:${po.vout}`;
      const trace = await provider.alkanes.trace(outpointString);
      return {
        success: true,
        ...po,
        trace,
      };
    } catch (error) {
      return {
        success: false,
        ...po,
        error: String(error),
      };
    }
  });

  const results = await Promise.all(tracePromises);
  const elapsed = Date.now() - startTime;

  console.log(`✓ Traced ${results.length} Protostones in ${elapsed}ms (${(elapsed / results.length).toFixed(1)}ms avg)`);

  // Step 4: Parse traces for frBTC operations
  console.log(`\nParsing Protostone traces for frBTC (32:0) operations...`);

  const wraps: Array<{ txid: string; vout: number; amount: bigint; blockHeight: number }> = [];
  const unwraps: Array<{ txid: string; vout: number; amount: bigint; blockHeight: number }> = [];
  let tracesWithEvents = 0;
  let emptyTraces = 0;
  let failedTraces = 0;

  for (const result of results) {
    if (!result.success) {
      failedTraces++;
      console.log(`  ✗ Failed to trace ${result.txid}:${result.vout} - ${result.error}`);
      continue;
    }

    const { txid, vout, blockHeight, trace: traceResponse } = result;

    // Check if trace is empty
    if (!traceResponse || traceResponse === '0x' || (typeof traceResponse === 'string' && traceResponse.length <= 2)) {
      emptyTraces++;
      continue;
    }

    // The response has structure { outpoint, trace } - we need the nested trace.events
    const trace = traceResponse.trace || traceResponse;

    // Parse trace events
    if (!trace?.events || !Array.isArray(trace.events)) {
      console.log(`  ⚠️  Trace for ${txid}:${vout} has no events array`);
      console.log(`  Trace type: ${typeof trace}, keys: ${Object.keys(trace || {}).join(', ')}`);
      console.log(`  Trace structure:`, JSON.stringify(trace, null, 2).substring(0, 500));
      continue;
    }

    tracesWithEvents++;

    for (const eventWrapper of trace.events) {
      const event = eventWrapper.event;
      if (!event) continue;

      // Check ReceiveIntent for incoming frBTC (wraps)
      if (event.ReceiveIntent?.incoming_alkanes) {
        for (const transfer of event.ReceiveIntent.incoming_alkanes) {
          if (isFrbtc(transfer.id)) {
            const amount = parseValue(transfer);
            if (amount > 0n) {
              wraps.push({ txid, vout, amount, blockHeight });
              console.log(`  ✅ WRAP: ${txid}:${vout} amount=${amount} (block ${blockHeight})`);
            }
          }
        }
      }

      // Check ValueTransfer for outgoing frBTC (unwraps)
      if (event.ValueTransfer?.transfers) {
        for (const transfer of event.ValueTransfer.transfers) {
          if (isFrbtc(transfer.id)) {
            const amount = parseValue(transfer);
            if (amount > 0n) {
              unwraps.push({ txid, vout, amount, blockHeight });
              console.log(`  ✅ UNWRAP: ${txid}:${vout} amount=${amount} (block ${blockHeight})`);
            }
          }
        }
      }
    }
  }

  // Step 5: Report results
  console.log(`\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total transactions: ${txs.length}`);
  console.log(`Transactions with OP_RETURN: ${txsWithOpReturn}`);
  console.log(`Total Protostones traced: ${protostoneOutpoints.length}`);
  console.log(`Successful traces: ${results.filter(r => r.success).length}`);
  console.log(`Failed traces: ${failedTraces}`);
  console.log(`Empty traces: ${emptyTraces}`);
  console.log(`Traces with events: ${tracesWithEvents}`);
  console.log(`\nfrBTC (32:0) Results:`);
  console.log(`  Wraps found: ${wraps.length}`);
  console.log(`  Unwraps found: ${unwraps.length}`);

  if (wraps.length > 0) {
    const totalWrapped = wraps.reduce((sum, w) => sum + w.amount, 0n);
    console.log(`  Total wrapped: ${totalWrapped} sats`);
  }

  if (unwraps.length > 0) {
    const totalUnwrapped = unwraps.reduce((sum, u) => sum + u.amount, 0n);
    console.log(`  Total unwrapped: ${totalUnwrapped} sats`);
  }

  if (wraps.length === 0 && unwraps.length === 0 && tracesWithEvents > 0) {
    console.log(`\n⚠️  No frBTC (32:0) operations found in ${tracesWithEvents} traces with events!`);
  }

  return { wraps, unwraps };
}

traceProtostones().catch(err => {
  console.error('\nError:', err);
  process.exit(1);
});
