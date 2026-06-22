import { describe, it, expect, vi, beforeEach } from 'vitest';

// Mock the authz layer (currentUser), the audit sink, and next/cache. The
// domain module is partially mocked: real CodeError class, stubbed operations.
vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('@/lib/referral/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/referral/admin')>();
  return {
    ...actual,
    listCodes: vi.fn(),
    getParentOptions: vi.fn(),
    createCode: vi.fn(),
    bulkCreateCodes: vi.fn(),
    updateCode: vi.fn(),
    deleteCode: vi.fn(),
    getCodeTree: vi.fn(),
    listRedemptions: vi.fn(),
    exportRedemptionsCsv: vi.fn(),
  };
});

import {
  listCodesAction,
  createCodeAction,
  bulkCreateCodesAction,
  deleteCodeAction,
  exportRedemptionsCsvAction,
} from '@/actions/cms/codes';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import * as admin from '@/lib/referral/admin';
import { CodeError } from '@/lib/referral/admin';

const asUser = (privileges: string[]) =>
  ({ id: 'u1', email: 'a@b.io', name: null, role: 'EDITOR', privileges }) as never;

beforeEach(() => {
  vi.clearAllMocks();
});

describe('authorization', () => {
  it('rejects an unauthenticated caller', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null);
    const res = await createCodeAction({ code: 'ALPHA' });
    expect(res).toEqual({ ok: false, error: expect.any(String) });
    expect(admin.createCode).not.toHaveBeenCalled();
  });

  it('rejects a write caller without REFERRAL_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['MANAGE_USERS']));
    const res = await createCodeAction({ code: 'ALPHA' });
    expect(res.ok).toBe(false);
    expect(admin.createCode).not.toHaveBeenCalled();
  });

  it('rejects reads without REFERRAL_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]));
    const res = await listCodesAction({});
    expect(res.ok).toBe(false);
    expect(admin.listCodes).not.toHaveBeenCalled();
  });

  it('allows reads with REFERRAL_VIEW but rejects writes with only REFERRAL_VIEW', async () => {
    // read succeeds
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['REFERRAL_VIEW']));
    const payload = { codes: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } };
    vi.mocked(admin.listCodes).mockResolvedValueOnce(payload);
    const readRes = await listCodesAction({});
    expect(readRes.ok).toBe(true);

    // write rejected (only VIEW, no EDIT)
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['REFERRAL_VIEW']));
    const writeRes = await createCodeAction({ code: 'ALPHA' });
    expect(writeRes.ok).toBe(false);
    expect(admin.createCode).not.toHaveBeenCalled();
  });
});

describe('createCodeAction', () => {
  beforeEach(() => {
    vi.mocked(currentUser).mockResolvedValue(asUser(['REFERRAL_EDIT']));
  });

  it('creates, audits and revalidates on success', async () => {
    vi.mocked(admin.createCode).mockResolvedValueOnce({ id: 'x', code: 'ALPHA' });
    const res = await createCodeAction({ code: 'alpha' });
    expect(res).toEqual({ ok: true });
    expect(admin.createCode).toHaveBeenCalledWith({ code: 'alpha' });
    expect(audit).toHaveBeenCalledWith('create_code', expect.objectContaining({ actorId: 'u1', target: 'ALPHA' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/codes');
  });

  it('maps a CodeError to an error envelope (no 500)', async () => {
    vi.mocked(admin.createCode).mockRejectedValueOnce(new CodeError('Code already exists'));
    const res = await createCodeAction({ code: 'ALPHA' });
    expect(res).toEqual({ ok: false, error: 'Code already exists' });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('listCodesAction', () => {
  it('returns the domain result for a caller with REFERRAL_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['REFERRAL_VIEW']));
    const payload = { codes: [], pagination: { page: 1, limit: 25, total: 0, totalPages: 0 } };
    vi.mocked(admin.listCodes).mockResolvedValueOnce(payload);
    const res = await listCodesAction({ search: 'x' });
    expect(res).toEqual({ ok: true, ...payload });
    expect(admin.listCodes).toHaveBeenCalledWith({ search: 'x' });
  });
});

describe('bulkCreateCodesAction', () => {
  it('rejects a caller without REFERRAL_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]));
    const res = await bulkCreateCodesAction({ prefix: 'AB', count: 3 });
    expect(res.ok).toBe(false);
    expect(admin.bulkCreateCodes).not.toHaveBeenCalled();
  });

  it('generates, audits and revalidates with REFERRAL_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['REFERRAL_EDIT']));
    vi.mocked(admin.bulkCreateCodes).mockResolvedValueOnce({ count: 3, codes: ['AB-1', 'AB-2', 'AB-3'] });
    const res = await bulkCreateCodesAction({ prefix: 'AB', count: 3 });
    expect(res).toMatchObject({ ok: true, count: 3 });
    if (res.ok) expect(res.codes).toEqual(['AB-1', 'AB-2', 'AB-3']);
    expect(audit).toHaveBeenCalledWith('create_code', expect.objectContaining({ actorId: 'u1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/codes');
  });
});

describe('deleteCodeAction', () => {
  it('deletes, audits with the code name and revalidates with REFERRAL_EDIT', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['REFERRAL_EDIT']));
    vi.mocked(admin.deleteCode).mockResolvedValueOnce({ code: 'ALPHA' });
    const res = await deleteCodeAction('x');
    expect(res).toEqual({ ok: true });
    expect(admin.deleteCode).toHaveBeenCalledWith('x');
    expect(audit).toHaveBeenCalledWith('delete_code', expect.objectContaining({ target: 'ALPHA' }));
  });
});

describe('exportRedemptionsCsvAction', () => {
  it('returns the CSV plus a dated filename with REFERRAL_VIEW', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['REFERRAL_VIEW']));
    vi.mocked(admin.exportRedemptionsCsv).mockResolvedValueOnce('id,code\n');
    const res = await exportRedemptionsCsvAction();
    expect(res.ok).toBe(true);
    if (res.ok) {
      expect(res.csv).toBe('id,code\n');
      expect(res.filename).toMatch(/^redemptions-\d{4}-\d{2}-\d{2}\.csv$/);
    }
  });
});
