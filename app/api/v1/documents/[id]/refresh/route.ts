import { NextRequest, NextResponse } from "next/server"
import { esign, EsignError } from "@/lib/esign/store"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/documents/:id/refresh — pull the latest recipient/envelope state
// from Documenso and persist it (scope: documents.write). The webapp's
// refreshDocumentAction gates on documents.read, but it's a write-through
// reconciliation (persists status changes); we require documents.write so the
// REST surface keeps read-only keys read-only. documents.write implies
// documents.read, so any operator who can refresh in the webapp also holds it.
export async function POST(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "documents.write")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    try {
      const env = await esign.refresh(id)
      return ok({ envelope: env })
    } catch (e) {
      if (e instanceof EsignError) return fail(e.message, 400)
      throw e
    }
  })
}
