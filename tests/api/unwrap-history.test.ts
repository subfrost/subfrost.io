/**
 * Unit tests for /api/unwrap-history endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { GET } from '@/app/api/unwrap-history/route';

// Helper to create mock request
function createMockRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost:3000/api/unwrap-history');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new Request(url.toString());
}

describe('GET /api/unwrap-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns unwrap history with default pagination', async () => {
    const mockData = {
      data: {
        items: [
          { txid: 'abc123', amount: '100000000', timestamp: 1702500000 },
          { txid: 'def456', amount: '50000000', timestamp: 1702510000 },
        ],
        total: 50,
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
      'https://mainnet-api.oyl.gg/get-all-unwrap-history',
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
    expect(data.error).toBe('Failed to fetch unwrap history.');
  });
});
