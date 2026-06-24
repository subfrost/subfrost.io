import { NextRequest, NextResponse } from "next/server"
import { listWebhookEvents } from "@/lib/stripe/webhooks/store"
import { isLive } from "@/lib/stripe/config"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/billing/events — list Stripe webhook events (scope: billing.read).
// Optional query filters: ?type=<event.type>&status=<status>
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const type = req.nextUrl.searchParams.get("type")?.trim() || undefined
    const status = req.nextUrl.searchParams.get("status")?.trim() || undefined
    const filter = type || status ? { type, status } : undefined
    const events = await listWebhookEvents(filter)
    return ok({ count: events.length, events, live: isLive() })
  })
}
