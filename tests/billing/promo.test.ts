import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripePromoCode = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn() };
  const client = { stripePromoCode };
  return { prisma: client, default: client };
});
vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listPromoCodes, createPromoCode } from '@/lib/stripe/promo';
import { BillingError, StripeNotWiredError, isLive } from '@/lib/stripe/config';
import { getStripeSource } from '@/lib/stripe/source';
import { getStripeClient } from '@/lib/stripe/client';
import { prisma } from '@/lib/prisma';

const spc = prisma.stripePromoCode as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;

beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    promoCodes: vi.fn(async () => [
      { code: 'SEEDED', type: 'PERCENT', value: 10, redemptions: 5, maxRedemptions: null, expiresAt: null, active: true },
    ]),
  });
});

describe('listPromoCodes', () => {
  it('merges seed source codes with overlay rows in seed mode', async () => {
    spc.findMany.mockResolvedValueOnce([
      { id: 'p1', code: 'NEW20', type: 'AMOUNT', value: 2000, maxRedemptions: 50, expiresAt: new Date('2027-01-01T00:00:00Z'), active: true, by: 'op', createdAt: new Date() },
    ]);
    const r = await listPromoCodes();
    expect(r.live).toBe(false);
    expect(r.codes.map((c) => c.code).sort()).toEqual(['NEW20', 'SEEDED']);
    const made = r.codes.find((c) => c.code === 'NEW20')!;
    expect(made).toMatchObject({ type: 'AMOUNT', value: 2000, redemptions: 0, maxRedemptions: 50, expiresAt: '2027-01-01T00:00:00.000Z', active: true });
  });
  it('does NOT read overlays in live mode', async () => {
    live.mockReturnValue(true);
    const r = await listPromoCodes();
    expect(spc.findMany).not.toHaveBeenCalled();
    expect(r.codes.map((c) => c.code)).toEqual(['SEEDED']);
  });
});

describe('createPromoCode', () => {
  it('rejects invalid input without writing', async () => {
    await expect(createPromoCode({ code: '', type: 'PERCENT', value: 10 }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(spc.create).not.toHaveBeenCalled();
  });
  it('rejects a duplicate code without writing', async () => {
    spc.findUnique.mockResolvedValueOnce({ id: 'p0', code: 'DUP' });
    await expect(createPromoCode({ code: 'DUP', type: 'PERCENT', value: 10 }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(spc.create).not.toHaveBeenCalled();
  });
  it('creates coupon + promotion code in Stripe (live), not the overlay', async () => {
    live.mockReturnValue(true);
    const promotionCodes = { create: vi.fn().mockResolvedValue({ code: 'X', coupon: { percent_off: 10 }, times_redeemed: 0, max_redemptions: null, expires_at: null, active: true }) };
    const coupons = { create: vi.fn().mockResolvedValue({ id: 'co_1' }) };
    (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ coupons, promotionCodes });
    const r = await createPromoCode({ code: 'X', type: 'PERCENT', value: 10 }, 'op');
    expect(coupons.create).toHaveBeenCalledWith({ percent_off: 10, duration: 'forever' });
    expect(promotionCodes.create).toHaveBeenCalled();
    expect(spc.create).not.toHaveBeenCalled();
    expect(r).toMatchObject({ code: 'X', type: 'PERCENT', value: 10 });
  });
  it('creates the overlay in seed mode', async () => {
    spc.findUnique.mockResolvedValueOnce(null);
    spc.create.mockResolvedValueOnce({ id: 'p2', code: 'SAVE20', type: 'PERCENT', value: 20, maxRedemptions: null, expiresAt: null, active: true, by: 'op', createdAt: new Date() });
    const r = await createPromoCode({ code: 'SAVE20', type: 'PERCENT', value: 20 }, 'op');
    expect(spc.create).toHaveBeenCalledWith({ data: { code: 'SAVE20', type: 'PERCENT', value: 20, maxRedemptions: null, expiresAt: null, by: 'op' } });
    expect(r).toMatchObject({ code: 'SAVE20', type: 'PERCENT', value: 20, redemptions: 0, active: true });
  });
});
