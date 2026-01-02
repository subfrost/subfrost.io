/**
 * Unit tests for /api/wrap-unwrap-totals endpoint
 *
 * This endpoint fetches totals from OYL API:
 * - Total unwrap amount from get-total-unwrap-amount
 * - Total wrap amount by summing all wraps from get-all-wrap-history (paginated)
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after setting up mocks
import { GET } from '@/app/api/wrap-unwrap-totals/route';

// Helper to create mock wrap history response
function createWrapHistoryResponse(items: any[], total: number) {
  return {
    ok: true,
    json: async () => ({
      data: {
        items,
        total,
      },
    }),
  };
}

// Helper to create mock total unwrap response
function createTotalUnwrapResponse(totalAmount: string) {
  return {
    ok: true,
    json: async () => ({
      data: {
        totalAmount,
      },
    }),
  };
}

describe('GET /api/wrap-unwrap-totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns wrap/unwrap totals with correct structure', async () => {
    // Mock total unwrap call
    mockFetch.mockResolvedValueOnce(createTotalUnwrapResponse('175000000'));

    // Mock wrap history call (single page with 2 items)
    mockFetch.mockResolvedValueOnce(createWrapHistoryResponse(
      [
        { txid: 'wrap1', amount: '100000000' },
        { txid: 'wrap2', amount: '150000000' },
      ],
      2
    ));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalWrappedFrbtc).toBe('250000000'); // 100M + 150M satoshis
    expect(data.totalUnwrappedFrbtc).toBe('175000000');
    expect(data.totalWrappedBtc).toBe(2.5);
    expect(data.totalUnwrappedBtc).toBe(1.75);
    expect(data.wrapCount).toBe(2);
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe('number');
  });

  it('handles pagination for wrap history correctly', async () => {
    // Mock total unwrap call
    mockFetch.mockResolvedValueOnce(createTotalUnwrapResponse('50000000'));

    // Mock first page of wrap history
    mockFetch.mockResolvedValueOnce(createWrapHistoryResponse(
      Array(100).fill({ txid: 'wrap', amount: '1000000' }), // 100 items of 0.01 BTC each
      150 // Total is 150, so need another page
    ));

    // Mock second page of wrap history
    mockFetch.mockResolvedValueOnce(createWrapHistoryResponse(
      Array(50).fill({ txid: 'wrap', amount: '1000000' }), // 50 items of 0.01 BTC each
      150
    ));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    // 150 items * 1000000 satoshis = 150000000 satoshis = 1.5 BTC
    expect(data.totalWrappedFrbtc).toBe('150000000');
    expect(data.totalWrappedBtc).toBe(1.5);
    expect(data.wrapCount).toBe(150);

    // Should have made 3 fetch calls: 1 for total unwrap, 2 for wrap history pages
    expect(mockFetch).toHaveBeenCalledTimes(3);
  });

  it('handles empty wrap history', async () => {
    mockFetch.mockResolvedValueOnce(createTotalUnwrapResponse('0'));
    mockFetch.mockResolvedValueOnce(createWrapHistoryResponse([], 0));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalWrappedBtc).toBe(0);
    expect(data.totalUnwrappedBtc).toBe(0);
    expect(data.wrapCount).toBe(0);
  });

  it('handles OYL API error for total unwrap', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch wrap/unwrap totals.');
  });

  it('handles OYL API error for wrap history', async () => {
    mockFetch.mockResolvedValueOnce(createTotalUnwrapResponse('50000000'));
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch wrap/unwrap totals.');
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch wrap/unwrap totals.');
  });

  it('calls OYL API with correct parameters', async () => {
    mockFetch.mockResolvedValueOnce(createTotalUnwrapResponse('0'));
    mockFetch.mockResolvedValueOnce(createWrapHistoryResponse([], 0));

    await GET();

    // First call should be total unwrap amount
    expect(mockFetch).toHaveBeenNthCalledWith(
      1,
      'https://mainnet-api.oyl.gg/get-total-unwrap-amount',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
          'x-oyl-api-key': 'd6aebfed1769128379aca7d215f0b689',
        }),
      })
    );

    // Second call should be wrap history with pagination
    expect(mockFetch).toHaveBeenNthCalledWith(
      2,
      'https://mainnet-api.oyl.gg/get-all-wrap-history',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ count: 100, offset: 0 }),
      })
    );
  });

  it('handles large amounts correctly', async () => {
    const largeAmount = '99999999999999'; // Large satoshi amount
    mockFetch.mockResolvedValueOnce(createTotalUnwrapResponse(largeAmount));
    mockFetch.mockResolvedValueOnce(createWrapHistoryResponse(
      [{ txid: 'wrap1', amount: largeAmount }],
      1
    ));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalWrappedFrbtc).toBe(largeAmount);
    expect(data.totalUnwrappedFrbtc).toBe(largeAmount);
    // Verify BTC conversion is correct
    expect(data.totalWrappedBtc).toBe(Number(BigInt(largeAmount)) / 1e8);
  });
});
