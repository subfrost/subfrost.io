/**
 * Unit tests for /api/total-unwraps endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after mocking
import { GET } from '@/app/api/total-unwraps/route';

describe('GET /api/total-unwraps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns total unwraps calculated from all pages', async () => {
    // Mock first page with total indicating more pages
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: [
            { amount: '100000000' }, // 1 BTC
            { amount: '50000000' },  // 0.5 BTC
          ],
          total: 3,
        },
      }),
    });

    // Mock second page
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: [
            { amount: '25000000' }, // 0.25 BTC
          ],
          total: 3,
        },
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe(1.75); // 1 + 0.5 + 0.25 BTC
  });

  it('returns single page result correctly', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: [
            { amount: '200000000' }, // 2 BTC
          ],
          total: 1,
        },
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe(2);
  });

  it('handles empty unwrap history', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: [],
          total: 0,
        },
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe(0);
  });

  it('returns error response when OYL API fails', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: false,
      status: 500,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch total unwraps.');
  });

  it('handles items without amount field', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          items: [
            { amount: '100000000' },
            { txid: 'abc' }, // No amount field
            { amount: '50000000' },
          ],
          total: 3,
        },
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe(1.5); // Only items with amount are counted
  });
});
