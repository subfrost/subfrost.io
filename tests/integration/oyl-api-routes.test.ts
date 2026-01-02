/**
 * Integration Tests for OYL-based API Routes
 *
 * These tests verify that the updated API routes work correctly with the OYL mainnet API.
 * They can run either:
 * 1. Against live OYL API directly (without Next.js server)
 * 2. Against the local Next.js dev server
 *
 * To run these tests:
 *   RUN_INTEGRATION=true pnpm test tests/integration/oyl-api-routes.test.ts
 *
 * To run against local dev server:
 *   RUN_INTEGRATION=true API_BASE_URL=http://localhost:3000 pnpm test tests/integration/oyl-api-routes.test.ts
 *
 * @vitest-environment node
 */

import { describe, it, expect, beforeAll } from 'vitest';

// Skip all tests unless explicitly running integration tests
const runIntegration = process.env.RUN_INTEGRATION === 'true';

// OYL API configuration
const OYL_API_KEY = 'd6aebfed1769128379aca7d215f0b689';
const OYL_BASE_URL = 'https://mainnet-api.oyl.gg';

// Test timeout for network calls
const TEST_TIMEOUT = 60000;

// Optional: test against local Next.js server
const API_BASE = process.env.API_BASE_URL;
const testLocalApi = !!API_BASE;

// Helper to fetch from OYL API directly
async function fetchOylApi(endpoint: string, body: object = {}) {
  const response = await fetch(`${OYL_BASE_URL}${endpoint}`, {
    method: 'POST',
    headers: {
      'accept': 'application/json',
      'content-type': 'application/json',
      'x-oyl-api-key': OYL_API_KEY,
    },
    body: JSON.stringify(body),
  });
  return {
    response,
    data: await response.json(),
  };
}

// Helper to fetch from local API (if running)
async function fetchLocalApi(path: string, options?: RequestInit) {
  if (!API_BASE) throw new Error('API_BASE_URL not set');
  const url = `${API_BASE}${path}`;
  const response = await fetch(url, options);
  return {
    response,
    data: await response.json(),
  };
}

