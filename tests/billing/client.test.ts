import { describe, it, expect, afterEach } from 'vitest';
import { getStripeClient } from '@/lib/stripe/client';
import { BillingError } from '@/lib/stripe/config';

const KEY = 'STRIPE_SECRET_KEY';
afterEach(() => { delete process.env[KEY]; });

describe('getStripeClient', () => {
  it('throws BillingError when no key is set', () => {
    delete process.env[KEY];
    expect(() => getStripeClient()).toThrow(BillingError);
  });
  it('returns a cached singleton when a key is set', () => {
    process.env[KEY] = 'sk_test_x';
    const a = getStripeClient();
    const b = getStripeClient();
    expect(a).toBe(b);
  });
});
