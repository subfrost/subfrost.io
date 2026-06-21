import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripeSubscriptionAction = { findMany: vi.fn(), create: vi.fn() };
  const client = { stripeSubscriptionAction };
  return { prisma: client, default: client };
});
vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));

import { listTiers, listSubscribers, changeSubscription } from '@/lib/stripe/subscriptions';
import { BillingError, StripeNotWiredError, isLive } from '@/lib/stripe/config';
import { getStripeSource } from '@/lib/stripe/source';
import { prisma } from '@/lib/prisma';
import { getStripeClient } from '@/lib/stripe/client';

const ssa = prisma.stripeSubscriptionAction as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;

const SUBS = [
  { id: 'sub_001', customerEmail: 'a@x.z', tier: 'Pro', status: 'active', startedAt: '2026-01-01T00:00:00.000Z', renewsAt: '2026-07-01T00:00:00.000Z' },
  { id: 'sub_004', customerEmail: 'g@x.z', tier: 'Pro', status: 'canceled', startedAt: '2026-01-01T00:00:00.000Z', renewsAt: null },
];
beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    subscriptionTiers: vi.fn(async () => [{ id: 't1', name: 'Pro', priceMonthly: 2900, priceYearly: 29000, features: [], activeSubs: 1 }]),
    subscribers: vi.fn(async () => SUBS.map((s) => ({ ...s }))),
  });
});

describe('listTiers', () => {
  it('returns tiers + live flag', async () => {
    const r = await listTiers();
    expect(r.live).toBe(false);
    expect(r.tiers[0].name).toBe('Pro');
  });
});

describe('listSubscribers (seed overlay)', () => {
  it('applies latest action per subscription: cancel→canceled, resume→active', async () => {
    ssa.findMany.mockResolvedValueOnce([
      { id: 'a2', subscriptionId: 'sub_001', action: 'cancel', note: null, by: 'op', at: new Date('2026-06-02T00:00:00Z') },
      { id: 'a1', subscriptionId: 'sub_004', action: 'resume', note: null, by: 'op', at: new Date('2026-06-01T00:00:00Z') },
    ]);
    const r = await listSubscribers();
    expect(r.subscribers.find((s) => s.id === 'sub_001')!.status).toBe('canceled');
    expect(r.subscribers.find((s) => s.id === 'sub_004')!.status).toBe('active');
  });
  it('does NOT layer overlays in live mode', async () => {
    live.mockReturnValue(true);
    const r = await listSubscribers();
    expect(ssa.findMany).not.toHaveBeenCalled();
    expect(r.subscribers.find((s) => s.id === 'sub_001')!.status).toBe('active');
  });
});

describe('changeSubscription', () => {
  it('rejects an invalid action without writing', async () => {
    await expect(changeSubscription('sub_001', { action: 'delete' }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(ssa.create).not.toHaveBeenCalled();
  });
  it('cancels at period end via Stripe in live mode (no overlay write)', async () => {
    live.mockReturnValue(true);
    const update = vi.fn().mockResolvedValue({ id: 'sub_1' });
    (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ subscriptions: { update } });
    const r = await changeSubscription('sub_1', { action: 'cancel' }, 'op');
    expect(update).toHaveBeenCalledWith('sub_1', { cancel_at_period_end: true });
    expect(prisma.stripeSubscriptionAction.create).not.toHaveBeenCalled();
    expect(r.action).toBe('cancel');
  });
  it('writes the overlay in seed mode', async () => {
    ssa.create.mockResolvedValueOnce({ id: 'a9', subscriptionId: 'sub_001', action: 'cancel', note: 'fraud', by: 'op', at: new Date('2026-06-03T00:00:00Z') });
    const r = await changeSubscription('sub_001', { action: 'cancel', note: 'fraud' }, 'op');
    expect(ssa.create).toHaveBeenCalledWith({ data: { subscriptionId: 'sub_001', action: 'cancel', note: 'fraud', by: 'op' } });
    expect(r.action).toBe('cancel');
    expect(r.at).toBe('2026-06-03T00:00:00.000Z');
  });
});
