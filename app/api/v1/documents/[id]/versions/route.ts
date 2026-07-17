import { NextRequest, NextResponse } from "next/server"
import { envelopes, esign } from "@/lib/esign/store"
import { requireScope, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/documents/:id/versions — the full version chain of the agreement
// this envelope belongs to, oldest → newest (scope: documents.read). All
// versions share an agreementKey; version 1's key is its own id.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "documents.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const { id } = await ctx.params
    const env = await envelopes.get(id)
    if (!env) return fail("Envelope not found", 404)
    const agreementKey = env.agreementKey ?? env.id
    const versions = await esign.listVersions(agreementKey)
    return ok({ agreementKey, count: versions.length, versions })
  })
}
