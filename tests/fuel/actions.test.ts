import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/fuel/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fuel/admin')>();
  return {
    ...actual,
    listAllocations: vi.fn(),
    upsertAllocations: vi.fn(),
    deleteAllocation: vi.fn(),
  };
});

import {
  listAllocationsAction,
  upsertAllocationsAction,
  deleteAllocationAction,
} from '@/actions/cms/fuel';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import * as fuel from '@/lib/fuel/admin';
import { FuelError } from '@/lib/fuel/admin';

const asUser = (privileges: string[]) =>
  ({ id: 'u1', email: 'a@b.io', name: null, role: 'EDITOR', privileges }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authorization', () => {
  it('rejects reads without FUEL_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['referral.read']));
    const res = await listAllocationsAction();
    expect(res.ok).toBe(false);
    expect(fuel.listAllocations).not.toHaveBeenCalled();
  });

  it('rejects writes without FUEL_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]));
    const res = await upsertAllocationsAction([{ address: 'bc1pa', amount: 1 }]);
    expect(res.ok).toBe(false);
    expect(fuel.upsertAllocations).not.toHaveBeenCalled();
  });

  it('allows read with FUEL_VIEW but rejects write with only FUEL_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser(['fuel.read']));
    const list = await listAllocationsAction();
    expect(list.ok).toBe(true);
    const write = await upsertAllocationsAction([{ address: 'bc1pa', amount: 1 }]);
    expect(write.ok).toBe(false);
    expect(fuel.upsertAllocations).not.toHaveBeenCalled();
  });
});

describe('upsertAllocationsAction', () => {
  beforeEach(() => {
    vi.mocked(currentUser).mockResolvedValue(asUser(['fuel.edit']));
  });

  it('upserts, audits and revalidates', async () => {
    vi.mocked(fuel.upsertAllocations).mockResolvedValueOnce({ count: 2 });
    const res = await upsertAllocationsAction([
      { address: 'bc1pa', amount: 1 },
      { address: 'bc1pb', amount: 2 },
    ]);
    expect(res).toEqual({ ok: true, count: 2 });
    expect(audit).toHaveBeenCalledWith('upsert_fuel', expect.objectContaining({ actorId: 'u1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/fuel');
  });

  it('maps a FuelError to an error envelope', async () => {
    vi.mocked(fuel.upsertAllocations).mockRejectedValueOnce(new FuelError('Invalid amount for bc1pa'));
    const res = await upsertAllocationsAction([{ address: 'bc1pa', amount: -1 }]);
    expect(res).toEqual({ ok: false, error: 'Invalid amount for bc1pa' });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('deleteAllocationAction', () => {
  it('deletes, audits with the address and revalidates', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['fuel.edit']));
    vi.mocked(fuel.deleteAllocation).mockResolvedValueOnce({ address: 'bc1pa' });
    const res = await deleteAllocationAction('x');
    expect(res).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('delete_fuel', expect.objectContaining({ target: 'bc1pa' }));
  });
});

describe('listAllocationsAction', () => {
  it('returns the domain payload for an authorized caller', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['fuel.read']));
    const payload = { allocations: [], totalAllocated: 0 };
    vi.mocked(fuel.listAllocations).mockResolvedValueOnce(payload);
    const res = await listAllocationsAction();
    expect(res).toEqual({ ok: true, ...payload });
  });
});
