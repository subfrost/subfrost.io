/**
 * Unit tests for /api/total-unwraps endpoint
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

// Import after mocking
import { GET } from '@/app/api/total-unwraps/route';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncWrapUnwrapTransactions, getAggregatedTotals } from '@/lib/sync-service';

describe('GET /api/total-unwraps', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as any).mockResolvedValue(null); // Default: no cache
  });

  it('returns total unwraps from aggregated data', async () => {
    (syncWrapUnwrapTransactions as any).mockResolvedValue({
      newWraps: 0,
      newUnwraps: 0,
      lastHeight: 100000,
    });
    (getAggregatedTotals as any).mockResolvedValue({
      totalWrapped: 500000000n,
      totalUnwrapped: 175000000n, // 1.75 BTC in satoshis
      wrapCount: 10,
      unwrapCount: 5,
      lastBlockHeight: 100000,
    });

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe(1.75);
    expect(data.totalUnwrapsSatoshis).toBe('175000000');
    expect(data.unwrapCount).toBe(5);
    expect(cacheSet).toHaveBeenCalled();
  });

  it('returns cached result when available', async () => {
    const cachedData = {
      totalUnwraps: 2.5,
      totalUnwrapsSatoshis: '250000000',
      unwrapCount: 8,
      lastBlockHeight: 99999,
      timestamp: Date.now(),
    };
    (cacheGet as any).mockResolvedValue(cachedData);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalUnwraps).toBe(2.5);
    expect(syncWrapUnwrapTransactions).not.toHaveBeenCalled();
  });

  it('handles empty unwrap history', async () => {
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
    expect(data.totalUnwraps).toBe(0);
    expect(data.unwrapCount).toBe(0);
  });

  it.skipIf(process.env.CI)('returns error response when sync fails', async () => {
    (syncWrapUnwrapTransactions as any).mockRejectedValue(new Error('Sync failed'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch total unwraps.');
  });
});
