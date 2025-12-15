/**
 * frBTC Trace Sync Integration Test
 *
 * Tests the complete workflow of syncing frBTC wrap/unwrap data from alkanes traces:
 * 1. Fetch transactions for Subfrost address using esplora_address::txs
 * 2. Decode OP_RETURN outputs using analyzeRunestone to count Protostones
 * 3. Calculate virtual vout indices for each Protostone
 * 4. Fetch traces in parallel for all Protostone outpoints
 * 5. Parse frBTC (32:0) wrap/unwrap operations from trace events
 *
 * To run this test:
 *   RUN_INTEGRATION=true pnpm vitest run tests/integration/frbtc-trace-sync.test.ts
 */

import { describe, it, expect } from 'vitest';
import { alkanesClient, FRBTC_TOKEN } from '@/lib/alkanes-client';
import { analyzeRunestone } from '@alkanes/ts-sdk';

// Skip all tests unless explicitly running integration tests
const runIntegration = process.env.RUN_INTEGRATION === 'true';

// Set longer timeout for network calls
const TEST_TIMEOUT = 300000; // 5 minutes

interface ProtostoneOutpoint {
  txid: string;
  vout: number;
  protostoneIndex: number;
  blockHeight: number;
}

interface TraceResult {
  success: boolean;
  txid: string;
  vout: number;
  blockHeight: number;
  protostoneIndex: number;
  trace?: any;
  error?: string;
}

interface WrapOperation {
  txid: string;
  vout: number;
  blockHeight: number;
  amount: bigint;
}

interface UnwrapOperation {
  txid: string;
  vout: number;
  blockHeight: number;
  amount: bigint;
}

