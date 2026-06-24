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

// POST /api/v1/documents/:id/resend — re-dispatch invitation emails, optional
// body {recipientEmails: string[]} to target a subset (scope: documents.write).
// Mirrors resendDocumentAction.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "documents.write")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    // Body optional; tolerate absent/empty without 400ing.
    let recipientEmails: string[] | undefined
    try {
      const body = (await req.json()) as { recipientEmails?: string[] }
      recipientEmails = Array.isArray(body?.recipientEmails) ? body.recipientEmails : undefined
    } catch {
      recipientEmails = undefined
    }
    try {
      const env = await envelopes.resend(id, { recipientEmails })
      if (!env) return fail("Envelope not found", 404)
      await audit("document_resend", { actorId: actor.id, target: id, ip: clientIp(req) })
      return ok({ envelope: env })
    } catch (e) {
      if (e instanceof EsignError) return fail(e.message, 400)
      throw e
    }
  })
}
