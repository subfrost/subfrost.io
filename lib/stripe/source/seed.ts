import type { StripeSource } from "@/lib/stripe/source/types"
import type { OnrampPeriod, OnrampSession } from "@/lib/stripe/shapes"

// Fixed reference instant keeps seed timestamps deterministic across calls.
const T0 = Date.parse("2026-06-21T00:00:00.000Z")
const ago = (h: number) => new Date(T0 - h * 3600 * 1000).toISOString()

const DAY_MS = 24 * 3600 * 1000
function withinPeriod(iso: string, period: OnrampPeriod): boolean {
  if (period === "all") return true
  const days = period === "7d" ? 7 : 30
  return Date.parse(iso) >= T0 - days * DAY_MS
}

export const seedSource: StripeSource = {
  async treasuryBalances() {
    return [
      { accountId: "fbo_main_usd", nickname: "FBO Operating", available: 184_209_42, pending: 12_400_00, currency: "USD" },
      { accountId: "fbo_settlements_usd", nickname: "Card-spend settlements", available: 18_417_33, pending: 4_120_00, currency: "USD" },
    ]
  },
  async treasuryTransactions() {
    return [
      { id: "txn_001", type: "ach_credit", amount: 25_000_00, counterparty: "Subzero Research", status: "posted", at: ago(4) },
      { id: "txn_002", type: "card_settlement", amount: -3_215_72, counterparty: "Visa Network", status: "posted", at: ago(8) },
      { id: "txn_003", type: "ach_debit", amount: -8_750_00, counterparty: "Gusto Payroll", status: "posted", at: ago(20) },
      { id: "txn_004", type: "wire_in", amount: 50_000_00, counterparty: "Customer offramp pool", status: "pending", at: ago(2) },
      { id: "txn_005", type: "fee", amount: -42_18, counterparty: "Stripe Treasury fee", status: "posted", at: ago(30) },
    ]
  },
  async issuingCards() {
    return [
      { id: "ic_001", last4: "4242", cardholder: "flex (Director)", type: "virtual", state: "active", wallet: { apple: true, google: false }, spendLimit: 10_000_00, spentMtd: 1_415_22 },
      { id: "ic_002", last4: "1881", cardholder: "grey (Compliance)", type: "physical", state: "active", wallet: { apple: true, google: true }, spendLimit: 5_000_00, spentMtd: 432_19 },
      { id: "ic_003", last4: "9090", cardholder: "Customer demo card", type: "virtual", state: "paused", wallet: { apple: false, google: false }, spendLimit: 500_00, spentMtd: 0 },
    ]
  },
  async issuingDisputes() {
    return [
      { id: "idp_001", cardId: "ic_003", amount: 89_00, reason: "fraudulent", status: "submitted", openedAt: ago(48) },
    ]
  },
  async offrampSettlements() {
    return [
      { id: "off_001", userId: "usr_a1b2", cryptoAsset: "USDC", cryptoAmount: 5_000_00, fiatAmount: 4_997_50, feeAmount: 2_50, status: "settled", at: ago(6) },
      { id: "off_002", userId: "usr_c3d4", cryptoAsset: "BTC", cryptoAmount: 2_500_00, fiatAmount: 2_493_75, feeAmount: 6_25, status: "pending", at: ago(1) },
    ]
  },
  async onrampSessions(period: OnrampPeriod = "30d") {
    const all: OnrampSession[] = [
      { id: "cos_001", status: "fulfillment_complete", createdAt: ago(3), sourceCurrency: "USD", sourceAmount: 250_00, destCurrency: "BTC", destAmount: 0.00231, destNetwork: "bitcoin", walletAddress: "bc1qa9w0d3xq7r2k8m4n6p0s2t4v6x8z0c2e4g6i8k", transactionFee: 7_25, networkFee: 1_10, rejectionReason: null },
      { id: "cos_002", status: "fulfillment_processing", createdAt: ago(10), sourceCurrency: "USD", sourceAmount: 1_000_00, destCurrency: "ETH", destAmount: 0.412, destNetwork: "ethereum", walletAddress: "0x71C7656EC7ab88b098defB751B7401B5f6d8976F", transactionFee: 28_00, networkFee: 6_40, rejectionReason: null },
      { id: "cos_003", status: "rejected", createdAt: ago(26), sourceCurrency: "USD", sourceAmount: 500_00, destCurrency: "USDC", destAmount: null, destNetwork: "polygon", walletAddress: "0x4E83362442B8d1beC281594ceA3050c8EB01311C", transactionFee: null, networkFee: null, rejectionReason: "sanctioned_region" },
      { id: "cos_004", status: "requires_payment", createdAt: ago(40), sourceCurrency: "USD", sourceAmount: 75_00, destCurrency: "BTC", destAmount: null, destNetwork: "bitcoin", walletAddress: "bc1qf3e7h9j1k3m5n7p9r1t3v5x7z9b1d3f5h7j9l", transactionFee: null, networkFee: null, rejectionReason: null },
      { id: "cos_005", status: "fulfillment_complete", createdAt: ago(200), sourceCurrency: "USD", sourceAmount: 320_00, destCurrency: "USDC", destAmount: 318.5, destNetwork: "solana", walletAddress: "9xQeWvG816bUx9EPjHmaT23yvVM2ZWbrrpZb9PusVFin", transactionFee: 9_60, networkFee: 50, rejectionReason: null },
      { id: "cos_006", status: "expired", createdAt: ago(800), sourceCurrency: "USD", sourceAmount: 150_00, destCurrency: "ETH", destAmount: null, destNetwork: "ethereum", walletAddress: "0x32Be343B94f860124dC4fEe278FDCBD38C102D88", transactionFee: null, networkFee: null, rejectionReason: null },
    ]
    return all.filter((s) => withinPeriod(s.createdAt, period))
  },
  async subscriptionTiers() {
    return [
      { id: "tier_basic", name: "Basic", priceMonthly: 9_00, priceYearly: 90_00, features: ["Wrap/unwrap", "Standard support"], activeSubs: 412 },
      { id: "tier_pro", name: "Pro", priceMonthly: 29_00, priceYearly: 290_00, features: ["Priority offramp", "Higher limits", "Priority support"], activeSubs: 137 },
      { id: "tier_institutional", name: "Institutional", priceMonthly: 499_00, priceYearly: 4990_00, features: ["Dedicated treasury", "Issuing cards", "SLA"], activeSubs: 8 },
    ]
  },
  async subscribers() {
    return [
      { id: "sub_001", customerEmail: "ada.lovelace@example.com", tier: "Pro", status: "active", startedAt: ago(24 * 40), renewsAt: ago(-24 * 20) },
      { id: "sub_002", customerEmail: "bg@example.com", tier: "Basic", status: "trialing", startedAt: ago(24 * 3), renewsAt: ago(-24 * 11) },
      { id: "sub_003", customerEmail: "carl@example.com", tier: "Institutional", status: "past_due", startedAt: ago(24 * 200), renewsAt: ago(-24 * 5) },
      { id: "sub_004", customerEmail: "grace@example.com", tier: "Pro", status: "canceled", startedAt: ago(24 * 120), renewsAt: null },
    ]
  },
  async promoCodes() {
    return [
      { code: "LAUNCH25", type: "PERCENT", value: 25, redemptions: 312, maxRedemptions: 1000, expiresAt: ago(-24 * 60), active: true },
      { code: "FROSTBITE", type: "AMOUNT", value: 10_00, redemptions: 47, maxRedemptions: null, expiresAt: null, active: true },
      { code: "EXPIRED5", type: "PERCENT", value: 5, redemptions: 88, maxRedemptions: 100, expiresAt: ago(24 * 30), active: false },
    ]
  },
  async customerSummaries() {
    return [
      { id: "cus_ada", email: "ada.lovelace@example.com", name: "Ada Lovelace", activeSubscriptions: 1, lifetimeValue: 1_240_00, createdAt: ago(24 * 300) },
      { id: "cus_bg", email: "bg@example.com", name: "Beatrice Glass", activeSubscriptions: 1, lifetimeValue: 89_00, createdAt: ago(24 * 30) },
      { id: "cus_carl", email: "carl@example.com", name: "Carl Marx", activeSubscriptions: 0, lifetimeValue: 4_990_00, createdAt: ago(24 * 600) },
    ]
  },
  async customerDetail(id: string) {
    const details: Record<string, import("@/lib/stripe/shapes").CustomerDetail> = {
      cus_ada: {
        id: "cus_ada", email: "ada.lovelace@example.com", name: "Ada Lovelace",
        subscriptions: [{ id: "sub_001", tier: "Pro", status: "active", renewsAt: ago(-24 * 20) }],
        invoices: [
          { id: "in_a1", number: "INV-0001", amountDue: 29_00, status: "paid", createdAt: ago(24 * 20) },
          { id: "in_a2", number: "INV-0002", amountDue: 29_00, status: "open", createdAt: ago(24 * 1) },
        ],
        paymentMethods: [{ id: "pm_a1", brand: "visa", last4: "4242", expMonth: 11, expYear: 2028, isDefault: true }],
        recentCharges: [
          { id: "ch_a1", amount: 29_00, status: "succeeded", description: "Pro monthly", createdAt: ago(24 * 20) },
          { id: "ch_a2", amount: 29_00, status: "succeeded", description: "Pro monthly", createdAt: ago(24 * 50) },
        ],
      },
      cus_bg: {
        id: "cus_bg", email: "bg@example.com", name: "Beatrice Glass",
        subscriptions: [{ id: "sub_002", tier: "Basic", status: "trialing", renewsAt: ago(-24 * 11) }],
        invoices: [{ id: "in_b1", number: "INV-0003", amountDue: 9_00, status: "open", createdAt: ago(24 * 2) }],
        paymentMethods: [{ id: "pm_b1", brand: "mastercard", last4: "4444", expMonth: 4, expYear: 2027, isDefault: true }],
        recentCharges: [{ id: "ch_b1", amount: 9_00, status: "pending", description: "Basic monthly", createdAt: ago(24 * 2) }],
      },
      cus_carl: {
        id: "cus_carl", email: "carl@example.com", name: "Carl Marx",
        subscriptions: [],
        invoices: [{ id: "in_c1", number: "INV-0004", amountDue: 499_00, status: "paid", createdAt: ago(24 * 40) }],
        paymentMethods: [{ id: "pm_c1", brand: "amex", last4: "0005", expMonth: 1, expYear: 2026, isDefault: true }],
        recentCharges: [{ id: "ch_c1", amount: 499_00, status: "succeeded", description: "Institutional monthly", createdAt: ago(24 * 40) }],
      },
    }
    return details[id] ?? null
  },
}
