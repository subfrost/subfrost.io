import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/stripe/customers', () => ({ listCustomers: vi.fn(), getCustomer: vi.fn() }));
vi.mock('@/lib/stripe/money', () => ({ listIntents: vi.fn(), queueRefund: vi.fn() }));

import {
  listCustomersAction, getCustomerAction, listRefundIntentsAction, requestRefundAction,
} from '@/actions/cms/billing';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import { listCustomers, getCustomer } from '@/lib/stripe/customers';
import { listIntents, queueRefund } from '@/lib/stripe/money';
import { BillingError, StripeNotWiredError } from '@/lib/stripe/config';

const cu = currentUser as unknown as ReturnType<typeof vi.fn>;
const asUser = (privileges: string[]) => cu.mockResolvedValue({ id: 'u1', email: 'op@subfrost.io', privileges });
beforeEach(() => vi.clearAllMocks());

describe('gate', () => {
  it('denies reads without BILLING_VIEW', async () => {
    asUser(['MANAGE_AML']);
    expect((await listCustomersAction()).ok).toBe(false);
    expect((await getCustomerAction('cus_1')).ok).toBe(false);
    expect((await listRefundIntentsAction()).ok).toBe(false);
    expect(listCustomers).not.toHaveBeenCalled();
    expect(getCustomer).not.toHaveBeenCalled();
  });
  it('denies write without BILLING_EDIT', async () => {
    asUser(['BILLING_VIEW']);
    expect((await requestRefundAction({ reference: 'ch_a1', amount: 2900 })).ok).toBe(false);
    expect(queueRefund).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('listCustomersAction passes through live flag with BILLING_VIEW', async () => {
    asUser(['BILLING_VIEW']);
    (listCustomers as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ customers: [], live: false });
    expect(await listCustomersAction()).toEqual({ ok: true, customers: [], live: false });
  });
  it('getCustomerAction returns customer detail with BILLING_VIEW', async () => {
    asUser(['BILLING_VIEW']);
    (getCustomer as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ customer: null, live: true });
    expect(await getCustomerAction('cus_1')).toEqual({ ok: true, customer: null, live: true });
    expect(getCustomer).toHaveBeenCalledWith('cus_1');
  });
  it('listRefundIntentsAction calls listIntents with REFUND using BILLING_VIEW', async () => {
    asUser(['BILLING_VIEW']);
    (listIntents as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    expect(await listRefundIntentsAction()).toEqual({ ok: true, intents: [] });
    expect(listIntents).toHaveBeenCalledWith('REFUND');
  });
});

describe('mutations', () => {
  it('requestRefundAction audits stripe_refund_request + revalidates with BILLING_EDIT', async () => {
    asUser(['BILLING_EDIT']);
    (queueRefund as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    expect(await requestRefundAction({ reference: 'ch_a1', amount: 2900 })).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_refund_request', expect.objectContaining({ actorId: 'u1', target: 'ch_a1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/customers');
  });
  it('maps BillingError without auditing', async () => {
    asUser(['BILLING_EDIT']);
    (queueRefund as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new BillingError('Invalid amount'));
    expect(await requestRefundAction({ reference: 'ch_a1', amount: 2900 })).toEqual({ ok: false, error: 'Invalid amount' });
    expect(audit).not.toHaveBeenCalled();
  });
  it('maps StripeNotWiredError without auditing', async () => {
    asUser(['BILLING_EDIT']);
    (queueRefund as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new StripeNotWiredError('queueRefund'));
    expect(await requestRefundAction({ reference: 'ch_a1', amount: 2900 })).toEqual({ ok: false, error: expect.any(String) });
    expect(audit).not.toHaveBeenCalled();
  });
});
