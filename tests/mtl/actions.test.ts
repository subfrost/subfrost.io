import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/mtl/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/mtl/admin')>();
  return { ...actual, listEntries: vi.fn(), seedStates: vi.fn(), upsertEntry: vi.fn() };
});

import { listMtlAction, seedMtlAction, updateMtlAction } from '@/actions/cms/mtl';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import * as mtl from '@/lib/mtl/admin';
import { MtlError } from '@/lib/mtl/admin';

const asUser = (privileges: string[]) =>
  ({ id: 'u1', email: 'op@x.io', name: null, role: 'EDITOR', privileges }) as never;

beforeEach(() => vi.clearAllMocks());

describe('authorization', () => {
  it('rejects reads when unauthenticated (no user)', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null);
    const res = await listMtlAction();
    expect(res).toEqual({ ok: false, error: 'Not authenticated' });
    expect(mtl.listEntries).not.toHaveBeenCalled();
  });

  it('rejects reads without AML_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['MANAGE_FUEL']));
    const res = await listMtlAction();
    expect(res.ok).toBe(false);
    expect(mtl.listEntries).not.toHaveBeenCalled();
  });

  it('rejects writes without AML_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]));
    const res = await updateMtlAction('AL', { status: 'REGISTERED' });
    expect(res.ok).toBe(false);
    expect(mtl.upsertEntry).not.toHaveBeenCalled();
  });

  it('rejects seedMtlAction when unauthenticated', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null);
    const res = await seedMtlAction();
    expect(res).toEqual({ ok: false, error: 'Not authenticated' });
    expect(mtl.seedStates).not.toHaveBeenCalled();
  });

  it('allows read with AML_VIEW but rejects write with only AML_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValue(asUser(['AML_VIEW']));
    vi.mocked(mtl.listEntries).mockResolvedValueOnce([]);
    const list = await listMtlAction();
    expect(list.ok).toBe(true);
    const write = await updateMtlAction('AL', { status: 'REGISTERED' });
    expect(write.ok).toBe(false);
    expect(mtl.upsertEntry).not.toHaveBeenCalled();
  });
});

describe('listMtlAction', () => {
  it('returns entries for an authorized caller', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['AML_VIEW']));
    vi.mocked(mtl.listEntries).mockResolvedValueOnce([]);
    const res = await listMtlAction();
    expect(res).toEqual({ ok: true, entries: [] });
  });
});

describe('updateMtlAction', () => {
  beforeEach(() => vi.mocked(currentUser).mockResolvedValue(asUser(['AML_EDIT'])));

  it('upserts, audits update_mtl with target=state, and revalidates /admin/mtl', async () => {
    const fakeRow = { state: 'AL', name: 'Alabama', status: 'REGISTERED', nextFilingDue: null, portalUrl: null, notes: null, updatedAt: new Date().toISOString() };
    vi.mocked(mtl.upsertEntry).mockResolvedValueOnce(fakeRow);
    const res = await updateMtlAction('AL', { status: 'REGISTERED' });
    expect(res).toEqual({ ok: true });
    expect(mtl.upsertEntry).toHaveBeenCalledWith('AL', { status: 'REGISTERED' });
    expect(audit).toHaveBeenCalledWith('update_mtl', expect.objectContaining({ actorId: 'u1', target: 'AL' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/mtl');
  });

  it('maps an MtlError to an error envelope without auditing', async () => {
    vi.mocked(mtl.upsertEntry).mockRejectedValueOnce(new MtlError('Unknown jurisdiction: ZZ'));
    const res = await updateMtlAction('ZZ', { status: 'REGISTERED' });
    expect(res).toEqual({ ok: false, error: 'Unknown jurisdiction: ZZ' });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('seedMtlAction', () => {
  beforeEach(() => vi.mocked(currentUser).mockResolvedValue(asUser(['AML_EDIT'])));

  it('seeds, audits seed_mtl with target null, and revalidates /admin/mtl', async () => {
    vi.mocked(mtl.seedStates).mockResolvedValueOnce({ created: 51 });
    const res = await seedMtlAction();
    expect(res).toEqual({ ok: true, created: 51 });
    expect(audit).toHaveBeenCalledWith('seed_mtl', expect.objectContaining({ actorId: 'u1', target: null }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/mtl');
  });

  it('maps an MtlError to an error envelope without auditing', async () => {
    vi.mocked(mtl.seedStates).mockRejectedValueOnce(new MtlError('Seed failed'));
    const res = await seedMtlAction();
    expect(res).toEqual({ ok: false, error: 'Seed failed' });
    expect(audit).not.toHaveBeenCalled();
  });
});
