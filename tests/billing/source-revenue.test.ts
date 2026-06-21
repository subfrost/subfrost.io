import { describe, it, expect } from 'vitest';
import { seedSource } from '@/lib/stripe/source/seed';
import { liveSource } from '@/lib/stripe/source/live';

describe('seedSource revenue reads', () => {
  it('returns deterministic tiers, subscribers, promo codes', async () => {
    expect((await seedSource.subscriptionTiers()).length).toBeGreaterThan(0);
    expect(await seedSource.subscribers()).toEqual(await seedSource.subscribers());
    const promos = await seedSource.promoCodes();
    expect(promos.length).toBeGreaterThan(0);
    expect(promos[0].code).toBeTruthy();
  });
  it('includes a canceled subscriber and an active one (for resume/cancel demo)', async () => {
    const subs = await seedSource.subscribers();
    expect(subs.some((s) => s.status === 'canceled')).toBe(true);
    expect(subs.some((s) => s.status === 'active')).toBe(true);
  });
});

describe('liveSource revenue reads', () => {
  it('degrades gracefully when STRIPE_SECRET_KEY is unset', async () => {
    expect(await liveSource.subscriptionTiers()).toEqual([]);
    expect(await liveSource.subscribers()).toEqual([]);
    expect(await liveSource.promoCodes()).toEqual([]);
  });
});
