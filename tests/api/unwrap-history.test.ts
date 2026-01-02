/**
 * Unit tests for /api/unwrap-history endpoint
 *
 * This endpoint calls the OYL mainnet API to get unwrap history with pagination.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after setting up mocks
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
    const mockItems = [
      { txid: 'abc123', amount: '100000000', blockHeight: 100000 },
      { txid: 'def456', amount: '50000000', blockHeight: 99999 },
    ];

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: mockItems,
          total: 50,
        },
      }),
    });

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.items).toHaveLength(2);
    expect(data.data.total).toBe(50);

    // Verify default pagination was used
    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet-api.oyl.gg/get-all-unwrap-history',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ count: 25, offset: 0 }),
      })
    );
  });

  it('passes pagination parameters correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: [],
          total: 0,
        },
      }),
    });

    await GET(createMockRequest({ count: '50', offset: '100' }));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet-api.oyl.gg/get-all-unwrap-history',
      expect.objectContaining({
        body: JSON.stringify({ count: 50, offset: 100 }),
      })
    );
  });

  it('includes required headers in OYL API call', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: { items: [], total: 0 },
      }),
    });

    await GET(createMockRequest());

    expect(mockFetch).toHaveBeenCalledWith(
      expect.any(String),
      expect.objectContaining({
        headers: expect.objectContaining({
          'accept': 'application/json',
          'content-type': 'application/json',
          'x-oyl-api-key': 'd6aebfed1769128379aca7d215f0b689',
        }),
      })
    );
  });

  it('handles OYL API errors gracefully', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch unwrap history.');
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch unwrap history.');
  });

  it('returns empty array when no unwraps exist', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: [],
          total: 0,
        },
      }),
    });

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data.items).toHaveLength(0);
    expect(data.data.total).toBe(0);
  });

  it('preserves all item properties from OYL response', async () => {
    const mockItem = {
      txid: 'abc123',
      amount: '100000000',
      blockHeight: 100000,
      timestamp: '2024-01-01T00:00:00Z',
      recipientAddress: 'bc1q...',
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: [mockItem],
          total: 1,
        },
      }),
    });

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(data.data.items[0]).toEqual(mockItem);
  });
});
