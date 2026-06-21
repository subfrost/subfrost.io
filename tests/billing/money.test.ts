import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripeMoneyIntent = { findMany: vi.fn(), findUnique: vi.fn(), create: vi.fn(), update: vi.fn() };
  const client = { stripeMoneyIntent };
  return { prisma: client, default: client };
});
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listIntents, queueAchTransfer, confirmIntent, cancelIntent } from '@/lib/stripe/money';
import { BillingError, StripeNotWiredError, isLive } from '@/lib/stripe/config';
import { prisma } from '@/lib/prisma';

const smi = prisma.stripeMoneyIntent as unknown as Record<string, ReturnType<typeof vi.fn>>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => { vi.clearAllMocks(); live.mockReturnValue(false); });

describe('listIntents', () => {
  it('filters by kind and maps ISO dates', async () => {
    smi.findMany.mockResolvedValueOnce([{ id: 'm1', kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'Gusto', reference: null, memo: null, status: 'QUEUED', requestedBy: 'op', requestedAt: new Date('2026-06-02T00:00:00Z'), decidedBy: null, decidedAt: null }]);
    const r = await listIntents('ACH_TRANSFER');
    expect(smi.findMany).toHaveBeenCalledWith({ where: { kind: 'ACH_TRANSFER' }, orderBy: { requestedAt: 'desc' } });
    expect(r[0].requestedAt).toBe('2026-06-02T00:00:00.000Z');
    expect(r[0].decidedAt).toBeNull();
  });
});

describe('queueAchTransfer', () => {
  it('rejects invalid input without writing', async () => {
    await expect(queueAchTransfer({ direction: 'in', amount: 0, counterparty: 'x' }, 'op')).rejects.toBeInstanceOf(BillingError);
    expect(smi.create).not.toHaveBeenCalled();
  });
  it('queues a QUEUED intent in seed mode', async () => {
    smi.create.mockResolvedValueOnce({ id: 'm2', kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'Gusto', reference: null, memo: 'payroll', status: 'QUEUED', requestedBy: 'op', requestedAt: new Date('2026-06-03T00:00:00Z'), decidedBy: null, decidedAt: null });
    const r = await queueAchTransfer({ direction: 'out', amount: 5000, counterparty: 'Gusto', memo: 'payroll' }, 'op');
    expect(smi.create).toHaveBeenCalledWith({ data: { kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'Gusto', memo: 'payroll', status: 'QUEUED', requestedBy: 'op' } });
    expect(r.status).toBe('QUEUED');
  });
  it('queues even in live mode (queueing is local, no Stripe call)', async () => {
    live.mockReturnValue(true);
    smi.create.mockResolvedValueOnce({ id: 'm3', kind: 'ACH_TRANSFER', direction: 'in', amount: 100, counterparty: 'x', reference: null, memo: null, status: 'QUEUED', requestedBy: 'op', requestedAt: new Date(), decidedBy: null, decidedAt: null });
    await expect(queueAchTransfer({ direction: 'in', amount: 100, counterparty: 'x' }, 'op')).resolves.toMatchObject({ status: 'QUEUED' });
    expect(smi.create).toHaveBeenCalled();
  });
});

describe('confirmIntent', () => {
  it('rejects when not found or not QUEUED', async () => {
    smi.findUnique.mockResolvedValueOnce(null);
    await expect(confirmIntent('nope', 'op')).rejects.toBeInstanceOf(BillingError);
    smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'CONFIRMED' });
    await expect(confirmIntent('m1', 'op')).rejects.toBeInstanceOf(BillingError);
    expect(smi.update).not.toHaveBeenCalled();
  });
  it('throws StripeNotWiredError in live mode without updating', async () => {
    live.mockReturnValue(true);
    smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'QUEUED' });
    await expect(confirmIntent('m1', 'op')).rejects.toBeInstanceOf(StripeNotWiredError);
    expect(smi.update).not.toHaveBeenCalled();
  });
  it('marks CONFIRMED with decidedBy in seed mode', async () => {
    smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'QUEUED' });
    smi.update.mockResolvedValueOnce({ id: 'm1', kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'Gusto', reference: null, memo: null, status: 'CONFIRMED', requestedBy: 'req', requestedAt: new Date('2026-06-03T00:00:00Z'), decidedBy: 'op', decidedAt: new Date('2026-06-04T00:00:00Z') });
    const r = await confirmIntent('m1', 'op');
    expect(smi.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'CONFIRMED', decidedBy: 'op', decidedAt: expect.any(Date) } });
    expect(r.status).toBe('CONFIRMED');
    expect(r.decidedBy).toBe('op');
  });
});

describe('cancelIntent', () => {
  it('marks CANCELED in seed AND live (no Stripe call)', async () => {
    for (const liveMode of [false, true]) {
      vi.clearAllMocks();
      live.mockReturnValue(liveMode);
      smi.findUnique.mockResolvedValueOnce({ id: 'm1', status: 'QUEUED' });
      smi.update.mockResolvedValueOnce({ id: 'm1', kind: 'ACH_TRANSFER', direction: 'out', amount: 5000, counterparty: 'g', reference: null, memo: null, status: 'CANCELED', requestedBy: 'req', requestedAt: new Date('2026-06-03T00:00:00Z'), decidedBy: 'op', decidedAt: new Date('2026-06-04T00:00:00Z') });
      const r = await cancelIntent('m1', 'op');
      expect(r.status).toBe('CANCELED');
      expect(smi.update).toHaveBeenCalledWith({ where: { id: 'm1' }, data: { status: 'CANCELED', decidedBy: 'op', decidedAt: expect.any(Date) } });
    }
  });
});
