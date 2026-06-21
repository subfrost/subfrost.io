import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { liveSubscribers, liveSubscriptionTiers } from '@/lib/stripe/source/live/subscriptions';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('liveSubscribers', () => {
  it('maps Stripe subscriptions to the Subscriber shape', async () => {
    gsc.mockReturnValue({
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [{
        id: 'sub_1', status: 'active', start_date: 1717200000, current_period_end: 1719792000,
        customer: { email: 'ada@example.com' },
        items: { data: [{ price: { product: { name: 'Pro' } } }] },
      }] }) },
    });
    const r = await liveSubscribers();
    expect(r[0]).toEqual({
      id: 'sub_1', customerEmail: 'ada@example.com', tier: 'Pro',
      status: 'active', startedAt: new Date(1717200000 * 1000).toISOString(),
      renewsAt: new Date(1719792000 * 1000).toISOString(),
    });
  });
});

describe('liveSubscriptionTiers', () => {
  it('maps products + prices to the SubscriptionTier shape with active sub count', async () => {
    gsc.mockReturnValue({
      products: { list: vi.fn().mockResolvedValue({ data: [
        { id: 'prod_1', name: 'Pro', marketing_features: [{ name: 'Priority' }, { name: '' }] },
      ] }) },
      prices: { list: vi.fn().mockResolvedValue({ data: [
        { id: 'price_m', unit_amount: 2900, recurring: { interval: 'month' } },
        { id: 'price_y', unit_amount: 29000, recurring: { interval: 'year' } },
      ] }) },
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [{ id: 'sub_a' }, { id: 'sub_b' }] }) },
    });
    const r = await liveSubscriptionTiers();
    expect(r[0]).toEqual({ id: 'prod_1', name: 'Pro', priceMonthly: 2900, priceYearly: 29000, features: ['Priority'], activeSubs: 2 });
  });
});
