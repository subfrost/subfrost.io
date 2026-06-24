import { NextRequest, NextResponse } from "next/server"
import { listIntakes } from "@/lib/kyc/admin"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/kyc — list KYC intakes (scope: aml.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "aml.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const intakes = await listIntakes()
    return ok({ count: intakes.length, intakes })
  })
}
