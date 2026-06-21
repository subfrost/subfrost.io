import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { livePromoCodes } from '@/lib/stripe/source/live/promo';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('livePromoCodes', () => {
  it('maps percent and amount coupons to the PromoCode shape', async () => {
    gsc.mockReturnValue({ promotionCodes: { list: vi.fn().mockResolvedValue({ data: [
      { code: 'LAUNCH25', times_redeemed: 312, max_redemptions: 1000, expires_at: 1719792000, active: true, coupon: { percent_off: 25, amount_off: null } },
      { code: 'FROST10', times_redeemed: 47, max_redemptions: null, expires_at: null, active: true, coupon: { percent_off: null, amount_off: 1000 } },
    ] }) } });
    const r = await livePromoCodes();
    expect(r[0]).toEqual({ code: 'LAUNCH25', type: 'PERCENT', value: 25, redemptions: 312, maxRedemptions: 1000, expiresAt: new Date(1719792000 * 1000).toISOString(), active: true });
    expect(r[1]).toMatchObject({ code: 'FROST10', type: 'AMOUNT', value: 1000, maxRedemptions: null, expiresAt: null });
  });
});
