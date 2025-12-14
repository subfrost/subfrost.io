/**
 * Unit tests for /api/wrap-history endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { GET } from '@/app/api/wrap-history/route';

// Helper to create mock request
function createMockRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost:3000/api/wrap-history');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new Request(url.toString());
}

describe('GET /api/wrap-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns wrap history with default pagination', async () => {
    const mockData = {
      data: {
        items: [
          { txid: 'abc123', amount: '100000000', timestamp: 1702500000 },
          { txid: 'def456', amount: '50000000', timestamp: 1702510000 },
        ],
        total: 100,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockData);
  });

  it('passes pagination parameters to OYL API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { items: [], total: 0 } }),
    });

    await GET(createMockRequest({ count: '50', offset: '100' }));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet-api.oyl.gg/get-all-wrap-history',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ count: 50, offset: 100 }),
      })
    );
  });

  it('uses default pagination values', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { items: [], total: 0 } }),
    });

    await GET(createMockRequest());

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ count: 25, offset: 0 }),
      })
    );
  });

  it('returns error response when OYL API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch wrap history.');
  });

  it('includes OYL API key in request headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { items: [], total: 0 } }),
    });

    await GET(createMockRequest());

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-oyl-api-key': expect.any(String),
        }),
      })
    );
  });
});