describe.skipIf(!runIntegration)('frBTC Trace Sync Integration', () => {
  it(
    'should fetch, decode, and trace one page of Subfrost transactions',
    async () => {
      console.log('\n=== Starting frBTC Trace Sync Test ===\n');

      // Step 1: Get Subfrost address and fetch first page of transactions
      const subfrostAddress = await alkanesClient.getSubfrostAddress();
      console.log(`Subfrost address: ${subfrostAddress}`);

      const provider = await alkanesClient.ensureProvider();

      // Fetch first page of transactions (default pagination)
      const txs = await provider.esplora.getAddressTxs(subfrostAddress);
      console.log(`\nFetched ${txs.length} transactions`);

      // Filter for transactions with OP_RETURN (potential alkanes transactions)
      const txsWithOpReturn = txs.filter(tx =>
        tx.vout?.some((output: any) => output.scriptpubkey_type === 'op_return')
      );
      console.log(`Transactions with OP_RETURN: ${txsWithOpReturn.length}`);

      expect(txsWithOpReturn.length).toBeGreaterThan(0);

      // Step 2: Decode runestones to count Protostones and build outpoint list
      console.log('\n--- Analyzing Runestones ---');
      const protostoneOutpoints: ProtostoneOutpoint[] = [];
      const runestoneDecodeStats = {
        total: 0,
        successful: 0,
        failed: 0,
        totalProtostones: 0,
      };

      for (const tx of txsWithOpReturn) {
        runestoneDecodeStats.total++;

        try {
          // Fetch raw transaction hex
          const rawTx = await provider.esplora.getTxHex(tx.txid);

          // Analyze runestone to count Protostones
          const result = await analyzeRunestone(rawTx);
          runestoneDecodeStats.successful++;

          const numOutputs = tx.vout?.length || 0;
          const numProtostones = result.protostone_count;
          runestoneDecodeStats.totalProtostones += numProtostones;

          // Build Protostone outpoints using virtual output indices
          // Formula: vout = tx.vout.length + 1 + protostone_index
          for (let i = 0; i < numProtostones; i++) {
            const vout = numOutputs + 1 + i;
            protostoneOutpoints.push({
              txid: tx.txid,
              vout,
              protostoneIndex: i,
              blockHeight: tx.status?.block_height || 0,
            });
          }
        } catch (error) {
          runestoneDecodeStats.failed++;
          console.warn(`Failed to decode runestone for tx ${tx.txid}:`, error);
        }
      }

      console.log(`\nRunestone Decode Stats:`);
      console.log(`  Total attempts: ${runestoneDecodeStats.total}`);
      console.log(`  Successful: ${runestoneDecodeStats.successful}`);
      console.log(`  Failed: ${runestoneDecodeStats.failed}`);
      console.log(`  Total Protostones found: ${runestoneDecodeStats.totalProtostones}`);
      console.log(`  Protostone outpoints to trace: ${protostoneOutpoints.length}`);

      expect(protostoneOutpoints.length).toBeGreaterThan(0);

      // Step 3: Fetch traces in parallel for all Protostone outpoints
      console.log('\n--- Fetching Traces in Parallel ---');
      const startTime = Date.now();

      const tracePromises = protostoneOutpoints.map(async (po): Promise<TraceResult> => {
        try {
          const outpointString = `${po.txid}:${po.vout}`;
          const traceResponse = await provider.alkanes.trace(outpointString);

          return {
            success: true,
            ...po,
            trace: traceResponse,
          };
        } catch (error) {
          return {
            success: false,
            ...po,
            error: error instanceof Error ? error.message : String(error),
          };
        }
      });

      const results = await Promise.all(tracePromises);
      const duration = Date.now() - startTime;

      const successfulTraces = results.filter(r => r.success);
      const failedTraces = results.filter(r => !r.success);

      console.log(`\nTrace Fetch Results:`);
      console.log(`  Total outpoints: ${results.length}`);
      console.log(`  Successful: ${successfulTraces.length}`);
      console.log(`  Failed: ${failedTraces.length}`);
      console.log(`  Duration: ${duration}ms`);
      console.log(`  Average: ${(duration / results.length).toFixed(1)}ms per trace`);

      if (failedTraces.length > 0) {
        console.log(`\nFailed traces:`);
        failedTraces.slice(0, 5).forEach(f => {
          console.log(`  ${f.txid}:${f.vout} - ${f.error}`);
        });
      }

      expect(successfulTraces.length).toBeGreaterThan(0);

      // Step 4: Parse frBTC wrap/unwrap operations from traces
      console.log('\n--- Parsing frBTC Operations ---');

      const wraps: WrapOperation[] = [];
      const unwraps: UnwrapOperation[] = [];
      let totalWrappedSats = 0n;
      let totalUnwrappedSats = 0n;

      const FRBTC_BLOCK = Number(FRBTC_TOKEN.alkaneId.block);
      const FRBTC_TX = Number(FRBTC_TOKEN.alkaneId.tx);

      for (const result of successfulTraces) {
        if (!result.trace) continue;

        // Handle nested trace structure
        const trace = result.trace.trace || result.trace;

        if (!trace?.events || !Array.isArray(trace.events)) {
          continue;
        }

        // Parse events for frBTC operations
        for (const eventWrapper of trace.events) {
          const event = eventWrapper.event;
          if (!event) continue;

          // ReceiveIntent events indicate wraps (incoming frBTC)
          if (event.ReceiveIntent) {
            const incomingAlkanes = event.ReceiveIntent.incoming_alkanes || [];

            for (const alkane of incomingAlkanes) {
              // Check if this is frBTC (block 32, tx 0)
              // Both block and tx are u128 objects with lo/hi fields
              const blockId = alkane.id?.block?.lo ?? alkane.id?.block;
              const txId = alkane.id?.tx?.lo ?? alkane.id?.tx ?? 0;

              if (blockId === FRBTC_BLOCK && txId === FRBTC_TX) {
                // Value is a u128 with lo/hi fields
                const amountValue = alkane.value?.lo ?? alkane.value;
                const amount = BigInt(amountValue);

                wraps.push({
                  txid: result.txid,
                  vout: result.vout,
                  blockHeight: result.blockHeight,
                  amount,
                });
                totalWrappedSats += amount;
              }
            }
          }

          // ValueTransfer events indicate unwraps (outgoing frBTC)
          if (event.ValueTransfer) {
            const blockId = event.ValueTransfer.alkane_id?.block?.lo ?? event.ValueTransfer.alkane_id?.block;
            const txId = event.ValueTransfer.alkane_id?.tx?.lo ?? event.ValueTransfer.alkane_id?.tx ?? 0;

            if (blockId === FRBTC_BLOCK && txId === FRBTC_TX) {
              const amountValue = event.ValueTransfer.amount?.lo ?? event.ValueTransfer.amount;
              const amount = BigInt(amountValue);

              unwraps.push({
                txid: result.txid,
                vout: result.vout,
                blockHeight: result.blockHeight,
                amount,
              });
              totalUnwrappedSats += amount;
            }
          }
        }
      }

      console.log(`\nfrBTC Operations Found:`);
      console.log(`  Wraps: ${wraps.length}`);
      console.log(`  Total wrapped: ${totalWrappedSats.toLocaleString()} sats (${Number(totalWrappedSats) / 100_000_000} BTC)`);
      console.log(`  Unwraps: ${unwraps.length}`);
      console.log(`  Total unwrapped: ${totalUnwrappedSats.toLocaleString()} sats (${Number(totalUnwrappedSats) / 100_000_000} BTC)`);

      if (wraps.length > 0) {
        console.log(`\n  Sample wraps (first 3):`);
        wraps.slice(0, 3).forEach(w => {
          console.log(`    ${w.txid}:${w.vout} @ block ${w.blockHeight} - ${w.amount.toLocaleString()} sats`);
        });
      }

      if (unwraps.length > 0) {
        console.log(`\n  Sample unwraps (first 3):`);
        unwraps.slice(0, 3).forEach(u => {
          console.log(`    ${u.txid}:${u.vout} @ block ${u.blockHeight} - ${u.amount.toLocaleString()} sats`);
        });
      }

      // Assertions
      expect(wraps.length + unwraps.length).toBeGreaterThan(0);
      expect(totalWrappedSats + totalUnwrappedSats).toBeGreaterThan(0n);

      console.log('\n=== Test Complete ===\n');
    },
    TEST_TIMEOUT
  );
});
