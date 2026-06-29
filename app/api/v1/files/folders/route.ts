import { NextRequest, NextResponse } from "next/server"
import type { LegalScope } from "@prisma/client"
import { requireScope, readJson, ok, fail } from "@/lib/cms/api-route"
import * as files from "@/lib/files/manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/files/folders — create a folder { name, parentId?, scope? }.
// scope (SUBFROST|OYL) only applies to root folders; children inherit the parent.
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "files.edit")
  if (actor instanceof NextResponse) return actor
  const body = await readJson<{ name?: string; parentId?: string | null; scope?: LegalScope }>(req)
  if (body instanceof NextResponse) return body
  try {
    const scope: LegalScope = body.scope === "OYL" ? "OYL" : "SUBFROST"
    const folder = await files.createFolder(actor.id, String(body.name ?? ""), body.parentId ?? null, scope)
    return ok(folder, 201)
  } catch (e) {
    return e instanceof files.FilesError ? fail(e.message, e.status) : fail("Internal error", 500)
  }
}
