import type { StripeSource } from "@/lib/stripe/source/types"

// Fixed reference instant keeps seed timestamps deterministic across calls.
const T0 = Date.parse("2026-06-21T00:00:00.000Z")
const ago = (h: number) => new Date(T0 - h * 3600 * 1000).toISOString()

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
}
