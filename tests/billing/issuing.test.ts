import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripeCardControl = { findMany: vi.fn(), upsert: vi.fn() };
  const stripeDisputeEvidence = { findMany: vi.fn(), create: vi.fn() };
  const client = { stripeCardControl, stripeDisputeEvidence };
  return { prisma: client, default: client };
});
vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listCards, listDisputes, setCardControl, submitDisputeEvidence } from '@/lib/stripe/issuing';
import { BillingError, isLive } from '@/lib/stripe/config';
import { getStripeSource } from '@/lib/stripe/source';
import { getStripeClient } from '@/lib/stripe/client';
import { prisma } from '@/lib/prisma';

const scc = prisma.stripeCardControl as unknown as Record<string, ReturnType<typeof vi.fn>>;
const sde = prisma.stripeDisputeEvidence as unknown as Record<string, ReturnType<typeof vi.fn>>;
const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    issuingCards: vi.fn(async () => [
      { id: 'ic_001', last4: '4242', cardholder: 'flex', type: 'virtual', state: 'active', wallet: { apple: true, google: false }, spendLimit: 1000, spentMtd: 0 },
    ]),
    issuingDisputes: vi.fn(async () => [
      { id: 'idp_001', cardId: 'ic_003', amount: 8900, reason: 'fraudulent', status: 'submitted', openedAt: '2026-06-01T00:00:00.000Z' },
    ]),
  });
});

describe('listCards (seed overlay)', () => {
  it('overrides card state from StripeCardControl in seed mode', async () => {
    scc.findMany.mockResolvedValueOnce([{ cardId: 'ic_001', state: 'paused', by: 'op', at: new Date() }]);
    const r = await listCards();
    expect(r.cards.find((c) => c.id === 'ic_001')!.state).toBe('paused');
  });
  it('does NOT query overlays in live mode', async () => {
    live.mockReturnValue(true);
    const r = await listCards();
    expect(scc.findMany).not.toHaveBeenCalled();
    expect(r.cards[0].state).toBe('active');
  });
});

describe('listDisputes (seed overlay)', () => {
  it('attaches latest evidence in seed mode', async () => {
    sde.findMany.mockResolvedValueOnce([{ id: 'e1', disputeId: 'idp_001', evidence: 'receipt', evidenceFiles: ['a.pdf'], by: 'op', at: new Date('2026-06-02T00:00:00Z') }]);
    const r = await listDisputes();
    const d = r.disputes.find((x) => x.id === 'idp_001')!;
    expect(d.evidence).toBe('receipt');
    expect(d.evidenceFiles).toEqual(['a.pdf']);
  });
  it('does NOT query evidence in live mode', async () => {
    live.mockReturnValue(true);
    const r = await listDisputes();
    expect(sde.findMany).not.toHaveBeenCalled();
    expect(r.disputes[0].status).toBe('submitted');
  });
});

describe('setCardControl', () => {
  it('rejects invalid state without writing', async () => {
    await expect(setCardControl('ic_001', { state: 'frozen' }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(scc.upsert).not.toHaveBeenCalled();
  });
  it('updates the Issuing card status in live mode (paused -> inactive)', async () => {
    live.mockReturnValue(true);
    const update = vi.fn().mockResolvedValue({ id: 'ic_1', status: 'inactive' });
    (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ issuing: { cards: { update }, disputes: {} } });
    const r = await setCardControl('ic_1', { state: 'paused' }, 'op');
    expect(update).toHaveBeenCalledWith('ic_1', { status: 'inactive' });
    expect(prisma.stripeCardControl.upsert).not.toHaveBeenCalled();
    expect(r).toEqual({ cardId: 'ic_1', state: 'paused' });
  });
  it('upserts by cardId in seed mode', async () => {
    scc.upsert.mockResolvedValueOnce({ cardId: 'ic_001', state: 'paused', by: 'op', at: new Date() });
    const r = await setCardControl('ic_001', { state: 'paused' }, 'op');
    expect(scc.upsert).toHaveBeenCalledWith({ where: { cardId: 'ic_001' }, create: { cardId: 'ic_001', state: 'paused', by: 'op' }, update: { state: 'paused', by: 'op' } });
    expect(r).toEqual({ cardId: 'ic_001', state: 'paused' });
  });
});

describe('submitDisputeEvidence', () => {
  it('rejects empty evidence without writing', async () => {
    await expect(submitDisputeEvidence('idp_001', { evidence: '' }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(sde.create).not.toHaveBeenCalled();
  });
  it('submits dispute evidence in live mode', async () => {
    live.mockReturnValue(true);
    const update = vi.fn().mockResolvedValue({ id: 'idp_1' });
    const submit = vi.fn().mockResolvedValue({ id: 'idp_1' });
    (getStripeClient as unknown as ReturnType<typeof vi.fn>).mockReturnValue({ issuing: { cards: {}, disputes: { update, submit } } });
    const r = await submitDisputeEvidence('idp_1', { evidence: 'receipt attached' }, 'op');
    expect(update).toHaveBeenCalledWith('idp_1', { evidence: { other: { explanation: 'receipt attached' } } });
    expect(submit).toHaveBeenCalledWith('idp_1');
    expect(prisma.stripeDisputeEvidence.create).not.toHaveBeenCalled();
    expect(r).toEqual({ disputeId: 'idp_1' });
  });
  it('creates evidence in seed mode (files default to [])', async () => {
    sde.create.mockResolvedValueOnce({ id: 'e2', disputeId: 'idp_001', evidence: 'receipt', evidenceFiles: [], by: 'op', at: new Date() });
    const r = await submitDisputeEvidence('idp_001', { evidence: 'receipt' }, 'op');
    expect(sde.create).toHaveBeenCalledWith({ data: { disputeId: 'idp_001', evidence: 'receipt', evidenceFiles: [], by: 'op' } });
    expect(r).toEqual({ disputeId: 'idp_001' });
  });
});
