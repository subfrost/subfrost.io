import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/prisma', () => {
  const fincenDraft = { findFirst: vi.fn(), findUnique: vi.fn(), findMany: vi.fn(), create: vi.fn(), update: vi.fn() };
  const fincenSubmission = { findMany: vi.fn(), create: vi.fn() };
  const client = { fincenDraft, fincenSubmission };
  return { prisma: client, default: client };
});

import {
  getForm107, saveForm107, listSar, createSar, updateSar, createCtr, updateCtr,
  listSubmissions, queueSubmission, FincenError,
} from '@/lib/fincen/admin';
import { FORM_107_DEFAULTS } from '@/lib/fincen/schemas';
import { prisma } from '@/lib/prisma';

const fd = prisma.fincenDraft as unknown as Record<string, ReturnType<typeof vi.fn>>;
const fs = prisma.fincenSubmission as unknown as Record<string, ReturnType<typeof vi.fn>>;

beforeEach(() => vi.clearAllMocks());

const row = (over: Record<string, unknown> = {}) => ({
  id: 'd1', type: 'FORM107', data: FORM_107_DEFAULTS, updatedBy: 'op@x.io',
  updatedAt: new Date('2026-06-01T00:00:00Z'), createdAt: new Date('2026-06-01T00:00:00Z'), ...over,
});

describe('getForm107', () => {
  it('returns null when no Form 107 draft exists', async () => {
    fd.findFirst.mockResolvedValueOnce(null);
    expect(await getForm107()).toBeNull();
    expect(fd.findFirst).toHaveBeenCalledWith({ where: { type: 'FORM107' } });
  });
  it('maps the row to a DraftRow with ISO updatedAt', async () => {
    fd.findFirst.mockResolvedValueOnce(row());
    const r = await getForm107();
    expect(r?.updatedAt).toBe('2026-06-01T00:00:00.000Z');
    expect(r?.data.legalName).toBe(FORM_107_DEFAULTS.legalName);
  });
});

describe('saveForm107', () => {
  it('rejects invalid input with a FincenError', async () => {
    await expect(saveForm107({ ...FORM_107_DEFAULTS, ein: 'bad' }, 'op@x.io')).rejects.toBeInstanceOf(FincenError);
    expect(fd.create).not.toHaveBeenCalled();
    expect(fd.update).not.toHaveBeenCalled();
    expect(fd.findFirst).not.toHaveBeenCalled();
  });
  it('creates when none exists', async () => {
    fd.findFirst.mockResolvedValueOnce(null);
    fd.create.mockResolvedValueOnce(row());
    await saveForm107(FORM_107_DEFAULTS, 'op@x.io');
    expect(fd.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'FORM107', updatedBy: 'op@x.io' }) }));
  });
  it('updates the existing singleton', async () => {
    fd.findFirst.mockResolvedValueOnce(row({ id: 'existing' }));
    fd.update.mockResolvedValueOnce(row({ id: 'existing' }));
    await saveForm107(FORM_107_DEFAULTS, 'op@x.io');
    expect(fd.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'existing' } }));
  });
});

describe('createSar', () => {
  it('rejects a too-short narrative', async () => {
    const bad = { subject: { name: 'X' }, activity: { startDate: '2026-01-01', totalUsd: 1, category: 'fraud' }, narrative: 'short', preparerName: 'CO' };
    await expect(createSar(bad, 'op@x.io')).rejects.toBeInstanceOf(FincenError);
    expect(fd.create).not.toHaveBeenCalled();
  });
  it('creates a SAR draft when valid', async () => {
    const good = { subject: { name: 'X' }, activity: { startDate: '2026-01-01', totalUsd: 1, category: 'fraud' }, narrative: 'y'.repeat(40), preparerName: 'CO' };
    fd.create.mockResolvedValueOnce(row({ id: 's1', type: 'SAR', data: good }));
    const r = await createSar(good, 'op@x.io');
    expect(fd.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'SAR' }) }));
    expect(r.type).toBe('SAR');
  });
});

