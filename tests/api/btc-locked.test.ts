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

// Mock Redis
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

// Mock sync service
vi.mock('@/lib/sync-service', () => ({
  syncBtcLocked: vi.fn(),
  getLatestBtcLocked: vi.fn(),
}));

// Mock alkanes-client (needed for address)
vi.mock('@/lib/alkanes-client', () => ({
  alkanesClient: {
    getBtcLocked: vi.fn(),
  },
}));

// Import after mocking
import { GET } from '@/app/api/btc-locked/route';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncBtcLocked } from '@/lib/sync-service';
import { alkanesClient } from '@/lib/alkanes-client';

describe('GET /api/btc-locked', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as any).mockResolvedValue(null); // Default: no cache
    (alkanesClient.getBtcLocked as any).mockResolvedValue(mockBtcLockedData);
  });

  it('returns BTC locked data with correct structure', async () => {
    (syncBtcLocked as any).mockResolvedValue({
      btcLocked: mockBtcLockedData.btc,
      satoshis: mockBtcLockedData.satoshis,
      utxoCount: mockBtcLockedData.utxoCount,
      address: mockBtcLockedData.address,
      blockHeight: 100000,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.btcLocked).toBe(mockBtcLockedData.btc);
    expect(data.satoshis).toBe(mockBtcLockedData.satoshis);
    expect(data.utxoCount).toBe(mockBtcLockedData.utxoCount);
    expect(data.address).toBe(mockBtcLockedData.address);
    expect(data.blockHeight).toBe(100000);
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe('number');
  });

  it('returns cached result when available', async () => {
    const cachedData = {
      btcLocked: 2.5,
      satoshis: 250000000,
      utxoCount: 10,
      address: mockBtcLockedData.address,
      blockHeight: 99999,
      timestamp: Date.now(),
    };
    (cacheGet as any).mockResolvedValue(cachedData);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.btcLocked).toBe(2.5);
    expect(syncBtcLocked).not.toHaveBeenCalled();
  });

  it('returns error response when sync fails', async () => {
    (syncBtcLocked as any).mockRejectedValue(new Error('Database error'));
    (alkanesClient.getBtcLocked as any).mockRejectedValue(new Error('RPC error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch BTC balance.');
  });

  it('returns correct numeric types', async () => {
    (syncBtcLocked as any).mockResolvedValue({
      btcLocked: mockBtcLockedData.btc,
      satoshis: mockBtcLockedData.satoshis,
      utxoCount: mockBtcLockedData.utxoCount,
      address: mockBtcLockedData.address,
      blockHeight: 100000,
    });

    const response = await GET();
    const data = await response.json();

    expect(typeof data.btcLocked).toBe('number');
    expect(typeof data.satoshis).toBe('number');
    expect(typeof data.utxoCount).toBe('number');
  });
});
