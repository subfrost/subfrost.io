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

// Create mock function that can be controlled in tests
const mockGetFrbtcTotalSupply = vi.fn();

// Mock dependencies - these are hoisted, so we use inline mock functions
vi.mock('@/lib/alkanes-client', () => ({
  alkanesClient: {
    getFrbtcTotalSupply: mockGetFrbtcTotalSupply,
  },
}));

vi.mock('@/lib/redis', () => ({
  cacheGetOrCompute: vi.fn().mockImplementation(async <T>(
    _key: string,
    computeFn: () => Promise<T>,
  ): Promise<T> => {
    return computeFn();
  }),
}));

// Import after mocking
import { GET } from '@/app/api/frbtc-issued/route';

describe('GET /api/frbtc-issued', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetFrbtcTotalSupply.mockResolvedValue(mockFrbtcSupplyData);
  });

  it('returns frBTC issued data with correct structure', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.frBtcIssued).toBe(mockFrbtcSupplyData.btc);
    expect(data.rawSupply).toBe(mockFrbtcSupplyData.raw.toString());
    expect(data.adjustedSupply).toBe(mockFrbtcSupplyData.adjusted.toString());
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe('number');
  });

  it('calls alkanesClient.getFrbtcTotalSupply', async () => {
    await GET();

    expect(mockGetFrbtcTotalSupply).toHaveBeenCalledTimes(1);
  });

  it('returns error response when alkanesClient fails', async () => {
    mockGetFrbtcTotalSupply.mockRejectedValueOnce(new Error('RPC error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch frBTC supply.');
  });

  it('serializes bigint values correctly as strings', async () => {
    const response = await GET();
    const data = await response.json();

    // BigInt values should be serialized as strings
    expect(typeof data.rawSupply).toBe('string');
    expect(typeof data.adjustedSupply).toBe('string');
    expect(BigInt(data.rawSupply)).toBe(mockFrbtcSupplyData.raw);
    expect(BigInt(data.adjustedSupply)).toBe(mockFrbtcSupplyData.adjusted);
  });
});