describe.skipIf(!runIntegration)('OYL API Direct Tests', () => {
  describe('get-total-unwrap-amount', () => {
    it(
      'should return total unwrap amount',
      async () => {
        const { response, data } = await fetchOylApi('/get-total-unwrap-amount');

        expect(response.ok).toBe(true);
        expect(data.data).toBeDefined();
        expect(data.data.totalAmount).toBeDefined();

        // totalAmount should be a string representing satoshis
        const totalAmount = BigInt(data.data.totalAmount);
        expect(totalAmount).toBeGreaterThanOrEqual(0n);

        console.log(`OYL Total Unwrap Amount: ${data.data.totalAmount} satoshis (${Number(totalAmount) / 1e8} BTC)`);
      },
      TEST_TIMEOUT
    );
  });

  describe('get-all-wrap-history', () => {
    it(
      'should return wrap history with pagination',
      async () => {
        const { response, data } = await fetchOylApi('/get-all-wrap-history', {
          count: 10,
          offset: 0,
        });

        expect(response.ok).toBe(true);
        expect(data.data).toBeDefined();
        expect(data.data.items).toBeDefined();
        expect(Array.isArray(data.data.items)).toBe(true);
        expect(typeof data.data.total).toBe('number');

        if (data.data.items.length > 0) {
          const item = data.data.items[0];
          // OYL API uses 'transactionId' not 'txid'
          expect(item).toHaveProperty('transactionId');
          expect(item).toHaveProperty('amount');
          expect(item).toHaveProperty('address');
          expect(item).toHaveProperty('timestamp');

          // Verify amount is a valid number string
          const amount = BigInt(item.amount);
          expect(amount).toBeGreaterThan(0n);
        }

        console.log(`OYL Wrap History: ${data.data.total} total wraps, fetched ${data.data.items.length} items`);
      },
      TEST_TIMEOUT
    );

    it(
      'should handle pagination correctly',
      async () => {
        // Fetch first page
        const page1 = await fetchOylApi('/get-all-wrap-history', {
          count: 5,
          offset: 0,
        });

        // Fetch second page
        const page2 = await fetchOylApi('/get-all-wrap-history', {
          count: 5,
          offset: 5,
        });

        expect(page1.response.ok).toBe(true);
        expect(page2.response.ok).toBe(true);

        // Both pages should have items (assuming there are at least 10 wraps)
        if (page1.data.data.total >= 10) {
          expect(page1.data.data.items.length).toBe(5);
          expect(page2.data.data.items.length).toBe(5);

          // Items should be different (OYL uses 'transactionId')
          const page1Txids = page1.data.data.items.map((i: any) => i.transactionId);
          const page2Txids = page2.data.data.items.map((i: any) => i.transactionId);
          const overlap = page1Txids.filter((t: string) => page2Txids.includes(t));
          expect(overlap.length).toBe(0);
        }
      },
      TEST_TIMEOUT
    );
  });

  describe('get-all-unwrap-history', () => {
    it(
      'should return unwrap history with pagination',
      async () => {
        const { response, data } = await fetchOylApi('/get-all-unwrap-history', {
          count: 10,
          offset: 0,
        });

        expect(response.ok).toBe(true);
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

        console.log(`OYL Unwrap History: ${data.data.total} total unwraps, fetched ${data.data.items.length} items`);
      },
      TEST_TIMEOUT
    );
  });

  describe('Data consistency', () => {
    it(
      'should have total unwrap amount matching sum of unwrap history',
      async () => {
        // Get total unwrap amount
        const totalResult = await fetchOylApi('/get-total-unwrap-amount');
        const reportedTotal = BigInt(totalResult.data.data.totalAmount);

        // Fetch all unwraps and sum them (only first 100 for speed)
        const historyResult = await fetchOylApi('/get-all-unwrap-history', {
          count: 100,
          offset: 0,
        });

        const items = historyResult.data.data.items;
        const sumFromHistory = items.reduce((sum: bigint, item: any) => sum + BigInt(item.amount), 0n);

        console.log(`Reported Total: ${reportedTotal} satoshis`);
        console.log(`Sum of first ${items.length} unwraps: ${sumFromHistory} satoshis`);
        console.log(`Total unwrap count: ${historyResult.data.data.total}`);

        // If we fetched all items, they should match
        if (items.length === historyResult.data.data.total) {
          expect(sumFromHistory).toBe(reportedTotal);
        } else {
          // Otherwise, sum should be <= total (we only have partial data)
          expect(sumFromHistory).toBeLessThanOrEqual(reportedTotal);
        }
      },
      TEST_TIMEOUT
    );

    it(
      'should be able to sum all wrap amounts via pagination',
      async () => {
        let totalAmount = 0n;
        let offset = 0;
        const pageSize = 100;
        let totalCount = 0;

        // Fetch all wraps (limit to 500 for test speed)
        while (offset < 500) {
          const { data } = await fetchOylApi('/get-all-wrap-history', {
            count: pageSize,
            offset,
          });

          const items = data.data?.items || [];
          totalCount = data.data?.total || 0;

          for (const item of items) {
            totalAmount += BigInt(item.amount);
          }

          if (items.length < pageSize || offset + items.length >= totalCount) {
            break;
          }

          offset += pageSize;
        }

        console.log(`Total wrapped amount (from ${Math.min(totalCount, 500)} items): ${totalAmount} satoshis (${Number(totalAmount) / 1e8} BTC)`);
        console.log(`Total wrap count: ${totalCount}`);

        expect(totalAmount).toBeGreaterThan(0n);
        expect(totalCount).toBeGreaterThan(0);
      },
      TEST_TIMEOUT * 3 // Allow more time for pagination
    );
  });
});

