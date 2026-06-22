import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/cms/authz', () => ({ currentUser: vi.fn() }));
vi.mock('@/lib/cms/audit', () => ({ audit: vi.fn() }));
vi.mock('next/cache', () => ({ revalidatePath: vi.fn() }));
vi.mock('next/headers', () => ({ headers: vi.fn(async () => new Map()) }));
vi.mock('@/lib/stripe/applications', () => ({ listApplications: vi.fn(), upsertApplication: vi.fn() }));

import { listApplicationsAction, upsertApplicationAction } from '@/actions/cms/billing';
import { currentUser } from '@/lib/cms/authz';
import { audit } from '@/lib/cms/audit';
import { revalidatePath } from 'next/cache';
import { listApplications, upsertApplication } from '@/lib/stripe/applications';
import { BillingError } from '@/lib/stripe/config';

const cu = currentUser as unknown as ReturnType<typeof vi.fn>;
const asUser = (privileges: string[]) => cu.mockResolvedValue({ id: 'u1', email: 'op@subfrost.io', privileges });
beforeEach(() => vi.clearAllMocks());

describe('gate', () => {
  it('denies when unauthenticated', async () => {
    cu.mockResolvedValueOnce(null);
    expect(await listApplicationsAction()).toEqual({ ok: false, error: 'Not authenticated' });
  });
  it('denies read without BILLING_VIEW', async () => {
    asUser(['MANAGE_AML']);
    expect((await listApplicationsAction()).ok).toBe(false);
    expect(listApplications).not.toHaveBeenCalled();
  });
  it('denies write without BILLING_EDIT', async () => {
    asUser(['BILLING_VIEW']);
    expect(await upsertApplicationAction('treasury', { status: 'APPROVED' })).toEqual({ ok: false, error: 'Insufficient privileges' });
    expect(upsertApplication).not.toHaveBeenCalled();
  });
  it('denies write without any billing privilege', async () => {
    asUser(['MANAGE_AML']);
    expect(await upsertApplicationAction('treasury', { status: 'APPROVED' })).toEqual({ ok: false, error: 'Insufficient privileges' });
    expect(upsertApplication).not.toHaveBeenCalled();
  });
});

describe('actions', () => {
  it('lists applications with BILLING_VIEW', async () => {
    asUser(['BILLING_VIEW']);
    (listApplications as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce([{ id: 'a1', product: 'treasury', status: 'PENDING', notes: null, updatedBy: 'x', updatedAt: '2026-06-01T00:00:00.000Z' }]);
    const r = await listApplicationsAction();
    expect(r).toEqual({ ok: true, applications: [{ id: 'a1', product: 'treasury', status: 'PENDING', notes: null, updatedBy: 'x', updatedAt: '2026-06-01T00:00:00.000Z' }] });
  });
  it('upserts, audits, revalidates with BILLING_EDIT', async () => {
    asUser(['BILLING_EDIT']);
    (upsertApplication as unknown as ReturnType<typeof vi.fn>).mockResolvedValueOnce({ id: 'a1', product: 'treasury', status: 'APPROVED', notes: null, updatedBy: 'op@subfrost.io', updatedAt: '2026-06-02T00:00:00.000Z' });
    const r = await upsertApplicationAction('treasury', { status: 'APPROVED' });
    expect(r).toEqual({ ok: true });
    expect(audit).toHaveBeenCalledWith('stripe_application_update', expect.objectContaining({ actorId: 'u1', target: 'treasury' }));
    expect(revalidatePath).toHaveBeenCalledWith('/admin/billing/applications');
  });
  it('maps BillingError without auditing', async () => {
    asUser(['BILLING_EDIT']);
    (upsertApplication as unknown as ReturnType<typeof vi.fn>).mockRejectedValueOnce(new BillingError('Unknown product: x'));
    const r = await upsertApplicationAction('x', { status: 'APPROVED' });
    expect(r).toEqual({ ok: false, error: 'Unknown product: x' });
    expect(audit).not.toHaveBeenCalled();
  });
});
