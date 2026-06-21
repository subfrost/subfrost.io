import type { StripeSource } from "@/lib/stripe/source/types"
import { StripeNotWiredError } from "@/lib/stripe/config"

// Type-correct stub. No `stripe` SDK dep yet: each read rejects until the real
// calls are wired behind this boundary (when STRIPE_SECRET_KEY arrives). Because
// isLive() is false today, getStripeSource() never returns this at runtime.
const nope = (method: string) => () => Promise.reject(new StripeNotWiredError(method))

export const liveSource: StripeSource = {
  treasuryBalances: nope("treasuryBalances"),
  treasuryTransactions: nope("treasuryTransactions"),
  issuingCards: nope("issuingCards"),
  issuingDisputes: nope("issuingDisputes"),
  offrampSettlements: nope("offrampSettlements"),
  subscriptionTiers: nope("subscriptionTiers"),
  subscribers: nope("subscribers"),
  promoCodes: nope("promoCodes"),
}
