import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const stripeApplication = { findMany: vi.fn(), upsert: vi.fn() };
  const client = { stripeApplication };
  return { prisma: client, default: client };
});

import { listApplications, upsertApplication } from '@/lib/stripe/applications';
import { BillingError } from '@/lib/stripe/config';
import { prisma } from '@/lib/prisma';

const sa = prisma.stripeApplication as unknown as Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => vi.clearAllMocks());

describe('listApplications', () => {
  it('returns rows alpha by product with ISO updatedAt', async () => {
    sa.findMany.mockResolvedValueOnce([
      { id: 'a1', product: 'issuing', status: 'PENDING', notes: null, updatedBy: 'x@y.z', updatedAt: new Date('2026-06-01T00:00:00Z') },
    ]);
    const r = await listApplications();
    expect(sa.findMany).toHaveBeenCalledWith({ orderBy: { product: 'asc' } });
    expect(r[0].updatedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(r[0].product).toBe('issuing');
  });
});

describe('upsertApplication', () => {
  it('rejects an unknown product without writing', async () => {
    await expect(upsertApplication('bogus', { status: 'APPROVED' }, 'x@y.z')).rejects.toBeInstanceOf(BillingError);
    expect(sa.upsert).not.toHaveBeenCalled();
  });
  it('rejects an invalid status without writing', async () => {
    await expect(upsertApplication('treasury', { status: 'NOPE' }, 'x@y.z')).rejects.toBeInstanceOf(BillingError);
    expect(sa.upsert).not.toHaveBeenCalled();
  });
  it('upserts by product setting status/notes/updatedBy', async () => {
    sa.upsert.mockResolvedValueOnce({ id: 'a1', product: 'treasury', status: 'APPROVED', notes: 'done', updatedBy: 'x@y.z', updatedAt: new Date('2026-06-02T00:00:00Z') });
    const r = await upsertApplication('treasury', { status: 'APPROVED', notes: 'done' }, 'x@y.z');
    expect(sa.upsert).toHaveBeenCalledWith({
      where: { product: 'treasury' },
      create: { product: 'treasury', status: 'APPROVED', notes: 'done', updatedBy: 'x@y.z' },
      update: { status: 'APPROVED', notes: 'done', updatedBy: 'x@y.z' },
    });
    expect(r.status).toBe('APPROVED');
  });
});
