/**
 * Unit tests for /api/frbtc-issued endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock data
const mockFrbtcSupplyData = {
  raw: 123456789n,
  adjusted: 119013692n,
  btc: 1.19013692,
};

// Mock Redis
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

// Mock sync service
vi.mock('@/lib/sync-service', () => ({
  syncFrbtcSupply: vi.fn(),
}));

// Import after mocking
import { GET } from '@/app/api/frbtc-issued/route';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncFrbtcSupply } from '@/lib/sync-service';

describe('GET /api/frbtc-issued', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as any).mockResolvedValue(null); // Default: no cache
  });

  it('returns frBTC issued data with correct structure', async () => {
    (syncFrbtcSupply as any).mockResolvedValue({
      frbtcIssued: mockFrbtcSupplyData.btc,
      rawSupply: mockFrbtcSupplyData.raw.toString(),
      adjustedSupply: mockFrbtcSupplyData.adjusted.toString(),
      blockHeight: 100000,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.frBtcIssued).toBe(mockFrbtcSupplyData.btc);
    expect(data.rawSupply).toBe(mockFrbtcSupplyData.raw.toString());
    expect(data.adjustedSupply).toBe(mockFrbtcSupplyData.adjusted.toString());
    expect(data.blockHeight).toBe(100000);
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe('number');
  });

  it('returns cached result when available', async () => {
    const cachedData = {
      frBtcIssued: 2.5,
      rawSupply: '250000000',
      adjustedSupply: '240000000',
      blockHeight: 99999,
      timestamp: Date.now(),
    };
    (cacheGet as any).mockResolvedValue(cachedData);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.frBtcIssued).toBe(2.5);
    expect(syncFrbtcSupply).not.toHaveBeenCalled();
  });

  it('returns error response when sync fails', async () => {
    (syncFrbtcSupply as any).mockRejectedValue(new Error('RPC error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch frBTC supply.');
  });

  it('serializes bigint values correctly as strings', async () => {
    (syncFrbtcSupply as any).mockResolvedValue({
      frbtcIssued: mockFrbtcSupplyData.btc,
      rawSupply: mockFrbtcSupplyData.raw.toString(),
      adjustedSupply: mockFrbtcSupplyData.adjusted.toString(),
      blockHeight: 100000,
    });

    const response = await GET();
    const data = await response.json();

    // BigInt values should be serialized as strings
    expect(typeof data.rawSupply).toBe('string');
    expect(typeof data.adjustedSupply).toBe('string');
    expect(BigInt(data.rawSupply)).toBe(mockFrbtcSupplyData.raw);
    expect(BigInt(data.adjustedSupply)).toBe(mockFrbtcSupplyData.adjusted);
  });
});
