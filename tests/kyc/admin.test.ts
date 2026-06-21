import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const kycIntake = { findMany: vi.fn(), findUnique: vi.fn(), update: vi.fn() };
  const kycDisposition = { create: vi.fn() };
  const client = {
    kycIntake,
    kycDisposition,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma: client, default: client };
});

import { listIntakes, recordDisposition, KycError } from '@/lib/kyc/admin';
import { prisma } from '@/lib/prisma';

const ki = prisma.kycIntake as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  update: ReturnType<typeof vi.fn>;
};
const kd = prisma.kycDisposition as unknown as { create: ReturnType<typeof vi.fn> };
const tx = (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction;

beforeEach(() => vi.clearAllMocks());

describe('listIntakes', () => {
  it('maps rows and derives latestDecision from the newest disposition', async () => {
    ki.findMany.mockResolvedValueOnce([
      {
        id: 'k1',
        externalId: null,
        customerEmail: 'a@b.io',
        customerName: 'Ada',
        provider: 'PERSONA',
        riskScore: 'LOW',
        status: 'IN_REVIEW',
        submittedAt: new Date('2026-06-01T00:00:00Z'),
        dispositions: [
          { id: 'd1', decision: 'REVIEW', notes: 'pending docs', by: 'op@x.io', at: new Date('2026-06-02T00:00:00Z') },
        ],
      },
    ]);
    const res = await listIntakes();
    expect(ki.findMany).toHaveBeenCalledWith({
      orderBy: { submittedAt: 'desc' },
      include: { dispositions: { orderBy: { at: 'desc' } } },
    });
    expect(res[0]).toMatchObject({ id: 'k1', customerName: 'Ada', latestDecision: 'REVIEW' });
    expect(res[0].submittedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(res[0].dispositions[0].at).toBe('2026-06-02T00:00:00.000Z');
  });

  it('returns latestDecision null when there are no dispositions', async () => {
    ki.findMany.mockResolvedValueOnce([
      { id: 'k2', externalId: null, customerEmail: 'c@d.io', customerName: 'Cay', provider: 'SUMSUB', riskScore: 'HIGH', status: 'PENDING', submittedAt: new Date('2026-06-03T00:00:00Z'), dispositions: [] },
    ]);
    const res = await listIntakes();
    expect(res[0].latestDecision).toBeNull();
  });
});

describe('recordDisposition', () => {
  it('rejects an unknown decision', async () => {
    await expect(recordDisposition('k1', 'NOPE' as never, null, 'op@x.io')).rejects.toBeInstanceOf(KycError);
    expect(ki.findUnique).not.toHaveBeenCalled();
  });

  it('throws when the intake does not exist', async () => {
    ki.findUnique.mockResolvedValueOnce(null);
    await expect(recordDisposition('nope', 'APPROVE', null, 'op@x.io')).rejects.toBeInstanceOf(KycError);
  });

  it('appends a disposition and sets status by decision in one transaction', async () => {
    ki.findUnique.mockResolvedValueOnce({ id: 'k1', customerName: 'Ada' });
    kd.create.mockReturnValueOnce({});
    ki.update.mockReturnValueOnce({});
    const res = await recordDisposition('k1', 'APPROVE', ' looks good ', 'op@x.io');
    expect(tx).toHaveBeenCalledTimes(1);
    expect(kd.create).toHaveBeenCalledWith({
      data: { intakeId: 'k1', decision: 'APPROVE', notes: 'looks good', by: 'op@x.io' },
    });
    expect(ki.update).toHaveBeenCalledWith({ where: { id: 'k1' }, data: { status: 'APPROVED' } });
    expect(res).toEqual({ customerName: 'Ada' });
  });

  it('maps REJECT→REJECTED and REVIEW→IN_REVIEW, nulling empty notes', async () => {
    ki.findUnique.mockResolvedValue({ id: 'k1', customerName: 'Ada' });
    await recordDisposition('k1', 'REJECT', '   ', 'op@x.io');
    expect(ki.update).toHaveBeenLastCalledWith({ where: { id: 'k1' }, data: { status: 'REJECTED' } });
    expect(kd.create).toHaveBeenLastCalledWith({ data: { intakeId: 'k1', decision: 'REJECT', notes: null, by: 'op@x.io' } });
    await recordDisposition('k1', 'REVIEW', null, 'op@x.io');
    expect(ki.update).toHaveBeenLastCalledWith({ where: { id: 'k1' }, data: { status: 'IN_REVIEW' } });
    expect(kd.create).toHaveBeenLastCalledWith({ data: { intakeId: 'k1', decision: 'REVIEW', notes: null, by: 'op@x.io' } });
  });
});
