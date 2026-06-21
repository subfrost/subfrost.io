import { describe, it, expect } from 'vitest';
import { seedSource } from '@/lib/stripe/source/seed';
import { liveSource } from '@/lib/stripe/source/live';
import { StripeNotWiredError } from '@/lib/stripe/config';

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
  it('rejects each revenue read with StripeNotWiredError', async () => {
    await expect(liveSource.subscriptionTiers()).rejects.toBeInstanceOf(StripeNotWiredError);
    await expect(liveSource.subscribers()).rejects.toBeInstanceOf(StripeNotWiredError);
    await expect(liveSource.promoCodes()).rejects.toBeInstanceOf(StripeNotWiredError);
  });
});
