import { describe, it, expect, afterEach } from 'vitest';
import { isLive, DEMO_REASON, StripeNotWiredError, BillingError } from '@/lib/stripe/config';

const KEY = 'STRIPE_SECRET_KEY';
afterEach(() => { delete process.env[KEY]; });

describe('isLive', () => {
  it('is false when STRIPE_SECRET_KEY is unset', () => {
    delete process.env[KEY];
    expect(isLive()).toBe(false);
  });
  it('is true when STRIPE_SECRET_KEY is set', () => {
    process.env[KEY] = 'sk_test_x';
    expect(isLive()).toBe(true);
  });
});

describe('errors + reason', () => {
  it('DEMO_REASON mentions STRIPE_SECRET_KEY', () => {
    expect(DEMO_REASON).toContain('STRIPE_SECRET_KEY');
  });
  it('StripeNotWiredError names the method', () => {
    const e = new StripeNotWiredError('treasuryBalances');
    expect(e).toBeInstanceOf(Error);
    expect(e.name).toBe('StripeNotWiredError');
    expect(e.message).toContain('treasuryBalances');
  });
  it('BillingError is an Error subclass', () => {
    expect(new BillingError('x')).toBeInstanceOf(Error);
  });
});
