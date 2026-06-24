import { NextRequest, NextResponse } from "next/server"
import { updateSar, FincenError } from "@/lib/fincen/admin"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// PATCH /api/v1/fincen/sar/[id] — update a SAR draft (scope: aml.edit). Body = SAR input.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "aml.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await params
    const body = await readJson(req)
    if (body instanceof NextResponse) return body
    try {
      const draft = await updateSar(id, body, actor.email)
      await audit("update_fincen_draft", { actorId: actor.id, target: id, ip: clientIp(req) })
      return ok(draft)
    } catch (e) {
      if (e instanceof FincenError) return fail(e.message, 400)
      throw e
    }
  })
}
