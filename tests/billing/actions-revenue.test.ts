import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/stripe/subscriptions', () => ({ listTiers: vi.fn(), listSubscribers: vi.fn(), changeSubscription: vi.fn() }));
vi.mock('@/lib/stripe/promo', () => ({ listPromoCodes: vi.fn(), createPromoCode: vi.fn() }));

import {
  listTiersAction, listSubscribersAction, changeSubscriptionAction,
  listPromoCodesAction, createPromoCodeAction,
} from '@/actions/cms/billing';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import { changeSubscription, listSubscribers } from '@/lib/stripe/subscriptions';
import { createPromoCode, listPromoCodes } from '@/lib/stripe/promo';
import { BillingError, StripeNotWiredError } from '@/lib/stripe/config';

const cu = currentUser as unknown as ReturnType<typeof vi.fn>;
const asUser = (privileges: string[]) => cu.mockResolvedValue({ id: 'u1', email: 'op@subfrost.io', privileges });
beforeEach(() => vi.clearAllMocks());

describe('gate', () => {
  it('denies reads without BILLING_VIEW', async () => {
    asUser(['MANAGE_AML']);
    expect((await listSubscribersAction()).ok).toBe(false);
    expect((await listPromoCodesAction()).ok).toBe(false);
  });
  it('denies writes without BILLING_EDIT', async () => {
    asUser(['BILLING_VIEW']);
    expect((await changeSubscriptionAction('sub_001', { action: 'cancel' })).ok).toBe(false);
    expect((await createPromoCodeAction({ code: 'X', type: 'PERCENT', value: 5 })).ok).toBe(false);
    expect(changeSubscription).not.toHaveBeenCalled();
    expect(createPromoCode).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('passes through live flag with BILLING_VIEW', async () => {
    asUser(['BILLING_VIEW']);
    (listSubscribers as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ subscribers: [], live: false });
    expect(await listSubscribersAction()).toEqual({ ok: true, subscribers: [], live: false });
    (listPromoCodes as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ codes: [], live: false });
    expect(await listPromoCodesAction()).toEqual({ ok: true, codes: [], live: false });
  });
});

describe('mutations', () => {
  it('changeSubscription audits + revalidates with BILLING_EDIT', async () => {
    asUser(['BILLING_EDIT']);
    (changeSubscription as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'a1', subscriptionId: 'sub_001', action: 'cancel', note: null, by: 'op@subfrost.io', at: '2026-06-03T00:00:00.000Z' });
    expect(await changeSubscriptionAction('sub_001', { action: 'cancel' })).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_subscription_action', expect.objectContaining({ actorId: 'u1', target: 'sub_001' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/subscriptions');
  });
  it('createPromoCode audits with the code + revalidates with BILLING_EDIT', async () => {
    asUser(['BILLING_EDIT']);
    (createPromoCode as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ code: 'SAVE20', type: 'PERCENT', value: 20, redemptions: 0, maxRedemptions: null, expiresAt: null, active: true });
    expect(await createPromoCodeAction({ code: 'SAVE20', type: 'PERCENT', value: 20 })).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_promo_create', expect.objectContaining({ actorId: 'u1', target: 'SAVE20' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/promo');
  });
  it('maps BillingError without auditing', async () => {
    asUser(['BILLING_EDIT']);
    (createPromoCode as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new BillingError('Promo code already exists: DUP'));
    expect(await createPromoCodeAction({ code: 'DUP', type: 'PERCENT', value: 5 })).toEqual({ ok: false, error: 'Promo code already exists: DUP' });
    expect(audit).not.toHaveBeenCalled();
  });
  it('maps StripeNotWiredError without auditing', async () => {
    asUser(['BILLING_EDIT']);
    (changeSubscription as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new StripeNotWiredError('changeSubscription'));
    expect(await changeSubscriptionAction('sub_001', { action: 'cancel' })).toEqual({ ok: false, error: expect.any(String) });
    expect(audit).not.toHaveBeenCalled();
  });
});
