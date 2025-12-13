/**
 * Live Integration Tests for Subfrost.io RPC calls
 *
 * These tests verify that the RPC calls work correctly against the live
 * Subfrost/Metashrew infrastructure.
 *
 * To run these tests:
 *   pnpm test:live
 *
 * Environment:
 *   ALKANES_RPC_URL - Override the default RPC endpoint (optional)
 */

import { describe, it, expect } from 'vitest';
import {
  alkanesClient,
  FRBTC_TOKEN,
} from '@/lib/alkanes-client';

// Skip all tests unless explicitly running integration tests
const runIntegration = process.env.RUN_INTEGRATION === 'true';

// Set longer timeout for network calls
const TEST_TIMEOUT = 60000; // 60 seconds

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
});
