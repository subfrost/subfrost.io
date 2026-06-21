import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/kyc/admin', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/kyc/admin')>();
  return { ...actual, listIntakes: vi.fn(), recordDisposition: vi.fn() };
});

import { listIntakesAction, recordDispositionAction } from '@/actions/cms/kyc';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import * as kyc from '@/lib/kyc/admin';
import { KycError } from '@/lib/kyc/admin';

const asUser = (privileges: string[]) =>
  ({ id: 'u1', email: 'op@x.io', name: null, role: 'EDITOR', privileges }) as never;

beforeEach(() => vi.clearAllMocks());

describe('authorization', () => {
  it('rejects reads without MANAGE_AML', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['MANAGE_FUEL']));
    const res = await listIntakesAction();
    expect(res.ok).toBe(false);
    expect(kyc.listIntakes).not.toHaveBeenCalled();
  });

  it('rejects dispositions without MANAGE_AML', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser([]));
    const res = await recordDispositionAction('k1', 'APPROVE', null);
    expect(res.ok).toBe(false);
    expect(kyc.recordDisposition).not.toHaveBeenCalled();
  });
});

describe('recordDispositionAction', () => {
  beforeEach(() => vi.mocked(currentUser).mockResolvedValue(asUser(['MANAGE_AML'])));

  it('records, audits with the customer name and revalidates', async () => {
    vi.mocked(kyc.recordDisposition).mockResolvedValueOnce({ customerName: 'Ada' });
    const res = await recordDispositionAction('k1', 'APPROVE', 'ok');
    expect(res).toEqual({ ok: true });
    expect(kyc.recordDisposition).toHaveBeenCalledWith('k1', 'APPROVE', 'ok', 'op@x.io');
    expect(audit).toHaveBeenCalledWith('kyc_disposition', expect.objectContaining({ actorId: 'u1', target: 'Ada' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/kyc');
  });

  it('maps a KycError to an error envelope without auditing', async () => {
    vi.mocked(kyc.recordDisposition).mockRejectedValueOnce(new KycError('Intake not found'));
    const res = await recordDispositionAction('nope', 'APPROVE', null);
    expect(res).toEqual({ ok: false, error: 'Intake not found' });
    expect(audit).not.toHaveBeenCalled();
  });
});

describe('listIntakesAction', () => {
  it('returns the intakes for an authorized caller', async () => {
    vi.mocked(currentUser).mockResolvedValueOnce(asUser(['MANAGE_AML']));
    vi.mocked(kyc.listIntakes).mockResolvedValueOnce([]);
    const res = await listIntakesAction();
    expect(res).toEqual({ ok: true, intakes: [] });
  });
});
