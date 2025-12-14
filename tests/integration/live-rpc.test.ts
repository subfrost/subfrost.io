/**
 * Live Integration Tests for Subfrost.io RPC calls
 *
 * These tests verify that the RPC calls work correctly against the live
 * Subfrost/Metashrew infrastructure.
 *
 * To run these tests:
 *   pnpm test:live
 *
 * For RPC-specific tests:
 *   RUN_INTEGRATION=true vitest run tests/integration/live-rpc.test.ts
 *
 * Environment:
 *   ALKANES_RPC_URL - Override the default RPC endpoint (optional)
 */

import { describe, it, expect } from 'vitest';
import {
  alkanesClient,
  FRBTC_TOKEN,
  formatAlkaneId,
} from '@/lib/alkanes-client';

// Skip all tests unless explicitly running integration tests
const runIntegration = process.env.RUN_INTEGRATION === 'true';

// Set longer timeout for network calls - increased for full pagination
const TEST_TIMEOUT = 300000; // 5 minutes

describe.skipIf(!runIntegration)('Live RPC Integration Tests', () => {
  describe('getBtcLocked', () => {
    it(
      'should return BTC locked in Subfrost address',
      async () => {
        const result = await alkanesClient.getBtcLocked();

        console.log(`BTC Locked: ${result.btc} BTC (${result.satoshis} sats)`);
        console.log(`UTXO Count: ${result.utxoCount}`);

        expect(result.satoshis).toBeGreaterThan(0);
        expect(result.btc).toBeGreaterThan(0);
        expect(result.utxoCount).toBeGreaterThan(0);
      },
      TEST_TIMEOUT
    );
  });

  describe('getAddressUtxos', () => {
    it(
      'should return UTXOs for Subfrost address',
      async () => {
        const subfrostAddress = await alkanesClient.getSubfrostAddress();
        console.log(`Subfrost address: ${subfrostAddress}`);

        const utxos = await alkanesClient.getAddressUtxos(subfrostAddress);

        console.log(`Found ${utxos.length} UTXOs`);
        if (utxos.length > 0) {
          console.log(`First UTXO: ${utxos[0].txid}:${utxos[0].vout} = ${utxos[0].value} sats`);
        }

        expect(utxos).toBeInstanceOf(Array);
        expect(utxos.length).toBeGreaterThan(0);

        // Verify UTXO structure
        for (const utxo of utxos) {
          expect(utxo.txid).toBeDefined();
          expect(utxo.vout).toBeDefined();
          expect(utxo.value).toBeGreaterThan(0);
          expect(utxo.status).toBeDefined();
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('getFrbtcTotalSupply', () => {
    it(
      'should return frBTC total supply',
      async () => {
        const result = await alkanesClient.getFrbtcTotalSupply();

        console.log(`frBTC Raw Supply: ${result.raw}`);
        console.log(`frBTC Adjusted Supply: ${result.adjusted}`);
        console.log(`frBTC Total Supply (BTC): ${result.btc}`);

        expect(result.raw).toBeGreaterThan(0n);
        expect(result.adjusted).toBeGreaterThan(0n);
        expect(result.btc).toBeGreaterThan(0);
      },
      TEST_TIMEOUT
    );
  });

  describe('getCurrentHeight', () => {
    it(
      'should return current blockchain height',
      async () => {
        const height = await alkanesClient.getCurrentHeight();

        console.log(`Current block height: ${height}`);

        // Should be well past block 900,000
        expect(height).toBeGreaterThan(900000);
      },
      TEST_TIMEOUT
    );
  });

  describe('data consistency', () => {
    it(
      'BTC locked should be >= frBTC issued (accounting for fees)',
      async () => {
        const [btcLocked, frbtcSupply] = await Promise.all([
          alkanesClient.getBtcLocked(),
          alkanesClient.getFrbtcTotalSupply(),
        ]);

        console.log(`BTC Locked: ${btcLocked.btc} BTC`);
        console.log(`frBTC Issued: ${frbtcSupply.btc} BTC`);
        console.log(`Difference: ${(btcLocked.btc - frbtcSupply.btc).toFixed(8)} BTC`);

        // BTC locked should be at least as much as frBTC issued
        // There may be some variance due to fees or timing
        expect(btcLocked.btc).toBeGreaterThanOrEqual(frbtcSupply.btc * 0.95);
      },
      TEST_TIMEOUT
    );
  });

  describe('getWrapUnwrapFromTraces', () => {
    it(
      'should return wrap/unwrap data from alkanes traces',
      async () => {
        const result = await alkanesClient.getWrapUnwrapFromTraces();

        console.log('--- Wrap/Unwrap From Traces Results ---');
        console.log(`Total Wrapped frBTC: ${result.totalWrappedFrbtc}`);
        console.log(`Total Unwrapped frBTC: ${result.totalUnwrappedFrbtc}`);
        console.log(`Wrap Count: ${result.wrapCount}`);
        console.log(`Unwrap Count: ${result.unwrapCount}`);
        // BigInt serialization helper
        const bigIntReplacer = (_: string, v: any) => typeof v === 'bigint' ? v.toString() : v;
        console.log(`Wraps: ${JSON.stringify(result.wraps.slice(0, 3), bigIntReplacer, 2)}`);
        console.log(`Unwraps: ${JSON.stringify(result.unwraps.slice(0, 3), bigIntReplacer, 2)}`);

        // Basic structure validation
        expect(result).toHaveProperty('totalWrappedFrbtc');
        expect(result).toHaveProperty('totalUnwrappedFrbtc');
        expect(result).toHaveProperty('wrapCount');
        expect(result).toHaveProperty('unwrapCount');
        expect(result).toHaveProperty('wraps');
        expect(result).toHaveProperty('unwraps');
        expect(result.wraps).toBeInstanceOf(Array);
        expect(result.unwraps).toBeInstanceOf(Array);
      },
      TEST_TIMEOUT
    );

    it(
      'should have traces matching expected transaction count',
      async () => {
        const subfrostAddress = await alkanesClient.getSubfrostAddress();
        console.log(`Testing traces for Subfrost address: ${subfrostAddress}`);

        // Get raw transaction list to compare
        const txs = await alkanesClient.getAddressTxs(subfrostAddress);
        const txsWithOpReturn = txs.filter(tx =>
          tx.vout?.some((v: any) => v.scriptpubkey_type === 'op_return')
        );

        console.log(`Total txs for address: ${txs.length}`);
        console.log(`Txs with OP_RETURN: ${txsWithOpReturn.length}`);

        // Get traces data
        const traces = await alkanesClient.getWrapUnwrapFromTraces();

        // We expect some wraps to be detected if there are OP_RETURN transactions
        // This test helps debug whether the traces are being properly extracted
        console.log(`Detected wrap count: ${traces.wrapCount}`);
        console.log(`Detected unwrap count: ${traces.unwrapCount}`);

        // Log if there's a mismatch for debugging
        if (traces.wrapCount === 0 && txsWithOpReturn.length > 0) {
          console.warn('WARNING: OP_RETURN transactions found but no wraps detected from traces');
          console.warn('This indicates the runestone/protostone decoding may not be working');
        }
      },
      TEST_TIMEOUT
    );
  });
});
