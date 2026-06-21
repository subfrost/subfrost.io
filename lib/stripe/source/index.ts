import { isLive } from "@/lib/stripe/config"
import type { StripeSource } from "@/lib/stripe/source/types"
import { seedSource } from "@/lib/stripe/source/seed"
import { liveSource } from "@/lib/stripe/source/live"

export type { StripeSource }

/** Pick the active read source. Seed (demo) until STRIPE_SECRET_KEY is set. */
export function getStripeSource(): StripeSource {
  return isLive() ? liveSource : seedSource
}
