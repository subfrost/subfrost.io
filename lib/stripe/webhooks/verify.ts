import type Stripe from "stripe"
import { getStripeClient } from "@/lib/stripe/client"

/** Verifies a raw Stripe webhook body against the signature header using
 *  STRIPE_WEBHOOK_SECRET. Throws on missing secret/header or bad signature.
 *  Server-only (uses getStripeClient → the stripe SDK). */
export function constructWebhookEvent(rawBody: string, signature: string | null): Stripe.Event {
  const secret = process.env.STRIPE_WEBHOOK_SECRET
  if (!secret) throw new Error("STRIPE_WEBHOOK_SECRET not set")
  if (!signature) throw new Error("Missing stripe-signature header")
  return getStripeClient().webhooks.constructEvent(rawBody, signature, secret)
}
