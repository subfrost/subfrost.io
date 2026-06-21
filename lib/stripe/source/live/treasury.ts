import { getStripeClient } from "@/lib/stripe/client"
import type { TreasuryBalance, TreasuryTransaction, TreasuryTxnType } from "@/lib/stripe/shapes"

// Stripe treasury transaction flow_type -> our union (verify against the API; fall back to "fee").
const TXN_TYPE: Record<string, TreasuryTxnType> = {
  inbound_transfer: "ach_credit", received_credit: "ach_credit", outbound_transfer: "ach_debit",
  outbound_payment: "ach_debit", received_debit: "ach_debit", issuing_authorization: "card_settlement",
}

export async function liveTreasuryBalances(): Promise<TreasuryBalance[]> {
  const stripe = getStripeClient()
  const res = await (stripe as any).treasury.financialAccounts.list({ limit: 100 })
  return res.data.map((fa: any) => ({
    accountId: fa.id,
    nickname: fa.nickname ?? fa.id,
    available: fa.balance?.cash?.usd ?? 0,
    pending: fa.balance?.inbound_pending?.usd ?? 0,
    currency: "USD",
  }))
}

export async function liveTreasuryTransactions(): Promise<TreasuryTransaction[]> {
  const stripe = getStripeClient()
  const accounts = await (stripe as any).treasury.financialAccounts.list({ limit: 1 })
  const fa = accounts.data[0]
  if (!fa) return []
  const res = await (stripe as any).treasury.transactions.list({ financial_account: fa.id, limit: 100 })
  return res.data.map((t: any) => ({
    id: t.id,
    type: TXN_TYPE[t.flow_type] ?? "fee",
    amount: t.amount ?? 0,
    counterparty: t.description ?? "",
    status: t.status === "posted" ? "posted" : t.status === "void" ? "returned" : "pending",
    at: new Date((t.created ?? 0) * 1000).toISOString(),
  }))
}
