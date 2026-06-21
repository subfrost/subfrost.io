import { describe, it, expect, afterEach } from 'vitest';
import { getStripeSource } from '@/lib/stripe/source';
import { seedSource } from '@/lib/stripe/source/seed';
import { liveSource } from '@/lib/stripe/source/live';

const KEY = 'STRIPE_SECRET_KEY';
afterEach(() => { delete process.env[KEY]; });

describe('getStripeSource', () => {
  it('returns the seed source when no key is set', () => {
    delete process.env[KEY];
    expect(getStripeSource()).toBe(seedSource);
  });
  it('returns the live source when a key is set', () => {
    process.env[KEY] = 'sk_test_x';
    expect(getStripeSource()).toBe(liveSource);
  });
});

describe('seedSource', () => {
  it('returns deterministic treasury balances', async () => {
    const a = await seedSource.treasuryBalances();
    const b = await seedSource.treasuryBalances();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(b);
    expect(a[0].currency).toBe('USD');
  });
  it('returns issuing cards and offramp settlements', async () => {
    expect((await seedSource.issuingCards()).length).toBeGreaterThan(0);
    expect((await seedSource.offrampSettlements()).length).toBeGreaterThan(0);
  });
});

describe('liveSource', () => {
  it('delegates offrampSettlements to the seed source (Stripe offramp not GA)', async () => {
    expect(await liveSource.offrampSettlements()).toEqual(await seedSource.offrampSettlements());
  });
});
