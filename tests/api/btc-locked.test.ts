/**
 * Unit tests for /api/btc-locked endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock data
const mockBtcLockedData = {
  satoshis: 123456789,
  btc: 1.23456789,
  utxoCount: 42,
  address: 'bc1puvfmy5whzdq35nd2trckkm09em9u7ps6lal564jz92c9feswwrpsr7ach5',
};

// Create mock function that can be controlled in tests
const mockGetBtcLocked = vi.fn();

// Mock dependencies - these are hoisted, so we use inline mock functions
vi.mock('@/lib/alkanes-client', () => ({
  alkanesClient: {
    getBtcLocked: mockGetBtcLocked,
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
import { GET } from '@/app/api/btc-locked/route';

describe('GET /api/btc-locked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    mockGetBtcLocked.mockResolvedValue(mockBtcLockedData);
  });

  it('returns BTC locked data with correct structure', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.btcLocked).toBe(mockBtcLockedData.btc);
    expect(data.satoshis).toBe(mockBtcLockedData.satoshis);
    expect(data.utxoCount).toBe(mockBtcLockedData.utxoCount);
    expect(data.address).toBe(mockBtcLockedData.address);
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe('number');
  });

  it('calls alkanesClient.getBtcLocked', async () => {
    await GET();

    expect(mockGetBtcLocked).toHaveBeenCalledTimes(1);
  });

  it('returns error response when alkanesClient fails', async () => {
    mockGetBtcLocked.mockRejectedValueOnce(new Error('RPC error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch BTC balance.');
  });

  it('returns correct numeric types', async () => {
    const response = await GET();
    const data = await response.json();

    expect(typeof data.btcLocked).toBe('number');
    expect(typeof data.satoshis).toBe('number');
    expect(typeof data.utxoCount).toBe('number');
  });
});
