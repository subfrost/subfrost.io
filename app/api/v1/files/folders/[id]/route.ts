import { NextRequest, NextResponse } from "next/server"
import { audit } from "@/lib/cms/audit"
import { requireScope, readJson, ok, fail } from "@/lib/cms/api-route"
import * as files from "@/lib/files/manager"

export const runtime = "nodejs"
export const dynamic = "force-dynamic"

function mapErr(e: unknown) {
  return e instanceof files.FilesError ? fail(e.message, e.status) : fail("Internal error", 500)
}

// PATCH /api/v1/files/folders/:id — rename / move a folder { name?, parentId? }.
export async function PATCH(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "files.edit")
  if (actor instanceof NextResponse) return actor
  const body = await readJson<{ name?: string; parentId?: string | null }>(req)
  if (body instanceof NextResponse) return body
  try {
    const { id } = await ctx.params
    return ok(await files.updateFolder(id, body))
  } catch (e) { return mapErr(e) }
}

// DELETE /api/v1/files/folders/:id — delete a folder + its whole subtree.
export async function DELETE(req: NextRequest, ctx: { params: Promise<{ id: string }> }) {
  const actor = await requireScope(req, "files.edit")
  if (actor instanceof NextResponse) return actor
  try {
    const { id } = await ctx.params
    await files.deleteFolder(id)
    await audit("file_delete", { actorId: actor.id, target: `folder:${id}` })
    return ok({ ok: true })
  } catch (e) { return mapErr(e) }
}
