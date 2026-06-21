import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const fuelAllocation = {
    findMany: vi.fn(),
    findUnique: vi.fn(),
    upsert: vi.fn(),
    delete: vi.fn(),
  };
  const client = {
    fuelAllocation,
    $transaction: vi.fn((ops: Promise<unknown>[]) => Promise.all(ops)),
  };
  return { prisma: client, default: client };
});

import {
  listAllocations,
  upsertAllocations,
  deleteAllocation,
  FuelError,
} from '@/lib/fuel/admin';
import { prisma } from '@/lib/prisma';

const fa = prisma.fuelAllocation as unknown as {
  findMany: ReturnType<typeof vi.fn>;
  findUnique: ReturnType<typeof vi.fn>;
  upsert: ReturnType<typeof vi.fn>;
  delete: ReturnType<typeof vi.fn>;
};
const tx = (prisma as unknown as { $transaction: ReturnType<typeof vi.fn> }).$transaction;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('listAllocations', () => {
  it('returns allocations newest-first with the summed total', async () => {
    fa.findMany.mockResolvedValueOnce([
      { id: 'a', address: 'bc1pa', amount: 10, note: 'x', createdAt: new Date('2026-03-02T00:00:00Z'), updatedAt: new Date('2026-03-02T00:00:00Z') },
      { id: 'b', address: 'bc1pb', amount: 5.5, note: null, createdAt: new Date('2026-03-01T00:00:00Z'), updatedAt: new Date('2026-03-01T00:00:00Z') },
    ]);
    const res = await listAllocations();
    expect(fa.findMany).toHaveBeenCalledWith({ orderBy: { createdAt: 'desc' } });
    expect(res.totalAllocated).toBe(15.5);
    expect(res.allocations[0]).toMatchObject({ address: 'bc1pa', amount: 10 });
    expect(res.allocations[0].createdAt).toBe('2026-03-02T00:00:00.000Z');
  });
});

describe('upsertAllocations', () => {
  it('rejects an empty entry list', async () => {
    await expect(upsertAllocations([])).rejects.toBeInstanceOf(FuelError);
  });

  it('rejects an entry with no address', async () => {
    await expect(upsertAllocations([{ address: '   ', amount: 1 }])).rejects.toBeInstanceOf(FuelError);
  });

  it('rejects a negative or non-numeric amount', async () => {
    await expect(upsertAllocations([{ address: 'bc1pa', amount: -1 }])).rejects.toBeInstanceOf(FuelError);
    await expect(upsertAllocations([{ address: 'bc1pa', amount: NaN }])).rejects.toBeInstanceOf(FuelError);
  });

  it('rounds amounts to 2dp and upserts each entry by address in one transaction', async () => {
    fa.upsert.mockImplementation((args: { where: { address: string }; create: { amount: number } }) =>
      Promise.resolve({ id: 'x', ...args.create, address: args.where.address }),
    );
    const res = await upsertAllocations([
      { address: ' bc1pa ', amount: 3.999, note: ' tester ' },
      { address: 'bc1pb', amount: 10 },
    ]);
    expect(tx).toHaveBeenCalledTimes(1);
    expect(fa.upsert).toHaveBeenCalledWith({
      where: { address: 'bc1pa' },
      create: { address: 'bc1pa', amount: 4, note: 'tester' },
      update: { amount: 4, note: 'tester' },
    });
    expect(fa.upsert).toHaveBeenCalledWith({
      where: { address: 'bc1pb' },
      create: { address: 'bc1pb', amount: 10, note: null },
      update: { amount: 10, note: null },
    });
    expect(res).toEqual({ count: 2 });
  });
});

describe('deleteAllocation', () => {
  it('deletes an existing allocation and returns its address', async () => {
    fa.findUnique.mockResolvedValueOnce({ id: 'x', address: 'bc1pa' });
    fa.delete.mockResolvedValueOnce({ id: 'x', address: 'bc1pa' });
    const res = await deleteAllocation('x');
    expect(fa.delete).toHaveBeenCalledWith({ where: { id: 'x' } });
    expect(res).toEqual({ address: 'bc1pa' });
  });

  it('throws when the allocation does not exist', async () => {
    fa.findUnique.mockResolvedValueOnce(null);
    await expect(deleteAllocation('nope')).rejects.toBeInstanceOf(FuelError);
    expect(fa.delete).not.toHaveBeenCalled();
  });
});
