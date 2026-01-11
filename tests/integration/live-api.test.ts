/**
 * Live Integration Tests for Subfrost.io API Routes
 *
 * These tests verify that all API routes work correctly against the live
 * infrastructure (CloudSQL, Redis, OYL API, and Subfrost RPC).
 *
 * To run these tests:
 *   pnpm test:live
 *
 * For API-specific tests:
 *   RUN_INTEGRATION=true vitest run tests/integration/live-api.test.ts
 *
 * Environment:
 *   ALKANES_RPC_URL - Override the default RPC endpoint (optional)
 */

import { describe, it, expect } from 'vitest';

// Skip all tests unless explicitly running integration tests
const runIntegration = process.env.RUN_INTEGRATION === 'true';

// Set longer timeout for network calls
const TEST_TIMEOUT = 60000; // 60 seconds

// Base URL for API requests - defaults to localhost for Next.js dev server
const API_BASE = process.env.API_BASE_URL || 'http://localhost:3000';

// Helper to make API requests
async function fetchApi(path: string, options?: RequestInit) {
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, options);
  return {
    response,
    data: await response.json(),
  };
}

describe.skipIf(!runIntegration)('Live API Integration Tests', () => {
  describe('/api/btc-locked', () => {
    it(
      'should return BTC locked data',
      async () => {
        const { response, data } = await fetchApi('/api/btc-locked');

        expect(response.status).toBe(200);
        expect(typeof data.btcLocked).toBe('number');
        expect(typeof data.satoshis).toBe('number');
        expect(typeof data.utxoCount).toBe('number');
        expect(typeof data.address).toBe('string');
        expect(typeof data.timestamp).toBe('number');

        // Sanity checks on values
        expect(data.btcLocked).toBeGreaterThan(0);
        expect(data.satoshis).toBeGreaterThan(0);
        expect(data.utxoCount).toBeGreaterThan(0);
        expect(data.address).toMatch(/^bc1p/); // Should be a P2TR address

        console.log(`BTC Locked: ${data.btcLocked} BTC (${data.utxoCount} UTXOs)`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/frbtc-issued', () => {
    it(
      'should return frBTC supply data',
      async () => {
        const { response, data } = await fetchApi('/api/frbtc-issued');

        expect(response.status).toBe(200);
        expect(typeof data.frBtcIssued).toBe('number');

        // Sanity checks on values
        expect(data.frBtcIssued).toBeGreaterThan(0);

        console.log(`frBTC Issued: ${data.frBtcIssued} BTC`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/btc-price', () => {
    it(
      'should return BTC price from CoinGecko',
      async () => {
        const { response, data } = await fetchApi('/api/btc-price');

        expect(response.status).toBe(200);
        expect(typeof data.btcPrice).toBe('number');

        // BTC price should be a reasonable number (> $1000)
        expect(data.btcPrice).toBeGreaterThan(1000);

        console.log(`BTC Price: $${data.btcPrice.toLocaleString()}`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/wrap-history', () => {
    it(
      'should return wrap history with pagination',
      async () => {
        const { response, data } = await fetchApi('/api/wrap-history?count=10&offset=0');

        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        expect(data.data.items).toBeDefined();
        expect(Array.isArray(data.data.items)).toBe(true);
        expect(typeof data.data.total).toBe('number');

        if (data.data.items.length > 0) {
          const item = data.data.items[0];
          // OYL API uses 'transactionId' not 'txid'
          expect(item).toHaveProperty('transactionId');
          expect(item).toHaveProperty('amount');
        }

        console.log(`Found ${data.data.total} total wrap transactions`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/unwrap-history', () => {
    it(
      'should return unwrap history with pagination',
      async () => {
        const { response, data } = await fetchApi('/api/unwrap-history?count=10&offset=0');

        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        expect(data.data.items).toBeDefined();
        expect(Array.isArray(data.data.items)).toBe(true);
        expect(typeof data.data.total).toBe('number');

        if (data.data.items.length > 0) {
          const item = data.data.items[0];
          // OYL API uses 'transactionId' not 'txid'
          expect(item).toHaveProperty('transactionId');
          expect(item).toHaveProperty('amount');
        }

        console.log(`Found ${data.data.total} total unwrap transactions`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/total-unwraps', () => {
    it(
      'should return total unwrapped amount',
      async () => {
        const { response, data } = await fetchApi('/api/total-unwraps');

        expect(response.status).toBe(200);
        // Note: This endpoint returns satoshis as a string
        expect(typeof data.totalUnwraps).toBe('string');
        const satoshis = BigInt(data.totalUnwraps);
        expect(satoshis).toBeGreaterThanOrEqual(0n);

        const btcValue = Number(satoshis) / 1e8;
        console.log(`Total Unwraps: ${data.totalUnwraps} satoshis (${btcValue} BTC)`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/health', () => {
    it(
      'should return healthy status when database is connected',
      async () => {
        const { response, data } = await fetchApi('/api/health');

        expect(response.status).toBe(200);
        expect(data.status).toBe('healthy');
        expect(data.checks.app.status).toBe('ok');
        expect(data.checks.database.status).toBe('ok');
        expect(typeof data.checks.database.latency).toBe('number');
        expect(data.timestamp).toBeDefined();

        console.log(`Health: ${data.status}, DB latency: ${data.checks.database.latency}ms`);
      },
      TEST_TIMEOUT
    );
  });

  describe('Data consistency checks', () => {
    it(
      'BTC locked should be >= frBTC issued (accounting for fees)',
      async () => {
        const [btcLockedResult, frbtcResult] = await Promise.all([
          fetchApi('/api/btc-locked'),
          fetchApi('/api/frbtc-issued'),
        ]);

        expect(btcLockedResult.response.status).toBe(200);
        expect(frbtcResult.response.status).toBe(200);

        const btcLocked = btcLockedResult.data.btcLocked;
        const frbtcIssued = frbtcResult.data.frBtcIssued;

        console.log(`BTC Locked: ${btcLocked} BTC`);
        console.log(`frBTC Issued: ${frbtcIssued} BTC`);
        console.log(`Difference: ${(btcLocked - frbtcIssued).toFixed(8)} BTC`);

        // BTC locked should be at least as much as frBTC issued
        // There may be some variance due to fees or timing
        expect(btcLocked).toBeGreaterThanOrEqual(frbtcIssued * 0.95);
      },
      TEST_TIMEOUT
    );
  });
});
