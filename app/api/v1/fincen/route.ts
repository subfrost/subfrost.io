import { NextRequest, NextResponse } from "next/server"
import { getForm107, listSar, listCtr, listSubmissions } from "@/lib/fincen/admin"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/fincen — list FinCEN drafts (Form 107, SARs, CTRs) and submissions (scope: aml.read)
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "aml.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const [form107, sar, ctr, submissions] = await Promise.all([
      getForm107(),
      listSar(),
      listCtr(),
      listSubmissions(),
    ])
    return ok({ form107, sar, ctr, submissions })
  })
}
