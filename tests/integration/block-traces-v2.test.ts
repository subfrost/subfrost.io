/**
 * Integration test for efficient block-level trace aggregation (V2)
 * Tests using smaller block ranges for faster execution
 */

import { describe, it, expect } from 'vitest';
import { getWrapUnwrapFromBlockRange } from '@/lib/alkanes-client-v2';
import { alkanesClient } from '@/lib/alkanes-client';

const runIntegration = process.env.RUN_INTEGRATION === 'true';
const TEST_TIMEOUT = 60000; // 1 minute (reduced from 5 minutes)
const TEST_BLOCK_RANGE = 5000; // Test with last 5000 blocks

describe.skipIf(!runIntegration)('Block-Level Trace Aggregation V2', () => {
  it(
    'should aggregate wrap/unwrap data for recent blocks',
    async () => {
      console.log('=== Testing V2 block-level aggregation (recent blocks) ===');

      // Get the provider
      const provider = await alkanesClient.getProvider();
      const currentHeight = await provider.getBlockHeight();
      const fromHeight = Math.max(0, currentHeight - TEST_BLOCK_RANGE);

      console.log(`\nTesting range: blocks ${fromHeight} to ${currentHeight} (${TEST_BLOCK_RANGE} blocks)`);

      // Execute V2 aggregation on recent blocks only
      const result = await getWrapUnwrapFromBlockRange(provider, fromHeight);

      console.log('\n--- V2 Aggregation Results ---');
      console.log(`Total Wrapped: ${result.totalWrapped} satoshis (${Number(result.totalWrapped) / 1e8} BTC)`);
      console.log(`Total Unwrapped: ${result.totalUnwrapped} satoshis (${Number(result.totalUnwrapped) / 1e8} BTC)`);
      console.log(`Wrap Count: ${result.wrapCount}`);
      console.log(`Unwrap Count: ${result.unwrapCount}`);
      console.log(`Last Block Height: ${result.lastBlockHeight}`);

      if (result.wrapCount > 0 || result.unwrapCount > 0) {
        console.log(`\nTotal Activity: ${(Number(result.totalWrapped) + Number(result.totalUnwrapped)) / 1e8} BTC`);
      }

      // Sample transactions
      if (result.wraps.length > 0) {
        console.log('\nSample wraps:');
        result.wraps.slice(0, Math.min(3, result.wraps.length)).forEach(w => {
          console.log(`  - ${w.txid.substring(0, 12)}... ${Number(w.amount) / 1e8} BTC from ${w.senderAddress.substring(0, 20)}... (block ${w.blockHeight})`);
        });
      }

      if (result.unwraps.length > 0) {
        console.log('\nSample unwraps:');
        result.unwraps.slice(0, Math.min(3, result.unwraps.length)).forEach(u => {
          console.log(`  - ${u.txid.substring(0, 12)}... ${Number(u.amount) / 1e8} BTC to ${u.recipientAddress.substring(0, 20)}... (block ${u.blockHeight})`);
        });
      }

      // Validations
      expect(result.wraps).toHaveLength(result.wrapCount);
      expect(result.unwraps).toHaveLength(result.unwrapCount);
      expect(result.lastBlockHeight).toBeGreaterThanOrEqual(fromHeight);
      expect(result.lastBlockHeight).toBeLessThanOrEqual(currentHeight);

      // All wraps should have transaction IDs
      for (const wrap of result.wraps) {
        expect(wrap.txid).toBeTruthy();
        expect(wrap.amount).toBeGreaterThan(0n);
        expect(wrap.blockHeight).toBeGreaterThanOrEqual(fromHeight);
      }

      // All unwraps should have transaction IDs
      for (const unwrap of result.unwraps) {
        expect(unwrap.txid).toBeTruthy();
        expect(unwrap.amount).toBeGreaterThan(0n);
        expect(unwrap.blockHeight).toBeGreaterThanOrEqual(fromHeight);
      }

      console.log('\n✅ Test passed! All data structures valid.');
    },
    TEST_TIMEOUT
  );

  it(
    'should match current implementation for same block range',
    async () => {
      console.log('\n=== Comparing V2 vs Current implementation (same range) ===');

      // Get the provider from alkanesClient
      const provider = await alkanesClient.getProvider();
      const currentHeight = await provider.getBlockHeight();
      const fromHeight = Math.max(0, currentHeight - TEST_BLOCK_RANGE);

      console.log(`\nTesting range: blocks ${fromHeight} to ${currentHeight}`);

      // Get results from both implementations using the same range
      const [v2Result, currentResult] = await Promise.all([
        getWrapUnwrapFromBlockRange(provider, fromHeight),
        alkanesClient.getWrapUnwrapFromTraces(fromHeight)
      ]);

      console.log('\nV2 Results:');
      console.log(`  Wrapped: ${Number(v2Result.totalWrapped) / 1e8} BTC (${v2Result.wrapCount} txs)`);
      console.log(`  Unwrapped: ${Number(v2Result.totalUnwrapped) / 1e8} BTC (${v2Result.unwrapCount} txs)`);

      console.log('\nCurrent Results:');
      console.log(`  Wrapped: ${Number(currentResult.totalWrappedFrbtc) / 1e8} BTC (${currentResult.wrapCount} txs)`);
      console.log(`  Unwrapped: ${Number(currentResult.totalUnwrappedFrbtc) / 1e8} BTC (${currentResult.unwrapCount} txs)`);

      // Results should match exactly
      expect(v2Result.totalWrapped).toBe(currentResult.totalWrappedFrbtc);
      expect(v2Result.totalUnwrapped).toBe(currentResult.totalUnwrappedFrbtc);
      expect(v2Result.wrapCount).toBe(currentResult.wrapCount);
      expect(v2Result.unwrapCount).toBe(currentResult.unwrapCount);

      console.log('\n✅ V2 implementation matches current implementation exactly!');
    },
    TEST_TIMEOUT
  );

  it(
    'should support specific block range queries',
    async () => {
      console.log('\n=== Testing specific block range queries ===');

      const provider = await alkanesClient.getProvider();

      // Test a specific 2000-block window
      const currentHeight = await provider.getBlockHeight();
      const fromHeight = Math.max(0, currentHeight - 10000);
      const toHeight = fromHeight + 2000;

      console.log(`\nTesting specific range: ${fromHeight} to ${toHeight} (2000 blocks)`);

      const result = await getWrapUnwrapFromBlockRange(provider, fromHeight, toHeight);

      console.log(`Found ${result.wrapCount} wraps and ${result.unwrapCount} unwraps`);
      console.log(`Total wrapped: ${Number(result.totalWrapped) / 1e8} BTC`);
      console.log(`Total unwrapped: ${Number(result.totalUnwrapped) / 1e8} BTC`);
      console.log(`Last block: ${result.lastBlockHeight}`);

      // Verify all transactions are within the specified range
      for (const wrap of result.wraps) {
        expect(wrap.blockHeight).toBeGreaterThanOrEqual(fromHeight);
        expect(wrap.blockHeight).toBeLessThanOrEqual(toHeight);
      }

      for (const unwrap of result.unwraps) {
        expect(unwrap.blockHeight).toBeGreaterThanOrEqual(fromHeight);
        expect(unwrap.blockHeight).toBeLessThanOrEqual(toHeight);
      }

      console.log('✅ All transactions within specified range');
    },
    TEST_TIMEOUT
  );
});
