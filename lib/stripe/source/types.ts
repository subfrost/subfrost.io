import type {
  TreasuryBalance, TreasuryTransaction, IssuingCard, IssuingDispute, OfframpSettlement,
  SubscriptionTier, Subscriber, PromoCode, CustomerSummary, CustomerDetail,
  OnrampSession, OnrampPeriod,
} from "@/lib/stripe/shapes"

/** The pluggable read surface for the Stripe console. Implemented by the seed
 *  source (deterministic demo data) and the live source (Stripe SDK, stubbed
 *  until STRIPE_SECRET_KEY is wired). D2–D4 extend this interface with their
 *  surfaces (subscriptions/promo, customers). */
export interface StripeSource {
  treasuryBalances(): Promise<TreasuryBalance[]>
  treasuryTransactions(): Promise<TreasuryTransaction[]>
  issuingCards(): Promise<IssuingCard[]>
  issuingDisputes(): Promise<IssuingDispute[]>
  offrampSettlements(): Promise<OfframpSettlement[]>
  onrampSessions(period?: OnrampPeriod): Promise<OnrampSession[]>
  subscriptionTiers(): Promise<SubscriptionTier[]>
  subscribers(): Promise<Subscriber[]>
  promoCodes(): Promise<PromoCode[]>
  customerSummaries(): Promise<CustomerSummary[]>
  customerDetail(id: string): Promise<CustomerDetail | null>
}
