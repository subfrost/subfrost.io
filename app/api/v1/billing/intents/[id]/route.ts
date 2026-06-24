import { NextRequest, NextResponse } from "next/server"
import { confirmIntent, cancelIntent } from "@/lib/stripe/money"
import { BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { audit } from "@/lib/cms/audit"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// POST /api/v1/billing/intents/[id]?action=confirm|cancel — confirm or cancel a
// queued money intent (scope: billing.edit).
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "billing.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const action = req.nextUrl.searchParams.get("action")?.trim()
    if (action !== "confirm" && action !== "cancel") {
      return fail("query param 'action' must be 'confirm' or 'cancel'", 400)
    }
    try {
      const intent =
        action === "confirm"
          ? await confirmIntent(id, actor.email)
          : await cancelIntent(id, actor.email)
      await audit(action === "confirm" ? "stripe_money_confirm" : "stripe_money_cancel", {
        actorId: actor.id,
        target: id,
        ip: clientIp(req),
      })
      return ok(intent)
    } catch (e) {
      if (e instanceof BillingError || e instanceof StripeNotWiredError) return fail(e.message, 400)
      throw e
    }
  })
}
