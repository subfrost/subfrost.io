import { NextRequest, NextResponse } from "next/server"
import { requireScope, ok } from "@/lib/cms/api-route"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/me — identity + effective scopes of the calling API key
// (the `subfrost whoami` command). Any valid key.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, null)
  if (actor instanceof NextResponse) return actor
  return ok({
    id: actor.id,
    email: actor.email,
    name: actor.name,
    role: actor.role,
    keyId: actor.keyId,
    privileges: actor.privileges,
  })
}
