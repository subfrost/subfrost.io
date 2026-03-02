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

  it('returns BTC price from mempool.space API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        time: 1772443502,
        USD: 66524,
        EUR: 56634,
        GBP: 49737,
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.btcPrice).toBe(66524);
  });

  it('calls mempool.space API with correct URL', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        time: 1772443502,
        USD: 66524,
      }),
    });

    await GET();

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mempool.space/api/v1/prices'
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