describe.skipIf(!runIntegration || !testLocalApi)('Local API Route Tests', () => {
  beforeAll(() => {
    console.log(`Testing against local API at: ${API_BASE}`);
  });

  describe('/api/total-unwraps', () => {
    it(
      'should return total unwraps in expected format',
      async () => {
        const { response, data } = await fetchLocalApi('/api/total-unwraps');

        expect(response.status).toBe(200);
        expect(data.totalUnwraps).toBeDefined();

        // The route returns totalUnwraps as a string (satoshis)
        expect(typeof data.totalUnwraps).toBe('string');
        const satoshis = BigInt(data.totalUnwraps);
        expect(satoshis).toBeGreaterThan(0n);

        console.log(`Total Unwraps: ${data.totalUnwraps} satoshis`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/wrap-history', () => {
    it(
      'should return wrap history from OYL API',
      async () => {
        const { response, data } = await fetchLocalApi('/api/wrap-history?count=10&offset=0');

        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        expect(data.data.items).toBeDefined();
        expect(Array.isArray(data.data.items)).toBe(true);
        expect(typeof data.data.total).toBe('number');

        if (data.data.items.length > 0) {
          const item = data.data.items[0];
          expect(item).toHaveProperty('txid');
          expect(item).toHaveProperty('amount');
        }

        console.log(`Wrap History: ${data.data.total} total, fetched ${data.data.items.length}`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/unwrap-history', () => {
    it(
      'should return unwrap history from OYL API',
      async () => {
        const { response, data } = await fetchLocalApi('/api/unwrap-history?count=10&offset=0');

        expect(response.status).toBe(200);
        expect(data.data).toBeDefined();
        expect(data.data.items).toBeDefined();
        expect(Array.isArray(data.data.items)).toBe(true);
        expect(typeof data.data.total).toBe('number');

        if (data.data.items.length > 0) {
          const item = data.data.items[0];
          expect(item).toHaveProperty('txid');
          expect(item).toHaveProperty('amount');
        }

        console.log(`Unwrap History: ${data.data.total} total, fetched ${data.data.items.length}`);
      },
      TEST_TIMEOUT
    );
  });

  describe('/api/wrap-unwrap-totals', () => {
    it(
      'should return wrap/unwrap totals in expected format',
      async () => {
        const { response, data } = await fetchLocalApi('/api/wrap-unwrap-totals');

        expect(response.status).toBe(200);

        // Check all expected fields
        expect(data.totalWrappedFrbtc).toBeDefined();
        expect(data.totalUnwrappedFrbtc).toBeDefined();
        expect(data.totalWrappedBtc).toBeDefined();
        expect(data.totalUnwrappedBtc).toBeDefined();
        expect(data.wrapCount).toBeDefined();
        expect(data.timestamp).toBeDefined();

        // Verify types
        expect(typeof data.totalWrappedFrbtc).toBe('string');
        expect(typeof data.totalUnwrappedFrbtc).toBe('string');
        expect(typeof data.totalWrappedBtc).toBe('number');
        expect(typeof data.totalUnwrappedBtc).toBe('number');
        expect(typeof data.wrapCount).toBe('number');
        expect(typeof data.timestamp).toBe('number');

        // Verify values are reasonable
        expect(data.totalWrappedBtc).toBeGreaterThan(0);
        expect(data.totalUnwrappedBtc).toBeGreaterThanOrEqual(0);
        expect(data.wrapCount).toBeGreaterThan(0);

        console.log(`Wrap/Unwrap Totals:`);
        console.log(`  Wrapped: ${data.totalWrappedBtc} BTC (${data.wrapCount} txs)`);
        console.log(`  Unwrapped: ${data.totalUnwrappedBtc} BTC`);
      },
      TEST_TIMEOUT * 3 // This endpoint does pagination, needs more time
    );
  });

  describe('/api/frbtc-issued', () => {
    it(
      'should return frBTC issued amount',
      async () => {
        const { response, data } = await fetchLocalApi('/api/frbtc-issued');

        expect(response.status).toBe(200);
        expect(data.frBtcIssued).toBeDefined();
        expect(typeof data.frBtcIssued).toBe('number');
        expect(data.frBtcIssued).toBeGreaterThan(0);

        console.log(`frBTC Issued: ${data.frBtcIssued} BTC`);
      },
      TEST_TIMEOUT
    );
  });

  describe('Cross-endpoint consistency', () => {
    it(
      'should have consistent data between endpoints',
      async () => {
        // Fetch data from multiple endpoints
        const [totalUnwrapsResult, wrapUnwrapTotalsResult] = await Promise.all([
          fetchLocalApi('/api/total-unwraps'),
          fetchLocalApi('/api/wrap-unwrap-totals'),
        ]);

        expect(totalUnwrapsResult.response.status).toBe(200);
        expect(wrapUnwrapTotalsResult.response.status).toBe(200);

        const totalUnwrapsSatoshis = BigInt(totalUnwrapsResult.data.totalUnwraps);
        const totalsUnwrappedSatoshis = BigInt(wrapUnwrapTotalsResult.data.totalUnwrappedFrbtc);

        // These should match (both come from same OYL endpoint)
        expect(totalUnwrapsSatoshis).toBe(totalsUnwrappedSatoshis);

        console.log('Consistency check passed:');
        console.log(`  /api/total-unwraps: ${totalUnwrapsSatoshis} satoshis`);
        console.log(`  /api/wrap-unwrap-totals.totalUnwrappedFrbtc: ${totalsUnwrappedSatoshis} satoshis`);
      },
      TEST_TIMEOUT * 3
    );
  });
});
