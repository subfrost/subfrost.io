import { NextRequest, NextResponse } from "next/server"
import { listSubscribers } from "@/lib/stripe/subscriptions"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/billing/subscriptions — list subscribers (scope: billing.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { subscribers, live } = await listSubscribers()
    return ok({ count: subscribers.length, subscribers, live })
  })
}
