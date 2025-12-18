/**
 * Integration Tests for Blockchain Data Functions
 *
 * These tests directly call the shared blockchain data functions
 * without the HTTP layer, making them faster and more isolated.
 */

import { describe, it, expect } from 'vitest';
import {
  getBtcLockedData,
  getFrbtcIssuedData,
  getWrapHistoryData,
  getUnwrapHistoryData,
  getTotalUnwrapsData,
} from '@/lib/blockchain-data';

describe('Blockchain Data Integration Tests', () => {
  describe('getBtcLockedData', () => {
    it('should fetch BTC locked data from SDK', async () => {
      const data = await getBtcLockedData();

      expect(data).toBeDefined();
      expect(data.btcLocked).toBeTypeOf('number');
      expect(data.satoshis).toBeTypeOf('string');
      expect(data.utxoCount).toBeTypeOf('number');
      expect(data.address).toBeTypeOf('string');
      expect(data.address).toMatch(/^(bc1|[13])/); // Valid Bitcoin address pattern
    }, 60000);
  });

  describe('getFrbtcIssuedData', () => {
    it('should fetch frBTC supply data from SDK', async () => {
      const data = await getFrbtcIssuedData();

      expect(data).toBeDefined();
      expect(data.frBtcIssued).toBeTypeOf('number');
      expect(data.frBtcIssued).toBeGreaterThan(0);
      expect(data.rawSupply).toBeTypeOf('string');
      expect(data.adjustedSupply).toBeTypeOf('string');
    }, 60000);
  });

  describe('getWrapHistoryData', () => {
    it.skipIf(process.env.CI)('should fetch wrap history with default pagination', async () => {
      const data = await getWrapHistoryData();

      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toBeTypeOf('number');
      expect(data.total).toBeGreaterThanOrEqual(0);

      if (data.items.length > 0) {
        const firstItem = data.items[0];
        expect(firstItem.txid).toBeTypeOf('string');
        expect(firstItem.amount).toBeTypeOf('number');
      }
    }, 60000);

    it.skipIf(process.env.CI)('should fetch wrap history with custom pagination', async () => {
      const count = 10;
      const offset = 0;
      const data = await getWrapHistoryData(count, offset);

      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.items.length).toBeLessThanOrEqual(count);
      expect(data.total).toBeTypeOf('number');
    }, 60000);
  });

  describe('getUnwrapHistoryData', () => {
    it.skipIf(process.env.CI)('should fetch unwrap history with default pagination', async () => {
      const data = await getUnwrapHistoryData();

      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.total).toBeTypeOf('number');
      expect(data.total).toBeGreaterThanOrEqual(0);

      if (data.items.length > 0) {
        const firstItem = data.items[0];
        expect(firstItem.txid).toBeTypeOf('string');
        expect(firstItem.amount).toBeTypeOf('number');
      }
    }, 60000);

    it.skipIf(process.env.CI)('should fetch unwrap history with custom pagination', async () => {
      const count = 10;
      const offset = 0;
      const data = await getUnwrapHistoryData(count, offset);

      expect(data).toBeDefined();
      expect(data.items).toBeInstanceOf(Array);
      expect(data.items.length).toBeLessThanOrEqual(count);
      expect(data.total).toBeTypeOf('number');
    }, 60000);
  });

  describe('getTotalUnwrapsData', () => {
    it('should fetch total unwraps data from SDK', async () => {
      const data = await getTotalUnwrapsData();

      expect(data).toBeDefined();
      expect(data.totalUnwraps).toBeTypeOf('number');
      expect(data.totalUnwraps).toBeGreaterThanOrEqual(0);
      expect(data.totalUnwrapsSatoshis).toBeTypeOf('string');
      expect(data.unwrapCount).toBeTypeOf('number');
      expect(data.unwrapCount).toBeGreaterThanOrEqual(0);
    }, 60000);
  });
});
