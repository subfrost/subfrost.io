/** Server-only Stripe client. Kept OUT of config.ts (which is client-safe) because the
 *  `stripe` SDK is server-only. Lazy singleton: built on first use when the key is present. */
import Stripe from "stripe"
import { BillingError } from "@/lib/stripe/config"

// Pin the API version expected by the installed stripe SDK (Stripe.LatestApiVersion
// is not re-exported from the Stripe namespace in v22 — use the literal directly).
export const STRIPE_API_VERSION = "2026-05-27.dahlia" as const

let client: Stripe | null = null

export function getStripeClient(): Stripe {
  const key = process.env.STRIPE_SECRET_KEY
  if (!key) throw new BillingError("STRIPE_SECRET_KEY not set")
  if (!client) client = new Stripe(key, { apiVersion: STRIPE_API_VERSION })
  return client
}
