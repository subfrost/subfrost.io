import { NextRequest, NextResponse } from "next/server"
import { envelopes } from "@/lib/esign/store"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/documents/:id — one envelope (scope: documents.read).
// Mirrors getDocumentAction.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "documents.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const env = await envelopes.get(id)
    if (!env) return fail("Envelope not found", 404)
    return ok({ envelope: env })
  })
}
