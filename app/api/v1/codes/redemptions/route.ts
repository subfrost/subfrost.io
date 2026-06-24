import { NextRequest, NextResponse } from "next/server"
import { listRedemptions, type ListRedemptionsQuery } from "@/lib/referral/admin"
import { requireScope, ok, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/codes/redemptions — list code redemptions (scope: referral.read).
// Query: ?search ?code ?page ?limit ?sortBy ?sortDir
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "referral.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const sp = req.nextUrl.searchParams
    const query: ListRedemptionsQuery = {
      search: sp.get("search") ?? undefined,
      code: sp.get("code") ?? undefined,
      page: sp.has("page") ? Number(sp.get("page")) : undefined,
      limit: sp.has("limit") ? Number(sp.get("limit")) : undefined,
      sortBy: sp.get("sortBy") ?? undefined,
      sortDir: sp.get("sortDir") ?? undefined,
    }
    return ok(await listRedemptions(query))
  })
}
