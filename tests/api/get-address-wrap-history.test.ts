/**
 * Unit tests for /api/get-address-wrap-history endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { POST } from '@/app/api/get-address-wrap-history/route';

// Helper to create mock request
function createMockRequest(
  body: Record<string, any>,
  params: Record<string, string> = {}
): Request {
  const url = new URL('http://localhost:3000/api/get-address-wrap-history');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new Request(url.toString(), {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/get-address-wrap-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns wrap history for a valid address', async () => {
    const mockData = {
      data: {
        items: [
          { transactionId: 'abc123', amount: '100000000', timestamp: '2024-01-01T00:00:00Z', address: 'bc1p...' },
          { transactionId: 'def456', amount: '50000000', timestamp: '2024-01-02T00:00:00Z', address: 'bc1p...' },
        ],
        total: 2,
      },
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const response = await POST(createMockRequest({ address: 'bc1ptest123' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockData);
  });

  it('returns 400 error when address is missing', async () => {
    const response = await POST(createMockRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Address is required.');
    expect(mockFetch).not.toHaveBeenCalled();
  });

  it('passes pagination parameters to OYL API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { items: [], total: 0 } }),
    });

    await POST(createMockRequest(
      { address: 'bc1ptest123' },
      { count: '50', offset: '100' }
    ));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet-api.oyl.gg/get-address-wrap-history',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ address: 'bc1ptest123', count: 50, offset: 100 }),
      })
    );
  });

  it('uses default pagination values', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { items: [], total: 0 } }),
    });

    await POST(createMockRequest({ address: 'bc1ptest123' }));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        body: JSON.stringify({ address: 'bc1ptest123', count: 25, offset: 0 }),
      })
    );
  });

  it('returns error response when OYL API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await POST(createMockRequest({ address: 'bc1ptest123' }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch address wrap history.');
  });

  it('includes OYL API key in request headers', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { items: [], total: 0 } }),
    });

    await POST(createMockRequest({ address: 'bc1ptest123' }));

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'x-oyl-api-key': expect.any(String),
        }),
      })
    );
  });

  it('handles empty wrap history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: { items: [], total: 0 } }),
    });

    const response = await POST(createMockRequest({ address: 'bc1ptest123' }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.items).toEqual([]);
    expect(data.data.total).toBe(0);
  });
});
