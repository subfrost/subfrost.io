import { describe, it, expect, vi, beforeEach } from 'vitest';

vi.mock('@/lib/stripe/source', () => ({ getStripeSource: vi.fn() }));
vi.mock('@/lib/stripe/config', async (importOriginal) => {
  const actual = await importOriginal<typeof import('@/lib/stripe/config')>();
  return { ...actual, isLive: vi.fn(() => false) };
});

import { listCustomers, getCustomer } from '@/lib/stripe/customers';
import { getStripeSource } from '@/lib/stripe/source';
import { isLive } from '@/lib/stripe/config';

const gss = getStripeSource as unknown as ReturnType<typeof vi.fn>;
const live = isLive as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => {
  vi.clearAllMocks();
  live.mockReturnValue(false);
  gss.mockReturnValue({
    customerSummaries: vi.fn(async () => [{ id: 'cus_1', email: 'a@x.z', name: 'A', activeSubscriptions: 1, lifetimeValue: 1000, createdAt: '2026-01-01T00:00:00.000Z' }]),
    customerDetail: vi.fn(async (id: string) => id === 'cus_1' ? { id: 'cus_1', email: 'a@x.z', name: 'A', subscriptions: [], invoices: [], paymentMethods: [], recentCharges: [] } : null),
  });
});

describe('listCustomers', () => {
  it('returns summaries + live flag', async () => {
    const r = await listCustomers();
    expect(r.live).toBe(false);
    expect(r.customers[0].id).toBe('cus_1');
  });
});

describe('getCustomer', () => {
  it('returns detail for a known id', async () => {
    const r = await getCustomer('cus_1');
    expect(r.customer?.id).toBe('cus_1');
    expect(r.live).toBe(false);
  });
  it('returns null for an unknown id', async () => {
    const r = await getCustomer('cus_x');
    expect(r.customer).toBeNull();
  });
});
