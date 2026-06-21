import { describe, it, expect } from 'vitest';
import { MTL_STATUSES, MTL_STATUS_LABELS, STATE_SEED, MtlUpsertSchema } from '@/lib/mtl/schema';

describe('MTL constants', () => {
  it('has the six statuses, each with a label', () => {
    expect(MTL_STATUSES).toHaveLength(6);
    for (const s of MTL_STATUSES) expect(typeof MTL_STATUS_LABELS[s]).toBe('string');
  });
  it('seeds 51 jurisdictions (50 states + DC) with 2-letter codes', () => {
    expect(STATE_SEED).toHaveLength(51);
    expect(STATE_SEED.every((e) => e.state.length === 2)).toBe(true);
    expect(STATE_SEED.find((e) => e.state === 'DC')?.name).toBe('District of Columbia');
  });
});

describe('MtlUpsertSchema', () => {
  it('accepts a valid patch', () => {
    expect(MtlUpsertSchema.safeParse({ status: 'REGISTERED', nextFilingDue: '2026-12-31', notes: 'ok' }).success).toBe(true);
  });
  it('rejects an unknown status', () => {
    expect(MtlUpsertSchema.safeParse({ status: 'BOGUS' }).success).toBe(false);
  });
  it('rejects a non-url portalUrl', () => {
    expect(MtlUpsertSchema.safeParse({ status: 'REGISTERED', portalUrl: 'not a url' }).success).toBe(false);
  });
});
