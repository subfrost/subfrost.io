import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail } from "@/lib/cms/api-route"
import * as files from "@/lib/files/manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function mapErr(e: unknown) {
  return e instanceof files.FilesError ? fail(e.message, e.status) : fail("Internal error", 500)
}

// GET /api/v1/files/:id[?download=1] — metadata + a short-lived signed URL.
export async function GET(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "files.read")
  if (actor instanceof NextResponse) return actor
  try {
    const { id } = await ctx.params
    const asDownload = req.nextUrl.searchParams.get("download") != null
    return ok(await files.getFile(id, asDownload))
  } catch (e) { return mapErr(e) }
}

// PATCH /api/v1/files/:id — rename / move / metadata / tags.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "files.edit")
  if (actor instanceof NextResponse) return actor
  const body = await readJson<{ name?: string; folderId?: string | null; metadata?: Record<string, unknown>; tags?: string[] }>(req)
  if (body instanceof NextResponse) return body
  try {
    const { id } = await ctx.params
    return ok(await files.updateFile(id, body))
  } catch (e) { return mapErr(e) }
}

// DELETE /api/v1/files/:id — delete the file + its GCS object.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "files.edit")
  if (actor instanceof NextResponse) return actor
  try {
    const { id } = await ctx.params
    await files.deleteFile(id)
    await audit("file_delete", { actorId: actor.id, target: id })
    return ok({ ok: true })
  } catch (e) { return mapErr(e) }
}
