/**
 * Unit test for getAddressStats.
 *
 * The "Total BTC Locked" home metrics derive from address chain_stats. This must
 * come from the Subfrost RPC `esplora_address` method, NOT mempool.space — which
 * times out from our server environment (the same reason /api/btc-price was moved
 * off mempool.space in June 2026), leaving the metric stuck on a loading state.
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';

const mockFetch = vi.fn();
global.fetch = mockFetch as unknown as typeof fetch;

import { getAddressStats } from '@/lib/rpc-client';

const rpcReply = {
  ok: true,
  json: async () => ({
    jsonrpc: '2.0',
    id: 1,
    result: {
      address: 'bc1ptest',
      chain_stats: { funded_txo_count: 10, funded_txo_sum: 1000, spent_txo_count: 4, spent_txo_sum: 400, tx_count: 10 },
      mempool_stats: { funded_txo_count: 0, funded_txo_sum: 0, spent_txo_count: 0, spent_txo_sum: 0, tx_count: 0 },
    },
  }),
};

describe('getAddressStats', () => {
  beforeEach(() => vi.clearAllMocks());

  it('queries the Subfrost RPC esplora_address method (not mempool.space)', async () => {
    mockFetch.mockResolvedValueOnce(rpcReply);

    const stats = await getAddressStats('bc1ptest');

    // Returns the unwrapped chain_stats shape
    expect(stats.chain_stats.funded_txo_sum).toBe(1000);

    const [url, opts] = mockFetch.mock.calls[0];
    expect(String(url)).toBe('https://mainnet.subfrost.io/v4/subfrost');
    expect(String(url)).not.toContain('mempool.space');

    const body = JSON.parse(String((opts as RequestInit).body));
    expect(body.method).toBe('esplora_address');
    expect(body.params).toEqual(['bc1ptest']);
  });
});
