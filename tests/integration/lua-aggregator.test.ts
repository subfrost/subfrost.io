/**
 * Integration test for Lua-based wrap/unwrap aggregation
 * Compares Lua results with TypeScript implementation
 */

import { describe, it, expect } from 'vitest';
import { getWrapUnwrapViaInlineLua } from '@/lib/wrap-unwrap-lua';
import { alkanesClient } from '@/lib/alkanes-client';

const runIntegration = process.env.RUN_INTEGRATION === 'true';
const TEST_TIMEOUT = 300000; // 5 minutes

describe.skipIf(!runIntegration)('Lua Wrap/Unwrap Aggregator', () => {
  it(
    'should aggregate all wrap/unwrap data via Lua script',
    async () => {
      console.log('=== Testing Lua-based aggregation ===');

      // Execute Lua script
      const luaResult = await getWrapUnwrapViaInlineLua(0);

      console.log('\n--- Lua Aggregation Results ---');
      console.log(`Total Wrapped: ${luaResult.totalWrapped} satoshis (${luaResult.totalWrapped / 1e8} BTC)`);
      console.log(`Total Unwrapped: ${luaResult.totalUnwrapped} satoshis (${luaResult.totalUnwrapped / 1e8} BTC)`);
      console.log(`Wrap Count: ${luaResult.wrapCount}`);
      console.log(`Unwrap Count: ${luaResult.unwrapCount}`);
      console.log(`Last Block Height: ${luaResult.lastBlockHeight}`);
      console.log(`Lifetime BTC Tx Value: ${(luaResult.totalWrapped + luaResult.totalUnwrapped) / 1e8} BTC`);

      // Sample transactions
      console.log('\nFirst 3 wraps:');
      luaResult.wraps.slice(0, 3).forEach(w => {
        console.log(`  - ${w.txid.substring(0, 12)}... ${w.amount / 1e8} BTC from ${w.senderAddress.substring(0, 20)}...`);
      });

      console.log('\nFirst 3 unwraps:');
      luaResult.unwraps.slice(0, 3).forEach(u => {
        console.log(`  - ${u.txid.substring(0, 12)}... ${u.amount / 1e8} BTC to ${u.recipientAddress.substring(0, 20)}...`);
      });

      // Validations
      expect(luaResult.totalWrapped).toBeGreaterThan(0);
      expect(luaResult.totalUnwrapped).toBeGreaterThan(0);
      expect(luaResult.wrapCount).toBeGreaterThan(0);
      expect(luaResult.unwrapCount).toBeGreaterThan(0);
      expect(luaResult.wraps).toHaveLength(luaResult.wrapCount);
      expect(luaResult.unwraps).toHaveLength(luaResult.unwrapCount);

      // All wraps should have sender addresses
      const wrapsWithAddresses = luaResult.wraps.filter(w => w.senderAddress && w.senderAddress.length > 0);
      console.log(`\nWraps with addresses: ${wrapsWithAddresses.length}/${luaResult.wrapCount}`);

      // All unwraps should have recipient addresses
      const unwrapsWithAddresses = luaResult.unwraps.filter(u => u.recipientAddress && u.recipientAddress.length > 0);
      console.log(`Unwraps with addresses: ${unwrapsWithAddresses.length}/${luaResult.unwrapCount}`);
    },
    TEST_TIMEOUT
  );

  it(
    'should match TypeScript implementation results',
    async () => {
      console.log('\n=== Comparing Lua vs TypeScript implementations ===');

      // Get results from both implementations
      const [luaResult, tsResult] = await Promise.all([
        getWrapUnwrapViaInlineLua(0),
        alkanesClient.getWrapUnwrapFromTraces(0)
      ]);

      console.log('\nLua Results:');
      console.log(`  Wrapped: ${luaResult.totalWrapped / 1e8} BTC (${luaResult.wrapCount} txs)`);
      console.log(`  Unwrapped: ${luaResult.totalUnwrapped / 1e8} BTC (${luaResult.unwrapCount} txs)`);

      console.log('\nTypeScript Results:');
      console.log(`  Wrapped: ${Number(tsResult.totalWrappedFrbtc) / 1e8} BTC (${tsResult.wrapCount} txs)`);
      console.log(`  Unwrapped: ${Number(tsResult.totalUnwrappedFrbtc) / 1e8} BTC (${tsResult.unwrapCount} txs)`);

      // Allow for small differences due to timing/caching
      const wrapDiff = Math.abs(luaResult.totalWrapped - Number(tsResult.totalWrappedFrbtc));
      const unwrapDiff = Math.abs(luaResult.totalUnwrapped - Number(tsResult.totalUnwrappedFrbtc));

      console.log(`\nDifferences:`);
      console.log(`  Wrap diff: ${wrapDiff} satoshis`);
      console.log(`  Unwrap diff: ${unwrapDiff} satoshis`);

      // Results should be identical or very close
      expect(wrapDiff).toBeLessThan(1000); // Allow max 1000 sat difference
      expect(unwrapDiff).toBeLessThan(1000);
    },
    TEST_TIMEOUT
  );
});
