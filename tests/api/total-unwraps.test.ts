/**
 * Unit tests for /api/total-unwraps endpoint
 *
 * This endpoint calls the OYL mainnet API to get total unwrap amount.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock fetch globally
const mockFetch = vi.fn();
global.fetch = mockFetch;

// Import after setting up mocks
import { GET } from '@/app/api/total-unwraps/route';

describe('GET /api/total-unwraps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns total unwraps from OYL API', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          totalAmount: '89494469', // satoshis
        },
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe('89494469');

    // Verify correct API call
    expect(mockFetch).toHaveBeenCalledWith(
      'https://mainnet-api.oyl.gg/get-total-unwrap-amount',
      expect.objectContaining({
        method: 'POST',
        headers: expect.objectContaining({
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

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch total unwraps.');
  });

  it('handles network errors gracefully', async () => {
    mockFetch.mockRejectedValueOnce(new Error('Network error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch total unwraps.');
  });

  it('handles zero unwraps', async () => {
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          totalAmount: '0',
        },
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe('0');
  });

  it('handles large amounts correctly', async () => {
    const largeAmount = '999999999999999'; // Large satoshi amount
    mockFetch.mockResolvedValueOnce({
      ok: true,
      json: async () => ({
        data: {
          totalAmount: largeAmount,
        },
      }),
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe(largeAmount);
  });
});
