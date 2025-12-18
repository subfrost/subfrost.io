/**
 * Unit tests for /api/brc20-frbtc-stats endpoint
 */

import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock data
const mockBrc20Stats = {
  totalSupply: 1234567890000n,
  totalSupplyBtc: 12345.6789,
  signerAddress: 'bc1pxn3gr0hy70exhdqjzawtuygppzdrk3mer3wlaa2gzkmruk3rrt4qga2qaj',
  btcLocked: {
    satoshis: 1234567890000,
    btc: 12345.6789,
    utxoCount: 42,
  },
  timestamp: Date.now(),
};

// Mock Redis
vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(),
  cacheSet: vi.fn(),
}));

// Mock brc20-client
vi.mock('@/lib/brc20-client', () => ({
  brc20Client: {
    getStats: vi.fn(),
  },
}));

// Import after mocking
import { GET } from '@/app/api/brc20-frbtc-stats/route';
import { cacheGet, cacheSet } from '@/lib/redis';
import { brc20Client } from '@/lib/brc20-client';

describe('GET /api/brc20-frbtc-stats', () => {
  beforeEach(() => {
    vi.clearAllMocks();
    (cacheGet as any).mockResolvedValue(null); // Default: no cache
    (brc20Client.getStats as any).mockResolvedValue(mockBrc20Stats);
  });

  it('returns BRC2.0 frBTC stats with correct structure', async () => {
    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalSupply).toBe(mockBrc20Stats.totalSupply.toString());
    expect(data.totalSupplyBtc).toBe(mockBrc20Stats.totalSupplyBtc);
    expect(data.signerAddress).toBe(mockBrc20Stats.signerAddress);
    expect(data.btcLocked.satoshis).toBe(mockBrc20Stats.btcLocked.satoshis);
    expect(data.btcLocked.btc).toBe(mockBrc20Stats.btcLocked.btc);
    expect(data.btcLocked.utxoCount).toBe(mockBrc20Stats.btcLocked.utxoCount);
    expect(data.timestamp).toBeDefined();
    expect(typeof data.timestamp).toBe('number');
  });

  it('returns cached result when available', async () => {
    const cachedData = {
      totalSupply: '9876543210000',
      totalSupplyBtc: 98765.4321,
      signerAddress: mockBrc20Stats.signerAddress,
      btcLocked: {
        satoshis: 9876543210000,
        btc: 98765.4321,
        utxoCount: 100,
      },
      timestamp: Date.now(),
    };
    (cacheGet as any).mockResolvedValue(cachedData);

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(200);
    expect(data.totalSupply).toBe('9876543210000');
    expect(data.totalSupplyBtc).toBe(98765.4321);
    expect(brc20Client.getStats).not.toHaveBeenCalled();
  });

  it('caches result after fetching', async () => {
    await GET();

    expect(cacheSet).toHaveBeenCalledWith(
      'brc20-frbtc-stats',
      expect.objectContaining({
        totalSupply: mockBrc20Stats.totalSupply.toString(),
        totalSupplyBtc: mockBrc20Stats.totalSupplyBtc,
        signerAddress: mockBrc20Stats.signerAddress,
      }),
      60
    );
  });

  it('caches signer address separately with longer TTL', async () => {
    await GET();

    expect(cacheSet).toHaveBeenCalledWith(
      'brc20-signer-address',
      mockBrc20Stats.signerAddress,
      3600
    );
  });

  it('returns error response when fetch fails', async () => {
    (brc20Client.getStats as any).mockRejectedValue(new Error('RPC error'));

    const response = await GET();
    const data = await response.json();

    expect(response.status).toBe(500);
    expect(data.error).toBe('Failed to fetch BRC2.0 frBTC stats.');
  });

  it('serializes BigInt totalSupply as string', async () => {
    const response = await GET();
    const data = await response.json();

    expect(typeof data.totalSupply).toBe('string');
    expect(data.totalSupply).toBe('1234567890000');
  });

  it('returns correct numeric types for BTC values', async () => {
    const response = await GET();
    const data = await response.json();

    expect(typeof data.totalSupplyBtc).toBe('number');
    expect(typeof data.btcLocked.satoshis).toBe('number');
    expect(typeof data.btcLocked.btc).toBe('number');
    expect(typeof data.btcLocked.utxoCount).toBe('number');
  });
});
