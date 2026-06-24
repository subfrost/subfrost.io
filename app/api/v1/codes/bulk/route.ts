import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { CodeError, bulkCreateCodes, type BulkCreateInput } from "@/lib/referral/admin"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

const normalizePrefixForAudit = (p: string) => (p ?? "").trim().toUpperCase()

// POST /api/v1/codes/bulk — bulk-generate PREFIX-XXXXX codes (scope: referral.edit).
// Body: { prefix, count, description?, parentCodeId? }.
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "referral.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<BulkCreateInput>(req)
    if (body instanceof NextResponse) return body
    try {
      const res = await bulkCreateCodes(body)
      await audit("create_code", {
        actorId: actor.id,
        target: `bulk:${normalizePrefixForAudit(body.prefix)} ×${res.count}`,
      })
      return ok(res, 201)
    } catch (e) {
      if (e instanceof CodeError) return fail(e.message, 400)
      throw e
    }
  })
}
