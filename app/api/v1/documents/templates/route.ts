import { NextRequest, NextResponse } from "next/server"
import { documenso } from "@/lib/esign/documenso"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/documents/templates — Documenso templates available for
// create-from-template (scope: documents.read). Mirrors listTemplatesAction:
// a Documenso error surfaces as a 502 rather than a blank list.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "documents.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    try {
      const templates = await documenso.listTemplates()
      return ok({ count: templates.length, templates })
    } catch (e) {
      return fail(e instanceof Error ? e.message : "Could not load templates", 502)
    }
  })
}