describe('updateSar', () => {
  it('updates an existing SAR by id after validation', async () => {
    const good = { subject: { name: 'X' }, activity: { startDate: '2026-01-01', totalUsd: 1, category: 'fraud' }, narrative: 'y'.repeat(40), preparerName: 'CO' };
    fd.update.mockResolvedValueOnce(row({ id: 's9', type: 'SAR', data: good }));
    const r = await updateSar('s9', good, 'op@x.io');
    expect(fd.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 's9' } }));
    expect(r.id).toBe('s9');
  });
  it('rejects an invalid SAR update without writing', async () => {
    await expect(updateSar('s9', { narrative: 'short' }, 'op@x.io')).rejects.toBeInstanceOf(FincenError);
    expect(fd.update).not.toHaveBeenCalled();
  });
});

describe('createCtr', () => {
  const good = { subject: { name: 'X', accountId: 'a1', address: { line1: '1 A St', city: 'Houston', state: 'TX', zip: '77006' } }, transactionDate: '2026-01-01', cashIn: 8000, cashOut: 4000, preparerName: 'CO' };
  it('rejects an under-$10k transaction', async () => {
    await expect(createCtr({ ...good, cashIn: 3000, cashOut: 4000 }, 'op@x.io')).rejects.toBeInstanceOf(FincenError);
    expect(fd.create).not.toHaveBeenCalled();
  });
  it('creates a CTR draft when valid', async () => {
    fd.create.mockResolvedValueOnce(row({ id: 'c1', type: 'CTR', data: good }));
    const r = await createCtr(good, 'op@x.io');
    expect(fd.create).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ type: 'CTR' }) }));
    expect(r.type).toBe('CTR');
  });
});

describe('updateCtr', () => {
  it('updates an existing CTR by id after validation', async () => {
    const good = { subject: { name: 'X', accountId: 'a1', address: { line1: '1 A St', city: 'Houston', state: 'TX', zip: '77006' } }, transactionDate: '2026-01-01', cashIn: 8000, cashOut: 4000, preparerName: 'CO' };
    fd.update.mockResolvedValueOnce(row({ id: 'c9', type: 'CTR', data: good }));
    const r = await updateCtr('c9', good, 'op@x.io');
    expect(fd.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: 'c9' } }));
    expect(r.id).toBe('c9');
  });
});

describe('listSar', () => {
  it('queries SAR drafts newest-first', async () => {
    fd.findMany.mockResolvedValueOnce([]);
    await listSar();
    expect(fd.findMany).toHaveBeenCalledWith({ where: { type: 'SAR' }, orderBy: { updatedAt: 'desc' } });
  });
});

describe('queueSubmission', () => {
  it('throws when the draft does not exist', async () => {
    fd.findUnique.mockResolvedValueOnce(null);
    await expect(queueSubmission('nope', 'op@x.io')).rejects.toBeInstanceOf(FincenError);
    expect(fs.create).not.toHaveBeenCalled();
  });
  it('queues a submission copying the draft type with a LOCAL tracking id', async () => {
    fd.findUnique.mockResolvedValueOnce(row({ id: 'd1', type: 'SAR' }));
    fs.create.mockImplementationOnce((args: { data: Record<string, unknown> }) => Promise.resolve({
      id: 'sub1', draftId: 'd1', type: 'SAR', trackingId: args.data.trackingId, status: 'QUEUED',
      message: args.data.message ?? null, submittedBy: 'op@x.io', submittedAt: new Date('2026-06-02T00:00:00Z'),
    }));
    const r = await queueSubmission('d1', 'op@x.io');
    expect(r.type).toBe('SAR');
    expect(r.status).toBe('QUEUED');
    expect(String(r.trackingId).startsWith('LOCAL-')).toBe(true);
  });
});

describe('listSubmissions', () => {
  it('queries submissions newest-first', async () => {
    fs.findMany.mockResolvedValueOnce([]);
    await listSubmissions();
    expect(fs.findMany).toHaveBeenCalledWith({ orderBy: { submittedAt: 'desc' } });
  });
});
