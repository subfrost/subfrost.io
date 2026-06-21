import { describe, it, expect } from 'vitest';
import {
  TRANSFER_DIRECTIONS, CARD_STATES, MONEY_INTENT_STATUSES,
  CARD_STATE_LABELS, MONEY_INTENT_STATUS_LABELS,
  QueueTransferSchema, CardControlSchema, DisputeEvidenceSchema,
} from '@/lib/stripe/shapes';

describe('money-ops constants', () => {
  it('transfer directions / card states / intent statuses with labels', () => {
    expect(TRANSFER_DIRECTIONS).toEqual(['in', 'out']);
    expect(CARD_STATES).toEqual(['active', 'paused', 'canceled']);
    expect(MONEY_INTENT_STATUSES).toEqual(['QUEUED', 'CONFIRMED', 'CANCELED']);
    for (const s of CARD_STATES) expect(typeof CARD_STATE_LABELS[s]).toBe('string');
    for (const s of MONEY_INTENT_STATUSES) expect(typeof MONEY_INTENT_STATUS_LABELS[s]).toBe('string');
  });
});

describe('QueueTransferSchema', () => {
  it('accepts a valid transfer', () => {
    expect(QueueTransferSchema.safeParse({ direction: 'out', amount: 5000, counterparty: 'Gusto' }).success).toBe(true);
  });
  it('rejects bad direction, non-positive amount, empty counterparty', () => {
    expect(QueueTransferSchema.safeParse({ direction: 'sideways', amount: 1, counterparty: 'x' }).success).toBe(false);
    expect(QueueTransferSchema.safeParse({ direction: 'in', amount: 0, counterparty: 'x' }).success).toBe(false);
    expect(QueueTransferSchema.safeParse({ direction: 'in', amount: 1, counterparty: '' }).success).toBe(false);
  });
});

describe('CardControlSchema / DisputeEvidenceSchema', () => {
  it('card control accepts a valid state, rejects unknown', () => {
    expect(CardControlSchema.safeParse({ state: 'paused' }).success).toBe(true);
    expect(CardControlSchema.safeParse({ state: 'frozen' }).success).toBe(false);
  });
  it('dispute evidence requires non-empty evidence, optional files', () => {
    expect(DisputeEvidenceSchema.safeParse({ evidence: 'receipt attached' }).success).toBe(true);
    expect(DisputeEvidenceSchema.safeParse({ evidence: 'x', evidenceFiles: ['a.pdf'] }).success).toBe(true);
    expect(DisputeEvidenceSchema.safeParse({ evidence: '' }).success).toBe(false);
  });
});
