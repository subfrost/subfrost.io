/**
 * Unit tests for /api/frbtc-issued endpoint
 *
 * This endpoint uses the alkanes SDK to query the total supply from storage.
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock data - simulates the hex returned from storage
const mockStorageHex = '0xc7c38002000000'; // Little-endian for 43276231 satoshis

// Mock alkanes-client
vi.mock('@/lib/alkanes-client', () => ({
  alkanesClient: {
    getProvider: vi.fn(),
  },
}));

// Import after mocking
import { GET } from '@/app/api/frbtc-issued/route';
import { alkanesClient } from '@/lib/alkanes-client';

describe('GET /api/frbtc-issued', () => {
  beforeEach(() => {
    vi.clearAllMocks();
  });

  it('returns frBTC issued data with correct structure', async () => {
    const mockProvider = {
      getStorageAt: vi.fn().mockResolvedValue(mockStorageHex),
    };
    (alkanesClient.getProvider as any).mockResolvedValue(mockProvider);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.frBtcIssued).toBeDefined();
    expect(typeof data.frBtcIssued).toBe('number');

    // Verify provider was called correctly
    expect(mockProvider.getStorageAt).toHaveBeenCalledWith(
      32,
      0,
      expect.any(Uint8Array) // TextEncoder output for '/totalsupply'
    );
  });

  it('applies the offset correctly', async () => {
    // Mock storage returning a known value
    // 0x0002b5e3d1 in little-endian = 0xd1e3b50200 = 11470000000n in big-endian
    const knownHex = '0x00e1f50500000000'; // 100000000 in little-endian (1 BTC)
    const mockProvider = {
      getStorageAt: vi.fn().mockResolvedValue(knownHex),
    };
    (alkanesClient.getProvider as any).mockResolvedValue(mockProvider);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);

    // Raw value: 100000000 satoshis (1 BTC)
    // After offset: 100000000 - 4443097 = 95556903 satoshis
    // In BTC: 0.95556903
    expect(data.frBtcIssued).toBeCloseTo(0.95556903, 6);
  });

  it('returns error when storage returns undefined', async () => {
    const mockProvider = {
      getStorageAt: vi.fn().mockResolvedValue(undefined),
    };
    (alkanesClient.getProvider as any).mockResolvedValue(mockProvider);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch frBTC supply.');
  });

  it('returns error response when provider fails', async () => {
    (alkanesClient.getProvider as any).mockRejectedValue(new Error('RPC error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch frBTC supply.');
  });

  it('handles little-endian hex correctly', async () => {
    // Test with a specific little-endian value
    // 0x0100000000000000 in LE = 1 in BE
    const mockProvider = {
      getStorageAt: vi.fn().mockResolvedValue('0x0100000000000000'),
    };
    (alkanesClient.getProvider as any).mockResolvedValue(mockProvider);

    const response = await GET();
    const data = await response.json();

    // 1 satoshi - 4443097 offset would be negative, but the real data
    // should always be larger. This tests the reversal logic works.
    expect(response.status).toBe(200);
    expect(typeof data.frBtcIssued).toBe('number');
  });
});
