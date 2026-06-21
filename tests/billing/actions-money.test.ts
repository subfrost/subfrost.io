import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/stripe/money', () => ({ listIntents: vi.fn(), queueAchTransfer: vi.fn(), confirmIntent: vi.fn(), cancelIntent: vi.fn() }));
vi.mock('@/lib/stripe/treasury', () => ({ listBalances: vi.fn(), listTransactions: vi.fn() }));
vi.mock('@/lib/stripe/offramp', () => ({ listSettlements: vi.fn() }));
vi.mock('@/lib/stripe/issuing', () => ({ listCards: vi.fn(), listDisputes: vi.fn(), setCardControl: vi.fn(), submitDisputeEvidence: vi.fn() }));

import {
  listBalancesAction, listTransactionsAction, listMoneyIntentsAction, queueAchTransferAction,
  confirmIntentAction, cancelIntentAction, listCardsAction, listDisputesAction, setCardControlAction,
  submitDisputeEvidenceAction, listSettlementsAction,
} from '@/actions/cms/billing';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import { listIntents, queueAchTransfer, confirmIntent, cancelIntent } from '@/lib/stripe/money';
import { listBalances, listTransactions } from '@/lib/stripe/treasury';
import { listSettlements } from '@/lib/stripe/offramp';
import { listCards, listDisputes, setCardControl, submitDisputeEvidence } from '@/lib/stripe/issuing';
import { BillingError, StripeNotWiredError } from '@/lib/stripe/config';

const cu = currentUser as unknown as ReturnType<typeof vi.fn>;
const asUser = (privileges: string[]) => cu.mockResolvedValue({ id: 'u1', email: 'op@subfrost.io', privileges });
beforeEach(() => vi.clearAllMocks());

describe('gate', () => {
  it('denies reads + writes without MANAGE_BILLING', async () => {
    asUser(['MANAGE_AML']);
    expect((await listCardsAction()).ok).toBe(false);
    expect((await queueAchTransferAction({ direction: 'in', amount: 1000, counterparty: 'acct_123' })).ok).toBe(false);
    expect((await confirmIntentAction('m1')).ok).toBe(false);
    expect((await setCardControlAction('ic_1', { state: 'paused' })).ok).toBe(false);
    expect(queueAchTransfer).not.toHaveBeenCalled();
    expect(confirmIntent).not.toHaveBeenCalled();
    expect(setCardControl).not.toHaveBeenCalled();
  });
});

describe('reads', () => {
  it('listBalancesAction passes through live flag', async () => {
    asUser(['MANAGE_BILLING']);
    (listBalances as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ balances: [], live: false });
    expect(await listBalancesAction()).toEqual({ ok: true, balances: [], live: false });
  });
  it('listMoneyIntentsAction returns intents', async () => {
    asUser(['MANAGE_BILLING']);
    (listIntents as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([]);
    expect(await listMoneyIntentsAction()).toEqual({ ok: true, intents: [] });
    expect(listIntents).toHaveBeenCalledWith('ACH_TRANSFER');
  });
  it('listCardsAction passes through live flag', async () => {
    asUser(['MANAGE_BILLING']);
    (listCards as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ cards: [], live: false });
    expect(await listCardsAction()).toEqual({ ok: true, cards: [], live: false });
  });
  it('listDisputesAction passes through live flag', async () => {
    asUser(['MANAGE_BILLING']);
    (listDisputes as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ disputes: [], live: false });
    expect(await listDisputesAction()).toEqual({ ok: true, disputes: [], live: false });
  });
  it('listSettlementsAction passes through live flag', async () => {
    asUser(['MANAGE_BILLING']);
    (listSettlements as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ settlements: [], live: false });
    expect(await listSettlementsAction()).toEqual({ ok: true, settlements: [], live: false });
  });
});

describe('mutations', () => {
  it('queueAchTransferAction audits stripe_money_queue + revalidates', async () => {
    asUser(['MANAGE_BILLING']);
    (queueAchTransfer as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    expect(await queueAchTransferAction({ direction: 'in', amount: 1000, counterparty: 'acct_123' })).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_money_queue', expect.objectContaining({ actorId: 'u1', target: 'in 1000' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/treasury');
  });
  it('confirmIntentAction audits stripe_money_confirm + revalidates', async () => {
    asUser(['MANAGE_BILLING']);
    (confirmIntent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    expect(await confirmIntentAction('m1')).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_money_confirm', expect.objectContaining({ actorId: 'u1', target: 'm1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/treasury');
  });
  it('cancelIntentAction audits stripe_money_cancel + revalidates', async () => {
    asUser(['MANAGE_BILLING']);
    (cancelIntent as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    expect(await cancelIntentAction('m1')).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_money_cancel', expect.objectContaining({ actorId: 'u1', target: 'm1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/treasury');
  });
  it('setCardControlAction audits stripe_card_control + revalidates', async () => {
    asUser(['MANAGE_BILLING']);
    (setCardControl as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    expect(await setCardControlAction('ic_1', { state: 'paused' })).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_card_control', expect.objectContaining({ actorId: 'u1', target: 'ic_1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/issuing');
  });
  it('submitDisputeEvidenceAction audits stripe_dispute_evidence + revalidates', async () => {
    asUser(['MANAGE_BILLING']);
    (submitDisputeEvidence as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({});
    expect(await submitDisputeEvidenceAction('idp_1', { evidence: 'x' })).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_dispute_evidence', expect.objectContaining({ actorId: 'u1', target: 'idp_1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/issuing');
  });
  it('maps StripeNotWiredError without auditing', async () => {
    asUser(['MANAGE_BILLING']);
    (confirmIntent as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new StripeNotWiredError('confirmIntent'));
    expect(await confirmIntentAction('m1')).toEqual({ ok: false, error: expect.any(String) });
    expect(audit).not.toHaveBeenCalled();
  });
  it('maps BillingError without auditing', async () => {
    asUser(['MANAGE_BILLING']);
    (setCardControl as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new BillingError('Card not found'));
    expect(await setCardControlAction('ic_1', { state: 'paused' })).toEqual({ ok: false, error: 'Card not found' });
    expect(audit).not.toHaveBeenCalled();
  });
});
