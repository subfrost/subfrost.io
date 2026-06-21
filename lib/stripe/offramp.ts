/** Offramp settlements (crypto→fiat). Read-only source passthrough. Gated via
 *  actions/cms/billing.ts. */
import { isLive } from "@/lib/stripe/config"
import { getStripeSource } from "@/lib/stripe/source"
import type { OfframpSettlement } from "@/lib/stripe/shapes"

export async function listSettlements(): Promise<{ settlements: OfframpSettlement[]; live: boolean }> {
  const live = isLive()
  return { settlements: await getStripeSource().offrampSettlements(), live }
}
