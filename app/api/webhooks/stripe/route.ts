import { constructWebhookEvent } from "@/lib/stripe/webhooks/verify"
import { summarizeEvent } from "@/lib/stripe/webhooks/summary"
import { recordEvent, markProcessed, markIgnored, markFailed } from "@/lib/stripe/webhooks/store"
import { dispatchEvent } from "@/lib/stripe/webhooks/dispatch"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

/** Public Stripe webhook receiver. Security = signature verification (no login gate).
 *  Verify → summarize (PII-free) → persist idempotently → dispatch. Only identity.*
 *  mutates the DB; everything else is log-only. */
export async function POST(req: Request): Promise<Response> {
  const body = await req.text()
  const sig = req.headers.get("stripe-signature")

  let event
  try {
    event = constructWebhookEvent(body, sig)
  } catch (e) {
    return new Response(`Webhook signature verification failed: ${(e as Error).message}`, { status: 400 })
  }

  const decision = await recordEvent(event, summarizeEvent(event))
  if (decision === "replay") return Response.json({ received: true, replay: true })

  try {
    const { handled } = await dispatchEvent(event)
    if (handled) await markProcessed(event.id)
    else await markIgnored(event.id)
  } catch (e) {
    await markFailed(event.id, (e as Error).message)
    return new Response("handler failed", { status: 500 })
  }

  return Response.json({ received: true })
}
