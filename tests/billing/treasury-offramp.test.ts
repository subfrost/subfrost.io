import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listBalances, listTransactions } from '@/lib/stripe/treasury';
import { listSettlements } from '@/lib/stripe/offramp';
import { getStripeSource } from '@/lib/stripe/source';
import { isLive } from '@/lib/stripe/config';

const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    treasuryBalances: vi.fn(async () => [{ accountId: 'a', nickname: 'Op', available: 100, pending: 0, currency: 'USD' }]),
    treasuryTransactions: vi.fn(async () => [{ id: 't1', type: 'fee', amount: -1, counterparty: 'Stripe', status: 'posted', at: '2026-06-01T00:00:00.000Z' }]),
    offrampSettlements: vi.fn(async () => [{ id: 'o1', userId: 'u', cryptoAsset: 'BTC', cryptoAmount: 1, fiatAmount: 1, feeAmount: 0, status: 'settled', at: '2026-06-01T00:00:00.000Z' }]),
  });
});

describe('treasury reads', () => {
  it('returns balances + live flag', async () => {
    const r = await listBalances();
    expect(r.live).toBe(false);
    expect(r.balances[0].accountId).toBe('a');
  });
  it('returns transactions + live flag', async () => {
    const r = await listTransactions();
    expect(r.transactions[0].id).toBe('t1');
  });
  it('passes through live flag when live', async () => {
    live.mockReturnValue(true);
    expect((await listBalances()).live).toBe(true);
  });
});

describe('offramp reads', () => {
  it('returns settlements + live flag', async () => {
    const r = await listSettlements();
    expect(r.live).toBe(false);
    expect(r.settlements[0].id).toBe('o1');
  });
});
