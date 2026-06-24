import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import {
  CodeError,
  listCodes,
  createCode,
  type CreateCodeInput,
  type ListCodesQuery,
} from "@/lib/referral/admin"
import { requireScope, readJson, ok, fail, guard } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/codes — list referral codes (scope: referral.read).
// Query: ?search ?status ?page ?limit ?sortBy ?sortDir
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "referral.read")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const sp = req.nextUrl.searchParams
    const query: ListCodesQuery = {
      search: sp.get("search") ?? undefined,
      status: sp.get("status") ?? undefined,
      page: sp.has("page") ? Number(sp.get("page")) : undefined,
      limit: sp.has("limit") ? Number(sp.get("limit")) : undefined,
      sortBy: sp.get("sortBy") ?? undefined,
      sortDir: sp.get("sortDir") ?? undefined,
    }
    return ok(await listCodes(query))
  })
}

// POST /api/v1/codes — create a referral code (scope: referral.edit).
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "referral.edit")
  if (actor instanceof NextResponse) return actor
  return guard(async () => {
    const body = await readJson<CreateCodeInput>(req)
    if (body instanceof NextResponse) return body
    try {
      const created = await createCode(body)
      await audit("create_code", { actorId: actor.id, target: created.code })
      return ok(created, 201)
    } catch (e) {
      if (e instanceof CodeError) return fail(e.message, 400)
      throw e
    }
  })
}
