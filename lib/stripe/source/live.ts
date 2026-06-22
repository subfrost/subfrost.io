import type { StripeSource } from "@/lib/stripe/source/types"
import { seedSource } from "@/lib/stripe/source/seed"
import { degradeIfUnavailable } from "@/lib/stripe/source/live/degrade"
import { liveSubscriptionTiers, liveSubscribers } from "@/lib/stripe/source/live/subscriptions"
import { livePromoCodes } from "@/lib/stripe/source/live/promo"
import { liveCustomerSummaries, liveCustomerDetail } from "@/lib/stripe/source/live/customers"
import { liveTreasuryBalances, liveTreasuryTransactions } from "@/lib/stripe/source/live/treasury"
import { liveIssuingCards, liveIssuingDisputes } from "@/lib/stripe/source/live/issuing"
import { liveOnrampSessions } from "@/lib/stripe/source/live/onramp"

// Reads degrade to a safe fallback if the underlying Stripe product is unavailable
// (e.g. Issuing not enabled). Offramp delegates to seed: it is a Stripe product but not GA.
export const liveSource: StripeSource = {
  treasuryBalances: () => degradeIfUnavailable(liveTreasuryBalances, []),
  treasuryTransactions: () => degradeIfUnavailable(liveTreasuryTransactions, []),
  issuingCards: () => degradeIfUnavailable(liveIssuingCards, []),
  issuingDisputes: () => degradeIfUnavailable(liveIssuingDisputes, []),
  offrampSettlements: () => seedSource.offrampSettlements(),
  onrampSessions: (period) => degradeIfUnavailable(() => liveOnrampSessions(period), []),
  subscriptionTiers: () => degradeIfUnavailable(liveSubscriptionTiers, []),
  subscribers: () => degradeIfUnavailable(liveSubscribers, []),
  promoCodes: () => degradeIfUnavailable(livePromoCodes, []),
  customerSummaries: () => degradeIfUnavailable(liveCustomerSummaries, []),
  customerDetail: (id: string) => degradeIfUnavailable(() => liveCustomerDetail(id), null),
}
