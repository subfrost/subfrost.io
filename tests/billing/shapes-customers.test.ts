import { describe, it, expect } from 'vitest';
import { RefundSchema } from '@/lib/stripe/shapes';

describe('RefundSchema', () => {
  it('accepts a valid refund', () => {
    expect(RefundSchema.safeParse({ reference: 'ch_1', amount: 500 }).success).toBe(true);
    expect(RefundSchema.safeParse({ reference: 'ch_1', amount: 500, reason: 'duplicate' }).success).toBe(true);
  });
  it('rejects empty reference and non-positive amount', () => {
    expect(RefundSchema.safeParse({ reference: '', amount: 500 }).success).toBe(false);
    expect(RefundSchema.safeParse({ reference: 'ch_1', amount: 0 }).success).toBe(false);
  });
});
