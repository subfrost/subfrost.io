import { describe, it, expect } from 'vitest';
import {
  STRIPE_APPLICATION_PRODUCTS, STRIPE_APPLICATION_STATUSES,
  STRIPE_APPLICATION_STATUS_LABELS, ApplicationUpsertSchema,
} from '@/lib/stripe/shapes';

describe('application constants', () => {
  it('lists the three products', () => {
    expect(STRIPE_APPLICATION_PRODUCTS).toEqual(['treasury', 'issuing', 'offramp']);
  });
  it('has five statuses, each with a label', () => {
    expect(STRIPE_APPLICATION_STATUSES).toHaveLength(5);
    for (const s of STRIPE_APPLICATION_STATUSES) expect(typeof STRIPE_APPLICATION_STATUS_LABELS[s]).toBe('string');
  });
});

describe('ApplicationUpsertSchema', () => {
  it('accepts a valid patch', () => {
    expect(ApplicationUpsertSchema.safeParse({ status: 'APPROVED', notes: 'ok' }).success).toBe(true);
  });
  it('accepts status without notes', () => {
    expect(ApplicationUpsertSchema.safeParse({ status: 'PENDING' }).success).toBe(true);
  });
  it('rejects an unknown status', () => {
    expect(ApplicationUpsertSchema.safeParse({ status: 'BOGUS' }).success).toBe(false);
  });
});
