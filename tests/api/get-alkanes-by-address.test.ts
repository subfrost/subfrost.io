/**
 * Unit tests for /api/get-alkanes-by-address endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { POST } from '@/app/api/get-alkanes-by-address/route';

// Helper to create mock request
function createMockRequest(body: Record<string, unknown>): Request {
  return new Request('http://localhost:3000/api/get-alkanes-by-address', {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify(body),
  });
}

describe('POST /api/get-alkanes-by-address', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns alkane balances for a valid address', async () => {
    const mockData = {
      data: [
        { alkane_id: { block: 32, tx: 0 }, balance: '100000000', symbol: 'frBTC' },
        { alkane_id: { block: 2, tx: 0 }, balance: '500000000', symbol: 'DIESEL' },
      ],
    };

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => mockData,
    });

    const response = await POST(createMockRequest({
      address: 'bc1puvfmy5whzdq35nd2trckkm09em9u7ps6lal564jz92c9feswwrpsr7ach5',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data).toEqual(mockData);
  });

  it('returns 400 error when address is missing', async () => {
    const response = await POST(createMockRequest({}));
    const data = await response.json();

    expect(response.status).toBe(400);
    expect(data.error).toBe('Address is required.');
  });

  it('calls OYL API with correct address', async () => {
    const testAddress = 'bc1qtest123';

    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    await POST(createMockRequest({ address: testAddress }));

    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet-api.oyl.gg/get-alkanes-by-address',
      expect.objectContaining({
        method: 'POST',
        body: JSON.stringify({ address: testAddress }),
      })
    );
  });

  it('returns error response when OYL API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await POST(createMockRequest({
      address: 'bc1qtest123',
    }));
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch alkanes by address.');
  });

  it('handles empty balance array', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({ data: [] }),
    });

    const response = await POST(createMockRequest({
      address: 'bc1qtest123',
    }));
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.data).toEqual([]);
  });
});
