import { NextRequest, NextResponse } from "next/server"
import { listPromoCodes, createPromoCode } from "@/lib/stripe/promo"
import { BillingError, StripeNotWiredError } from "@/lib/stripe/config"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// GET /api/v1/billing/promo — list promo codes (scope: billing.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { codes, live } = await listPromoCodes()
    return ok({ count: codes.length, codes, live })
  })
}

// POST /api/v1/billing/promo — create a promo code (scope: billing.edit). Body = promo input.
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "billing.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson(req)
    if (body instanceof NextResponse) return body
    try {
      const created = await createPromoCode(body, actor.email)
      await audit("stripe_promo_create", { actorId: actor.id, target: created.code, ip: clientIp(req) })
      return ok(created, 201)
    } catch (e) {
      if (e instanceof BillingError || e instanceof StripeNotWiredError) return fail(e.message, 400)
      throw e
    }
  })
}
