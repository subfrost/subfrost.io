/**
 * Integration test for efficient block-level trace aggregation (V2)
 * Tests the new approach of using getAddressTxsWithTraces in a single call
 */

import { describe, it, expect } from 'vitest';
import { getWrapUnwrapFromBlockTraces } from '@/lib/alkanes-client-v2';
import { alkanesClient } from '@/lib/alkanes-client';

const runIntegration = process.env.RUN_INTEGRATION === 'true';
const TEST_TIMEOUT = 300000; // 5 minutes

describe.skipIf(!runIntegration)('Block-Level Trace Aggregation V2', () => {
  it(
    'should aggregate wrap/unwrap data efficiently',
    async () => {
      console.log('=== Testing V2 block-level aggregation ===');

      // Get the provider from alkanesClient
      const provider = await alkanesClient.ensureProvider();

      // Execute V2 aggregation
      const result = await getWrapUnwrapFromBlockTraces(provider, 0);

      console.log('\n--- V2 Aggregation Results ---');
      console.log(`Total Wrapped: ${result.totalWrapped} satoshis (${Number(result.totalWrapped) / 1e8} BTC)`);
      console.log(`Total Unwrapped: ${result.totalUnwrapped} satoshis (${Number(result.totalUnwrapped) / 1e8} BTC)`);
      console.log(`Wrap Count: ${result.wrapCount}`);
      console.log(`Unwrap Count: ${result.unwrapCount}`);
      console.log(`Last Block Height: ${result.lastBlockHeight}`);
      console.log(`Lifetime BTC Tx Value: ${(Number(result.totalWrapped) + Number(result.totalUnwrapped)) / 1e8} BTC`);

      // Sample transactions
      console.log('\nFirst 3 wraps:');
      result.wraps.slice(0, 3).forEach(w => {
        console.log(`  - ${w.txid.substring(0, 12)}... ${Number(w.amount) / 1e8} BTC from ${w.senderAddress.substring(0, 20)}...`);
      });

      console.log('\nFirst 3 unwraps:');
      result.unwraps.slice(0, 3).forEach(u => {
        console.log(`  - ${u.txid.substring(0, 12)}... ${Number(u.amount) / 1e8} BTC to ${u.recipientAddress.substring(0, 20)}...`);
      });

      // Validations
      expect(result.totalWrapped).toBeGreaterThan(0n);
      expect(result.totalUnwrapped).toBeGreaterThan(0n);
      expect(result.wrapCount).toBeGreaterThan(0);
      expect(result.unwrapCount).toBeGreaterThan(0);
      expect(result.wraps).toHaveLength(result.wrapCount);
      expect(result.unwraps).toHaveLength(result.unwrapCount);

      // All wraps should have sender addresses
      const wrapsWithAddresses = result.wraps.filter(w => w.senderAddress && w.senderAddress.length > 0);
      console.log(`\nWraps with addresses: ${wrapsWithAddresses.length}/${result.wrapCount}`);

      // All unwraps should have recipient addresses
      const unwrapsWithAddresses = result.unwraps.filter(u => u.recipientAddress && u.recipientAddress.length > 0);
      console.log(`Unwraps with addresses: ${unwrapsWithAddresses.length}/${result.unwrapCount}`);
    },
    TEST_TIMEOUT
  );

  it(
    'should match current TypeScript implementation',
    async () => {
      console.log('\n=== Comparing V2 vs Current implementation ===');

      // Get the provider from alkanesClient
      const provider = await alkanesClient.ensureProvider();

      // Get results from both implementations
      const [v2Result, currentResult] = await Promise.all([
        getWrapUnwrapFromBlockTraces(provider, 0),
        alkanesClient.getWrapUnwrapFromTraces(0)
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

      console.log(`\n✅ V2 implementation matches current implementation exactly!`);
    },
    TEST_TIMEOUT
  );

  it(
    'should support filtering by block height range',
    async () => {
      console.log('\n=== Testing block height filtering ===');

      // Get the provider from alkanesClient
      const provider = await alkanesClient.ensureProvider();

      // Get recent blocks only (last 10000 blocks)
      const currentHeight = await provider.esplora.getBlockHeight();
      const fromHeight = Math.max(0, currentHeight - 10000);

      console.log(`Testing from block ${fromHeight} to ${currentHeight}`);

      const result = await getWrapUnwrapFromBlockTraces(provider, fromHeight);

      console.log(`\nFound ${result.wrapCount} wraps and ${result.unwrapCount} unwraps in last 10000 blocks`);
      console.log(`Last block height in result: ${result.lastBlockHeight}`);

      expect(result.lastBlockHeight).toBeGreaterThanOrEqual(fromHeight);
      expect(result.lastBlockHeight).toBeLessThanOrEqual(currentHeight);
    },
    TEST_TIMEOUT
  );

  it(
    'should support specific block range queries',
    async () => {
      console.log('\n=== Testing specific block range queries ===');

      // Import the range function
      const { getWrapUnwrapFromBlockRange } = await import('@/lib/alkanes-client-v2');
      const provider = await alkanesClient.ensureProvider();

      // Test a specific range (e.g., 10000 block window)
      const currentHeight = await provider.esplora.getBlockHeight();
      const fromHeight = Math.max(0, currentHeight - 20000);
      const toHeight = fromHeight + 10000;

      console.log(`\nTesting specific range: ${fromHeight} to ${toHeight}`);

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
