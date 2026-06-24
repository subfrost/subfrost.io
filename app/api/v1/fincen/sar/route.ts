import { NextRequest, NextResponse } from "next/server"
import { createSar, FincenError } from "@/lib/fincen/admin"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// POST /api/v1/fincen/sar — create a SAR draft (scope: aml.edit). Body = SAR input.
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "aml.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson(req)
    if (body instanceof NextResponse) return body
    try {
      const draft = await createSar(body, actor.email)
      await audit("create_fincen_draft", { actorId: actor.id, target: "sar", ip: clientIp(req) })
      return ok(draft, 201)
    } catch (e) {
      if (e instanceof FincenError) return fail(e.message, 400)
      throw e
    }
  })
}
