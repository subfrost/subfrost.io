/**
 * Fetch transaction traces in parallel for all subfrost address transactions
 * and parse for frBTC (32:0) wrap/unwrap operations
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

  // Handle uint128 format: (hi << 64) | lo
  if (typeof value === 'object' && 'lo' in value) {
    const lo = BigInt(value.lo || 0);
    const hi = BigInt(value.hi || 0);
    return (hi << 64n) | lo;
  }

  return BigInt(value);
}

async function traceTransactionsInParallel() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  // Step 1: Get all transactions for subfrost address
  console.log(`\nFetching transactions for ${SUBFROST_ADDRESS}...`);
  const txs = await provider.esplora.getAddressTxs(SUBFROST_ADDRESS);
  console.log(`Found ${txs.length} transactions`);

  // Step 2: Build list of outpoints to trace
  // For each transaction, we need to find outputs to the subfrost address
  const outpointsToTrace: Array<{ outpoint: string; txid: string; vout: number; blockHeight: number }> = [];

  for (const tx of txs) {
    if (!tx.vout || !Array.isArray(tx.vout)) continue;

    for (let vout = 0; vout < tx.vout.length; vout++) {
      const output = tx.vout[vout];
      // Check if this output goes to the subfrost address
      if (output.scriptpubkey_address === SUBFROST_ADDRESS) {
        const outpoint = `${tx.txid}:${vout}`;
        outpointsToTrace.push({
          outpoint,
          txid: tx.txid,
          vout,
          blockHeight: tx.status?.block_height || 0,
        });
      }
    }
  }

  console.log(`\nFound ${outpointsToTrace.length} outpoints to trace (outputs to subfrost address)`);

  // Step 3: Fetch all traces in parallel
  console.log(`\nFetching traces in parallel...`);
  const startTime = Date.now();

  const tracePromises = outpointsToTrace.map(async ({ outpoint, txid, vout, blockHeight }) => {
    try {
      const trace = await provider.alkanes.trace(outpoint);
      return { success: true, outpoint, txid, vout, blockHeight, trace };
    } catch (error) {
      return { success: false, outpoint, txid, vout, blockHeight, error: String(error) };
    }
  });

  const results = await Promise.all(tracePromises);
  const elapsed = Date.now() - startTime;

  console.log(`✓ Fetched ${results.length} traces in ${elapsed}ms (${(elapsed / results.length).toFixed(1)}ms avg per trace)`);

  // Step 4: Parse traces for frBTC operations
  console.log(`\nParsing traces for frBTC (32:0) operations...`);

  const wraps: Array<{ txid: string; vout: number; amount: bigint; blockHeight: number }> = [];
  const unwraps: Array<{ txid: string; vout: number; amount: bigint; blockHeight: number }> = [];
  let tracesWithEvents = 0;
  let failedTraces = 0;

  for (const result of results) {
    if (!result.success) {
      failedTraces++;
      continue;
    }

    const { txid, vout, blockHeight, trace } = result;

    // Parse trace events
    if (!trace?.events || !Array.isArray(trace.events)) {
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
  console.log(`Total outpoints traced: ${outpointsToTrace.length}`);
  console.log(`Successful traces: ${results.filter(r => r.success).length}`);
  console.log(`Failed traces: ${failedTraces}`);
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

  if (wraps.length === 0 && unwraps.length === 0) {
    console.log(`\n⚠️  No frBTC (32:0) operations found in any of the ${tracesWithEvents} traces with events!`);
  }

  // Show sample trace structure if we have any
  if (tracesWithEvents > 0) {
    const firstTraceWithEvents = results.find(r => r.success && r.trace?.events?.length > 0);
    if (firstTraceWithEvents) {
      console.log(`\n--- Sample Trace Structure (${firstTraceWithEvents.outpoint}) ---`);
      console.log(`Event count: ${firstTraceWithEvents.trace.events.length}`);

      const firstEvent = firstTraceWithEvents.trace.events[0];
      if (firstEvent?.event) {
        console.log(`First event keys: ${Object.keys(firstEvent.event).join(', ')}`);

        // Show ReceiveIntent if present
        if (firstEvent.event.ReceiveIntent) {
          console.log(`\nReceiveIntent found:`);
          if (firstEvent.event.ReceiveIntent.incoming_alkanes) {
            console.log(`  Incoming alkanes: ${firstEvent.event.ReceiveIntent.incoming_alkanes.length}`);
            const first = firstEvent.event.ReceiveIntent.incoming_alkanes[0];
            if (first) {
              console.log(`  First alkane ID:`, first.id);
              console.log(`  First alkane value:`, first.value);
            }
          }
        }
      }
    }
  }

  return { wraps, unwraps };
}

traceTransactionsInParallel().catch(err => {
  console.error('\nError:', err);
  process.exit(1);
});
