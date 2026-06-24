import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { requireScope, ok, fail } from "@/lib/cms/api-route"
import * as files from "@/lib/files/manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

// GET /api/v1/files?folder=<id> — list a folder (root if omitted) + breadcrumb.
export async function GET(req: NextRequest) {
  const actor = await requireScope(req, "files.read")
  if (actor instanceof NextResponse) return actor
  const folder = req.nextUrl.searchParams.get("folder") || null
  try {
    return ok(await files.listFolder(folder))
  } catch (e) {
    return e instanceof files.FilesError ? fail(e.message, e.status) : fail("Internal error", 500)
  }
}

// POST /api/v1/files — upload a file. Raw body is the bytes; headers:
//   X-File-Name   (required)   the display name
//   X-Folder-Id   (optional)   destination folder id (root if omitted)
//   Content-Type  (optional)   defaults to application/octet-stream
export async function POST(req: NextRequest) {
  const actor = await requireScope(req, "files.edit")
  if (actor instanceof NextResponse) return actor
  const name = req.headers.get("x-file-name")
  if (!name) return fail("X-File-Name header is required", 400)
  const folderId = req.headers.get("x-folder-id") || null
  const mimeType = req.headers.get("content-type") || "application/octet-stream"
  try {
    const data = Buffer.from(await req.arrayBuffer())
    if (data.byteLength === 0) return fail("Empty body", 400)
    const file = await files.serverUpload(actor.id, { name, folderId, mimeType, data })
    await audit("file_upload", { actorId: actor.id, target: file.name })
    return ok(file, 201)
  } catch (e) {
    return e instanceof files.FilesError ? fail(e.message, e.status) : fail("Internal error", 500)
  }
}
