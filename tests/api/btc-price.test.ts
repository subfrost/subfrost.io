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

  it('returns BTC price from Subfrost API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          bitcoin: {
            usd: 99500.25,
          },
        },
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.btcPrice).toBe(99500.25);
  });

  it('calls Subfrost API with correct URL and method', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          bitcoin: { usd: 99500 },
        },
      }),
    });

    await GET();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet.subfrost.io/v4/subfrost/get-bitcoin-price',
      {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
      }
    );
  });

  it('returns error response when Subfrost API fails', async () => {
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
