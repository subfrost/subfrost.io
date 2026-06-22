import type Stripe from "stripe"
import type { WebhookEventSummary } from "@/lib/stripe/shapes"

/** Reduces a Stripe event to a small, NON-PII summary. Only reads object/id/status/
 *  amount/currency/reason — never names, DOB, verified_outputs, or card PAN. Pure. */
export function summarizeEvent(event: Stripe.Event): WebhookEventSummary {
  const obj = (event.data?.object ?? {}) as unknown as Record<string, unknown>
  const str = (v: unknown): string | null => (typeof v === "string" ? v : null)
  const num = (v: unknown): number | null => (typeof v === "number" ? v : null)
  return {
    objectType: str(obj.object),
    objectId: str(obj.id),
    objectStatus: str(obj.status),
    amount: num(obj.amount),
    currency: str(obj.currency),
    reason: str(obj.reason),
  }
}
