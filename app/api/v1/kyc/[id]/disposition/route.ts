import { NextRequest, NextResponse } from "next/server"
import { recordDisposition, KycError, type KycDecision } from "@/lib/kyc/admin"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// POST /api/v1/kyc/[id]/disposition — record a KYC disposition (scope: aml.edit)
// Body: { decision: "APPROVE" | "REJECT" | "REVIEW", notes?: string | null }
export async function POST(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "aml.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const body = await readJson<{ decision?: string; notes?: string | null }>(req)
    if (body instanceof NextResponse) return body

    const decision = body.decision as KycDecision
    const notes = body.notes ?? null
    try {
      const { customerName } = await recordDisposition(id, decision, notes, actor.email)
      await audit("kyc_disposition", { actorId: actor.id, target: customerName, ip: clientIp(req) })
      return ok({ ok: true })
    } catch (e) {
      if (e instanceof KycError) return fail(e.message, 400)
      throw e
    }
  })
}
