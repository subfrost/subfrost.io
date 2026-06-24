import { NextRequest, NextResponse } from "next/server"
import { listApplications } from "@/lib/stripe/applications"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/billing/applications — list Stripe product applications (scope: billing.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "billing.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const applications = await listApplications()
    return ok({ count: applications.length, applications })
  })
}
