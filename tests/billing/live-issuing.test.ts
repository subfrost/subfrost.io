import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { liveIssuingCards, liveIssuingDisputes } from '@/lib/stripe/source/live/issuing';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('liveIssuingCards', () => {
  it('maps Stripe status inactive -> paused', async () => {
    gsc.mockReturnValue({ issuing: { cards: { list: vi.fn().mockResolvedValue({ data: [
      { id: 'ic_1', last4: '4242', cardholder: { name: 'flex' }, type: 'virtual', status: 'inactive',
        wallets: { apple_pay: { eligible: true }, google_pay: { eligible: false } },
        spending_controls: { spending_limits: [{ amount: 1000000 }] } },
    ] }) } } });
    const r = await liveIssuingCards();
    expect(r[0]).toMatchObject({ id: 'ic_1', last4: '4242', cardholder: 'flex', type: 'virtual', state: 'paused', spendLimit: 1000000, wallet: { apple: true, google: false } });
  });
});

describe('liveIssuingDisputes', () => {
  it('maps issuing disputes (status unsubmitted->submitted, reason)', async () => {
    gsc.mockReturnValue({ issuing: { disputes: { list: vi.fn().mockResolvedValue({ data: [
      { id: 'idp_1', amount: 8900, status: 'unsubmitted', reason: 'fraudulent', transaction: { card: 'ic_3' }, created: 1717200000 },
    ] }) } } });
    const r = await liveIssuingDisputes();
    expect(r[0]).toEqual({ id: 'idp_1', cardId: 'ic_3', amount: 8900, reason: 'fraudulent', status: 'submitted', openedAt: new Date(1717200000 * 1000).toISOString() });
  });
});
