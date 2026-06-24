import { NextRequest, NextResponse } from "next/server"
import { requireScope, readJson, ok, fail } from "@/lib/cms/api-route"
import * as files from "@/lib/files/manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// POST /api/v1/files/folders — create a folder { name, parentId? }.
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "files.edit")
  if (actor instanceof NextResponse) return actor
  const body = await readJson<{ name?: string; parentId?: string | null }>(req)
  if (body instanceof NextResponse) return body
  try {
    const folder = await files.createFolder(actor.id, String(body.name ?? ""), body.parentId ?? null)
    return ok(folder, 201)
  } catch (e) {
    return e instanceof files.FilesError ? fail(e.message, e.status) : fail("Internal error", 500)
  }
}
