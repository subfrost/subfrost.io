import { NextRequest, NextResponse } from "next/server"
import { listIntents, queueAchTransfer } from "@/lib/stripe/money"
import { BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// GET /api/v1/billing/intents — list queued ACH transfer money intents (scope: billing.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const intents = await listIntents("ACH_TRANSFER")
    return ok({ count: intents.length, intents })
  })
}

// POST /api/v1/billing/intents — queue an ACH transfer (scope: billing.edit).
// Body: { direction, amount, counterparty, memo? }
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "billing.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{ direction?: string; amount?: number }>(req)
    if (body instanceof NextResponse) return body
    try {
      const intent = await queueAchTransfer(body, actor.email)
      await audit("stripe_money_queue", {
        actorId: actor.id,
        target: `${body.direction} ${body.amount}`,
        ip: clientIp(req),
      })
      return ok(intent, 201)
    } catch (e) {
      if (e instanceof BillingError || e instanceof StripeNotWiredError) return fail(e.message, 400)
      throw e
    }
  })
}
