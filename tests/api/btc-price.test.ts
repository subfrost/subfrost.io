/**
 * Unit tests for /api/btc-price endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { GET } from '@/app/api/btc-price/route';

describe('GET /api/btc-price', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns BTC price from subpricer API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        source: 'uniswap-v3',
        timestamp: 1772443502,
        usd: 66524,
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.btcPrice).toBe(66524);
  });

  it('calls subpricer API with correct URL and options', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        source: 'uniswap-v3',
        timestamp: 1772443502,
        usd: 66524,
      }),
    });

    await GET();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet.subfrost.io/v4/subfrost/api/v1/bitcoin-price',
      expect.objectContaining({
        headers: { accept: 'application/json' },
      })
    );
  });

  it('returns error response when mempool.space API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 429,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch BTC price.');
  });

  it('returns error response on network error', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch BTC price.');
  });
});
