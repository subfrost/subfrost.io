import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { esign, EsignError } from "@/lib/esign/store"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function clientIp(req: NextRequest): string | null {
  return (
    req.headers.get("x-forwarded-for")?.split(",")[0]?.trim() ||
    req.headers.get("x-real-ip") ||
    null
  )
}

// POST /api/v1/documents/:id/send — push the envelope to Documenso and dispatch
// invites (scope: documents.write). Mirrors sendDocumentAction.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "documents.write")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    try {
      const env = await esign.send(id)
      await audit("document_send", { actorId: actor.id, target: id, ip: clientIp(req) })
      return ok({ envelope: env })
    } catch (e) {
      if (e instanceof EsignError) return fail(e.message, 400)
      throw e
    }
  })
}
