/**
 * Unit tests for /api/wrap-unwrap-totals endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock Redis
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

// Mock sync service
vi.mock('@/lib/sync-service', () => ({
  syncWrapUnwrapTransactions: vi.fn(),
  getAggregatedTotals: vi.fn(),
}));

// Mock alkanes client
vi.mock('@/lib/alkanes-client', () => ({
  alkanesClient: {
    getCurrentHeight: vi.fn(),
  },
}));

// Import after mocking
import { GET } from '@/app/api/wrap-unwrap-totals/route';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncWrapUnwrapTransactions, getAggregatedTotals } from '@/lib/sync-service';
import { alkanesClient } from '@/lib/alkanes-client';

describe('GET /api/wrap-unwrap-totals', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as any).mockResolvedValue(null); // Default: no cache
    (alkanesClient.getCurrentHeight as any).mockResolvedValue(100000);
  });

  it('returns wrap/unwrap totals from aggregated data', async () => {
    (syncWrapUnwrapTransactions as any).mockResolvedValue({
      newWraps: 5,
      newUnwraps: 3,
      lastHeight: 100000,
    });
    (getAggregatedTotals as any).mockResolvedValue({
      totalWrapped: 500000000n, // 5 BTC in satoshis
      totalUnwrapped: 175000000n, // 1.75 BTC in satoshis
      wrapCount: 100,
      unwrapCount: 50,
      lastBlockHeight: 100000,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalWrappedFrbtc).toBe('500000000');
    expect(data.totalUnwrappedFrbtc).toBe('175000000');
    expect(data.totalWrappedBtc).toBe(5);
    expect(data.totalUnwrappedBtc).toBe(1.75);
    expect(data.wrapCount).toBe(100);
    expect(data.unwrapCount).toBe(50);
    expect(data.lastBlockHeight).toBe(100000);
    expect(data.currentBlockHeight).toBe(100000);
    expect(data.timestamp).toBeDefined();
    expect(cacheSet).toHaveBeenCalled();
  });

  it('returns cached result when available', async () => {
    const cachedData = {
      totalWrappedFrbtc: '250000000',
      totalUnwrappedFrbtc: '100000000',
      totalWrappedBtc: 2.5,
      totalUnwrappedBtc: 1,
      wrapCount: 50,
      unwrapCount: 25,
      lastBlockHeight: 99999,
      currentBlockHeight: 99999,
      timestamp: Date.now(),
    };
    (cacheGet as any).mockResolvedValue(cachedData);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalWrappedBtc).toBe(2.5);
    expect(data.totalUnwrappedBtc).toBe(1);
    expect(syncWrapUnwrapTransactions).not.toHaveBeenCalled();
    expect(getAggregatedTotals).not.toHaveBeenCalled();
  });

  it('handles empty transaction history', async () => {
    (syncWrapUnwrapTransactions as any).mockResolvedValue({
      newWraps: 0,
      newUnwraps: 0,
      lastHeight: 100000,
    });
    (getAggregatedTotals as any).mockResolvedValue({
      totalWrapped: 0n,
      totalUnwrapped: 0n,
      wrapCount: 0,
      unwrapCount: 0,
      lastBlockHeight: 100000,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalWrappedBtc).toBe(0);
    expect(data.totalUnwrappedBtc).toBe(0);
    expect(data.wrapCount).toBe(0);
    expect(data.unwrapCount).toBe(0);
  });

  it('returns error response when sync fails', async () => {
    (syncWrapUnwrapTransactions as any).mockRejectedValue(new Error('Sync failed'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch wrap/unwrap totals.');
  });

  it('returns error response when getCurrentHeight fails', async () => {
    (alkanesClient.getCurrentHeight as any).mockRejectedValue(new Error('RPC error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch wrap/unwrap totals.');
  });

  it('returns error response when getAggregatedTotals fails', async () => {
    (syncWrapUnwrapTransactions as any).mockResolvedValue({
      newWraps: 0,
      newUnwraps: 0,
      lastHeight: 100000,
    });
    (getAggregatedTotals as any).mockRejectedValue(new Error('DB error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch wrap/unwrap totals.');
  });

  it('includes current and last block height in response', async () => {
    (alkanesClient.getCurrentHeight as any).mockResolvedValue(100005);
    (syncWrapUnwrapTransactions as any).mockResolvedValue({
      newWraps: 2,
      newUnwraps: 1,
      lastHeight: 100005,
    });
    (getAggregatedTotals as any).mockResolvedValue({
      totalWrapped: 100000000n,
      totalUnwrapped: 50000000n,
      wrapCount: 10,
      unwrapCount: 5,
      lastBlockHeight: 100005,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.currentBlockHeight).toBe(100005);
    expect(data.lastBlockHeight).toBe(100005);
  });
});
