import { NextRequest, NextResponse } from "next/server"
import { queueSubmission, FincenError } from "@/lib/fincen/admin"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// POST /api/v1/fincen/queue — queue a FinCEN draft for submission (scope: aml.edit).
// Body: { draftId: string }
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "aml.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<{ draftId?: string }>(req)
    if (body instanceof NextResponse) return body
    const draftId = String(body.draftId ?? "").trim()
    if (!draftId) return fail("draftId is required", 400)
    try {
      const submission = await queueSubmission(draftId, actor.email)
      await audit("queue_fincen_submission", { actorId: actor.id, target: draftId, ip: clientIp(req) })
      return ok(submission, 201)
    } catch (e) {
      if (e instanceof FincenError) return fail(e.message, 400)
      throw e
    }
  })
}
