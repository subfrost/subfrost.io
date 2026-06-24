import { NextRequest, NextResponse } from "next/server"
import { rescreenOfac } from "@/lib/kyc/admin"
import { audit } from "@/lib/cms/audit"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// POST /api/v1/kyc/rescreen — re-run OFAC screening on intakes (scope: aml.edit)
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "aml.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { screened } = await rescreenOfac()
    await audit("ofac_rescreen", { actorId: actor.id, target: `${screened} intakes`, ip: clientIp(req) })
    return ok({ screened })
  })
}
