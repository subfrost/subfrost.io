import { describe, it, expect } from 'vitest';
import {
  PROMO_TYPES, SUBSCRIPTION_ACTIONS, PROMO_TYPE_LABELS, SUBSCRIPTION_ACTION_LABELS,
  CreatePromoSchema, SubscriptionActionSchema,
} from '@/lib/stripe/shapes';

describe('revenue constants', () => {
  it('promo types are PERCENT/AMOUNT, each labelled', () => {
    expect(PROMO_TYPES).toEqual(['PERCENT', 'AMOUNT']);
    for (const t of PROMO_TYPES) expect(typeof PROMO_TYPE_LABELS[t]).toBe('string');
  });
  it('subscription actions are cancel/resume, each labelled', () => {
    expect(SUBSCRIPTION_ACTIONS).toEqual(['cancel', 'resume']);
    for (const a of SUBSCRIPTION_ACTIONS) expect(typeof SUBSCRIPTION_ACTION_LABELS[a]).toBe('string');
  });
});

describe('CreatePromoSchema', () => {
  it('accepts a valid percent promo', () => {
    expect(CreatePromoSchema.safeParse({ code: 'SAVE20', type: 'PERCENT', value: 20 }).success).toBe(true);
  });
  it('accepts optional maxRedemptions + expiresAt', () => {
    expect(CreatePromoSchema.safeParse({ code: 'X', type: 'AMOUNT', value: 500, maxRedemptions: 10, expiresAt: '2027-01-01' }).success).toBe(true);
  });
  it('rejects empty code, non-positive value, unknown type', () => {
    expect(CreatePromoSchema.safeParse({ code: '', type: 'PERCENT', value: 20 }).success).toBe(false);
    expect(CreatePromoSchema.safeParse({ code: 'X', type: 'PERCENT', value: 0 }).success).toBe(false);
    expect(CreatePromoSchema.safeParse({ code: 'X', type: 'BOGUS', value: 5 }).success).toBe(false);
  });
});

describe('SubscriptionActionSchema', () => {
  it('accepts cancel/resume with optional note', () => {
    expect(SubscriptionActionSchema.safeParse({ action: 'cancel' }).success).toBe(true);
    expect(SubscriptionActionSchema.safeParse({ action: 'resume', note: 'reactivated' }).success).toBe(true);
  });
  it('rejects an unknown action', () => {
    expect(SubscriptionActionSchema.safeParse({ action: 'delete' }).success).toBe(false);
  });
});
