/**
 * Unit tests for /api/unwrap-history endpoint
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
  getUnwrapHistory: vi.fn(),
}));

// Import after mocking
import { GET } from '@/app/api/unwrap-history/route';
import { cacheGet, cacheSet } from '@/lib/redis';
import { syncWrapUnwrapTransactions, getUnwrapHistory } from '@/lib/sync-service';

// Helper to create mock request
function createMockRequest(params: Record<string, string> = {}): Request {
  const url = new URL('http://localhost:3000/api/unwrap-history');
  Object.entries(params).forEach(([key, value]) => {
    url.searchParams.set(key, value);
  });
  return new Request(url.toString());
}

describe('GET /api/unwrap-history', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as any).mockResolvedValue(null); // Default: no cache
    (syncWrapUnwrapTransactions as any).mockResolvedValue({
      newWraps: 0,
      newUnwraps: 0,
      lastHeight: 100000,
    });
  });

  it('returns unwrap history with default pagination', async () => {
    const mockItems = [
      { txid: 'abc123', amount: '100000000', blockHeight: 100000, timestamp: new Date('2024-01-01'), recipientAddress: 'bc1...' },
      { txid: 'def456', amount: '50000000', blockHeight: 99999, timestamp: new Date('2024-01-02'), recipientAddress: 'bc1...' },
    ];

    (getUnwrapHistory as any).mockResolvedValue({
      items: mockItems,
      total: 50,
    });

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items).toHaveLength(2);
    expect(data.total).toBe(50);
    expect(data.count).toBe(25);
    expect(data.offset).toBe(0);
  });

  it('passes pagination parameters to getUnwrapHistory', async () => {
    (getUnwrapHistory as any).mockResolvedValue({
      items: [],
      total: 0,
    });

    await GET(createMockRequest({ count: '50', offset: '100' }));

    expect(getUnwrapHistory).toHaveBeenCalledWith(50, 100);
  });

  it('uses default pagination values', async () => {
    (getUnwrapHistory as any).mockResolvedValue({
      items: [],
      total: 0,
    });

    await GET(createMockRequest());

    expect(getUnwrapHistory).toHaveBeenCalledWith(25, 0);
  });

  it('returns cached result when available', async () => {
    const cachedData = {
      items: [{ txid: 'cached123' }],
      total: 30,
      count: 25,
      offset: 0,
      timestamp: Date.now(),
    };
    (cacheGet as any).mockResolvedValue(cachedData);

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.items[0].txid).toBe('cached123');
    expect(syncWrapUnwrapTransactions).not.toHaveBeenCalled();
    expect(getUnwrapHistory).not.toHaveBeenCalled();
  });

  it.skipIf(process.env.CI)('returns error response when sync fails', async () => {
    (syncWrapUnwrapTransactions as any).mockRejectedValue(new Error('Sync failed'));

    const response = await GET(createMockRequest());
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch unwrap history.');
  });
});
