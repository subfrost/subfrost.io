import { describe, it, expect } from 'vitest';
import { seedSource } from '@/lib/stripe/source/seed';
import { liveSource } from '@/lib/stripe/source/live';

describe('seedSource customers', () => {
  it('returns deterministic customer summaries', async () => {
    const a = await seedSource.customerSummaries();
    expect(a.length).toBeGreaterThan(0);
    expect(a).toEqual(await seedSource.customerSummaries());
    expect(a[0].email).toBeTruthy();
  });
  it('returns detail for a known id and null for unknown', async () => {
    const summaries = await seedSource.customerSummaries();
    const d = await seedSource.customerDetail(summaries[0].id);
    expect(d?.id).toBe(summaries[0].id);
    expect(Array.isArray(d?.recentCharges)).toBe(true);
    expect(await seedSource.customerDetail('cus_does_not_exist')).toBeNull();
  });
});

describe('liveSource customers', () => {
  it('degrades gracefully when STRIPE_SECRET_KEY is unset', async () => {
    expect(await liveSource.customerSummaries()).toEqual([]);
    expect(await liveSource.customerDetail('cus_1')).toBeNull();
  });
});
