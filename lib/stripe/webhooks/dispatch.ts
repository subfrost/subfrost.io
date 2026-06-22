import type Stripe from "stripe"
import { onIdentityEvent } from "@/lib/stripe/webhooks/handlers/identity"

/** Route a verified event to its domain handler. Only identity.* mutates the DB;
 *  every other type is log-only (handled:false). Handler errors propagate so the
 *  route can mark the event failed and return 500 (Stripe retries). */
export async function dispatchEvent(event: Stripe.Event): Promise<{ handled: boolean }> {
  if (event.type.startsWith("identity.verification_session.")) {
    await onIdentityEvent(event)
    return { handled: true }
  }
  return { handled: false }
}
