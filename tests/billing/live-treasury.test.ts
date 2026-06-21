import { describe, it, expect, vi, beforeEach } from 'vitest';
vi.mock('@/lib/stripe/client', () => ({ getStripeClient: vi.fn() }));
import { liveTreasuryBalances, liveTreasuryTransactions } from '@/lib/stripe/source/live/treasury';
import { getStripeClient } from '@/lib/stripe/client';

const gsc = getStripeClient as unknown as ReturnType<typeof vi.fn>;
beforeEach(() => vi.clearAllMocks());

describe('liveTreasuryBalances', () => {
  it('maps financial accounts to the TreasuryBalance shape (cents, USD)', async () => {
    gsc.mockReturnValue({ treasury: { financialAccounts: { list: vi.fn().mockResolvedValue({ data: [
      { id: 'fa_1', nickname: 'FBO Operating', balance: { cash: { usd: 18420942 }, inbound_pending: { usd: 1240000 } } },
    ] }) } } });
    const r = await liveTreasuryBalances();
    expect(r[0]).toEqual({ accountId: 'fa_1', nickname: 'FBO Operating', available: 18420942, pending: 1240000, currency: 'USD' });
  });
});

describe('liveTreasuryTransactions', () => {
  it('maps treasury transactions (flow_type + status) for the first financial account', async () => {
    const txnList = vi.fn().mockResolvedValue({ data: [
      { id: 'tt_1', flow_type: 'inbound_transfer', amount: 25000, description: 'Subzero', status: 'posted', created: 1717200000 },
      { id: 'tt_2', flow_type: 'outbound_payment', amount: -8000, description: 'Gusto', status: 'open', created: 1717100000 },
    ] });
    gsc.mockReturnValue({ treasury: {
      financialAccounts: { list: vi.fn().mockResolvedValue({ data: [{ id: 'fa_1' }] }) },
      transactions: { list: txnList },
    } });
    const r = await liveTreasuryTransactions();
    expect(txnList).toHaveBeenCalledWith({ financial_account: 'fa_1', limit: 100 });
    expect(r[0]).toEqual({ id: 'tt_1', type: 'ach_credit', amount: 25000, counterparty: 'Subzero', status: 'posted', at: new Date(1717200000 * 1000).toISOString() });
    expect(r[1]).toMatchObject({ id: 'tt_2', type: 'ach_debit', status: 'pending' });
  });
  it('returns [] when there is no financial account', async () => {
    gsc.mockReturnValue({ treasury: { financialAccounts: { list: vi.fn().mockResolvedValue({ data: [] }) }, transactions: { list: vi.fn() } } });
    expect(await liveTreasuryTransactions()).toEqual([]);
  });
});
