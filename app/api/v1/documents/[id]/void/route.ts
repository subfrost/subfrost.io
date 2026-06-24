import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { envelopes, EsignError } from "@/lib/esign/store"
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

// POST /api/v1/documents/:id/void — cancel an envelope, optional body {reason}
// (scope: documents.write). Mirrors voidDocumentAction.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "documents.write")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    // Body is optional; tolerate an empty/absent one without 400ing.
    let reason: string | undefined
    try {
      const body = (await req.json()) as { reason?: string }
      reason = body?.reason
    } catch {
      reason = undefined
    }
    try {
      const env = await envelopes.void(id, { reason: reason?.trim() || undefined })
      if (!env) return fail("Envelope not found", 404)
      await audit("document_void", {
        actorId: actor.id,
        target: id,
        ip: clientIp(req),
        details: reason ? { reason } : undefined,
      })
      return ok({ envelope: env })
    } catch (e) {
      if (e instanceof EsignError) return fail(e.message, 400)
      throw e
    }
  })
}
