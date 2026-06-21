import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/fincen/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/fincen/admin')>();
  return {
    ...actual,
    getForm107: vi.fn(), saveForm107: vi.fn(),
    listSar: vi.fn(), createSar: vi.fn(), updateSar: vi.fn(),
    listCtr: vi.fn(), createCtr: vi.fn(), updateCtr: vi.fn(),
    listSubmissions: vi.fn(), queueSubmission: vi.fn(),
  };
});

import {
  getFincenDataAction, saveForm107Action, createSarAction, queueSubmissionAction,
} from '@/actions/cms/fincen';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import * as fincen from '@/lib/fincen/admin';
import { FincenError } from '@/lib/fincen/admin';

const asUser = (privileges: string[]) =>
  ({ id: 'u1', email: 'op@x.io', name: null, role: 'EDITOR', privileges }) as never;

beforeEach(() => vi.clearAllMocks());

describe('authorization', () => {
  it('rejects reads without MANAGE_AML', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['MANAGE_FUEL']));
    const res = await getFincenDataAction();
    expect(res.ok).toBe(false);
    expect(fincen.getForm107).not.toHaveBeenCalled();
  });
  it('rejects unauthenticated', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(null);
    const res = await saveForm107Action({});
    expect(res).toEqual({ ok: false, error: 'Not authenticated' });
    expect(fincen.saveForm107).not.toHaveBeenCalled();
  });
  it('rejects writes without MANAGE_AML', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]));
    const res = await queueSubmissionAction('d1');
    expect(res.ok).toBe(false);
    expect(fincen.queueSubmission).not.toHaveBeenCalled();
  });
});

describe('getFincenDataAction', () => {
  it('aggregates all four reads for an authorized caller', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['MANAGE_AML']));
    vi.mocked(fincen.getForm107).mockResolvedValueOnce(null);
    vi.mocked(fincen.listSar).mockResolvedValueOnce([]);
    vi.mocked(fincen.listCtr).mockResolvedValueOnce([]);
    vi.mocked(fincen.listSubmissions).mockResolvedValueOnce([]);
    const res = await getFincenDataAction();
    expect(res).toEqual({ ok: true, form107: null, sar: [], ctr: [], submissions: [] });
  });
});

describe('mutations', () => {
  beforeEach(() => vi.mocked(currentUser).mockResolvedValue(asUser(['MANAGE_AML'])));

  it('saveForm107Action audits and revalidates', async () => {
    vi.mocked(fincen.saveForm107).mockResolvedValueOnce({ id: 'd1', type: 'FORM107', data: {} as never, updatedBy: 'op@x.io', updatedAt: 'x' });
    const res = await saveForm107Action({});
    expect(res).toEqual({ ok: true });
    expect(fincen.saveForm107).toHaveBeenCalledWith({}, 'op@x.io');
    expect(audit).toHaveBeenCalledWith('save_form107', expect.objectContaining({ actorId: 'u1' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/fincen');
  });

  it('createSarAction maps a FincenError without auditing', async () => {
    vi.mocked(fincen.createSar).mockRejectedValueOnce(new FincenError('Validation failed'));
    const res = await createSarAction({});
    expect(res).toEqual({ ok: false, error: 'Validation failed' });
    expect(audit).not.toHaveBeenCalled();
  });

  it('queueSubmissionAction audits with the draftId target', async () => {
    vi.mocked(fincen.queueSubmission).mockResolvedValueOnce({ id: 'sub1', draftId: 'd1', type: 'SAR', trackingId: 'LOCAL-X', status: 'QUEUED', message: null, submittedBy: 'op@x.io', submittedAt: 'x' });
    const res = await queueSubmissionAction('d1');
    expect(res).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('queue_fincen_submission', expect.objectContaining({ target: 'd1' }));
  });
});
