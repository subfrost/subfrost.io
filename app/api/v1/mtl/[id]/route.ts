import { NextRequest, NextResponse } from "next/server"
import { upsertEntry, MtlError } from "@/lib/mtl/admin"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() || req.headers.get("x-real-ip") || null
}

// PATCH /api/v1/mtl/[id] — upsert an MTL entry keyed by state code (scope: aml.edit).
// Body = the MTL entry input.
export async function PATCH(req: NextRequest, { params }: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "aml.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id: state } = await params
    const body = await readJson(req)
    if (body instanceof NextResponse) return body
    try {
      const entry = await upsertEntry(state, body)
      await audit("update_mtl", { actorId: actor.id, target: state, ip: clientIp(req) })
      return ok(entry)
    } catch (e) {
      if (e instanceof MtlError) return fail(e.message, 400)
      throw e
    }
  })
}
