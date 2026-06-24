import { NextRequest, NextResponse } from "next/server"
import { syncStripeIdentity } from "@/lib/kyc/sync"
import { audit } from "@/lib/cms/audit"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// POST /api/v1/kyc/sync — sync Stripe Identity verifications into intakes (scope: aml.edit)
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "aml.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { created, updated, skipped } = await syncStripeIdentity()
    await audit("kyc_identity_sync", { actorId: actor.id, target: `${created} new, ${updated} updated`, ip: clientIp(req) })
    return ok({ created, updated, skipped })
  })
}
