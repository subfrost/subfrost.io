import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const mtlEntry = { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn(), createMany: vi.fn() };
  const client = { mtlEntry };
  return { prisma: client, default: client };
});

import { listEntries, seedStates, upsertEntry, MtlError } from '@/lib/mtl/admin';
import { STATE_SEED } from '@/lib/mtl/schema';
import { prisma } from '@/lib/prisma';

const me = prisma.mtlEntry as unknown as Record<string, ReturnType<typeof vi.fn>>;
beforeEach(() => vi.clearAllMocks());

describe('listEntries', () => {
  it('returns rows alpha by state with ISO updatedAt', async () => {
    me.findMany.mockResolvedValueOnce([{ state: 'AL', name: 'Alabama', status: 'REGISTERED', nextFilingDue: null, portalUrl: null, notes: null, updatedAt: new Date('2026-06-01T00:00:00Z') }]);
    const r = await listEntries();
    expect(me.findMany).toHaveBeenCalledWith({ orderBy: { state: 'asc' } });
    expect(r[0].updatedAt).toBe('2026-06-01T00:00:00.000Z');
  });
});

describe('seedStates', () => {
  it('creates only the missing jurisdictions', async () => {
    me.findMany.mockResolvedValueOnce([{ state: 'AL' }]); // AL already present
    me.createMany.mockResolvedValueOnce({ count: STATE_SEED.length - 1 });
    const r = await seedStates();
    expect(me.createMany).toHaveBeenCalledTimes(1);
    expect(me.findMany).toHaveBeenCalledWith({ select: { state: true } });
    const arg = me.createMany.mock.calls[0][0];
    expect(arg.data.find((d: { state: string }) => d.state === 'AL')).toBeUndefined();
    expect(arg.data).toHaveLength(STATE_SEED.length - 1);
    expect(r).toEqual({ created: STATE_SEED.length - 1 });
  });
  it('creates nothing when all are present', async () => {
    me.findMany.mockResolvedValueOnce(STATE_SEED.map((s) => ({ state: s.state })));
    const r = await seedStates();
    expect(me.createMany).not.toHaveBeenCalled();
    expect(r).toEqual({ created: 0 });
  });
});

describe('upsertEntry', () => {
  it('rejects an invalid status without writing', async () => {
    await expect(upsertEntry('AL', { status: 'BOGUS' })).rejects.toBeInstanceOf(MtlError);
    expect(me.update).not.toHaveBeenCalled();
  });
  it('throws when the state was never seeded', async () => {
    me.findUnique.mockResolvedValueOnce(null);
    await expect(upsertEntry('ZZ', { status: 'REGISTERED' })).rejects.toBeInstanceOf(MtlError);
  });
  it('updates an existing entry by state', async () => {
    me.findUnique.mockResolvedValueOnce({ state: 'AL' });
    me.update.mockResolvedValueOnce({ state: 'AL', name: 'Alabama', status: 'REGISTERED', nextFilingDue: '2026-12-31', portalUrl: null, notes: null, updatedAt: new Date('2026-06-02T00:00:00Z') });
    const r = await upsertEntry('AL', { status: 'REGISTERED', nextFilingDue: '2026-12-31' });
    expect(me.update).toHaveBeenCalledWith({ where: { state: 'AL' }, data: { status: 'REGISTERED', nextFilingDue: '2026-12-31', portalUrl: undefined, notes: undefined } });
    expect(r.status).toBe('REGISTERED');
  });
});
