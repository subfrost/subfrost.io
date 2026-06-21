import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { liveCustomerSummaries, liveCustomerDetail } from '@/lib/stripe/source/live/customers';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('liveCustomerSummaries', () => {
  it('maps customers and sums succeeded charges as lifetimeValue', async () => {
    gsc.mockReturnValue({
      customers: { list: vi.fn().mockResolvedValue({ data: [{ id: 'cus_1', email: 'a@x.com', name: 'A', created: 1700000000, subscriptions: { data: [{ status: 'active' }] } }] }) },
      charges: { list: vi.fn().mockResolvedValue({ data: [{ amount: 2900, status: 'succeeded' }, { amount: 100, status: 'failed' }] }) },
    });
    const r = await liveCustomerSummaries();
    expect(r[0]).toEqual({ id: 'cus_1', email: 'a@x.com', name: 'A', activeSubscriptions: 1, lifetimeValue: 2900, createdAt: new Date(1700000000 * 1000).toISOString() });
  });
});

describe('liveCustomerDetail', () => {
  it('returns null for a deleted/missing customer', async () => {
    gsc.mockReturnValue({ customers: { retrieve: vi.fn().mockResolvedValue({ deleted: true }) } });
    expect(await liveCustomerDetail('cus_x')).toBeNull();
  });

  it('maps a full customer detail', async () => {
    gsc.mockReturnValue({
      customers: { retrieve: vi.fn().mockResolvedValue({ id: 'cus_1', email: 'a@x.com', name: 'A', invoice_settings: { default_payment_method: 'pm_1' } }) },
      subscriptions: { list: vi.fn().mockResolvedValue({ data: [{ id: 'sub_1', status: 'active', current_period_end: 1719792000, items: { data: [{ price: { product: { name: 'Pro' } } }] } }] }) },
      invoices: { list: vi.fn().mockResolvedValue({ data: [{ id: 'in_1', number: 'INV-1', amount_due: 2900, status: 'paid', created: 1717200000 }] }) },
      paymentMethods: { list: vi.fn().mockResolvedValue({ data: [{ id: 'pm_1', card: { brand: 'visa', last4: '4242', exp_month: 11, exp_year: 2028 } }] }) },
      charges: { list: vi.fn().mockResolvedValue({ data: [{ id: 'ch_1', amount: 2900, status: 'succeeded', refunded: false, description: 'Pro', created: 1717200000 }] }) },
    });
    const r = await liveCustomerDetail('cus_1');
    expect(r).toEqual({
      id: 'cus_1', email: 'a@x.com', name: 'A',
      subscriptions: [{ id: 'sub_1', tier: 'Pro', status: 'active', renewsAt: new Date(1719792000 * 1000).toISOString() }],
      invoices: [{ id: 'in_1', number: 'INV-1', amountDue: 2900, status: 'paid', createdAt: new Date(1717200000 * 1000).toISOString() }],
      paymentMethods: [{ id: 'pm_1', brand: 'visa', last4: '4242', expMonth: 11, expYear: 2028, isDefault: true }],
      recentCharges: [{ id: 'ch_1', amount: 2900, status: 'succeeded', description: 'Pro', createdAt: new Date(1717200000 * 1000).toISOString() }],
    });
  });
});
