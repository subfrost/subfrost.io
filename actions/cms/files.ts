"use server"

import { revalidatePath } from "next/cache"
import { currentUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import * as files from "@/lib/files/manager"

type Ok<T> = { ok: true } & T
type Result<T = unknown> = Ok<T> | { ok: false; error: string }

async function gate(write: boolean): Promise<{ ok: true; id: string } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  const need = write ? "files.edit" : "files.read"
  if (!me.privileges.includes(need)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, id: me.id }
}

function fail(e: unknown): { ok: false; error: string } {
  return { ok: false, error: e instanceof Error ? e.message : "Operation failed" }
}

export async function listFolderAction(folderId: string | null): Promise<Result<{ data: Awaited<ReturnType<typeof files.listFolder>> }>> {
  const g = await gate(false)
  if (!g.ok) return g
  try {
    return { ok: true, data: await files.listFolder(folderId) }
  } catch (e) { return fail(e) }
}

export async function createFolderAction(name: string, parentId: string | null): Promise<Result<{ folder: files.FolderView }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const folder = await files.createFolder(g.id, name, parentId)
    revalidatePath("/admin/files")
    return { ok: true, folder }
  } catch (e) { return fail(e) }
}

export async function prepareUploadAction(input: { name: string; folderId: string | null; mimeType: string }): Promise<Result<{ file: files.FileView; uploadUrl: string }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const res = await files.prepareUpload(g.id, input)
    return { ok: true, ...res }
  } catch (e) { return fail(e) }
}

export async function finalizeUploadAction(fileId: string): Promise<Result<{ file: files.FileView }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const file = await files.finalizeUpload(fileId)
    await audit("file_upload", { actorId: g.id, target: file.name })
    revalidatePath("/admin/files")
    return { ok: true, file }
  } catch (e) { return fail(e) }
}

export async function getFileUrlAction(fileId: string, asDownload = false): Promise<Result<{ file: files.FileView; url: string }>> {
  const g = await gate(false)
  if (!g.ok) return g
  try {
    return { ok: true, ...(await files.getFile(fileId, asDownload)) }
  } catch (e) { return fail(e) }
}

export async function updateFileAction(
  fileId: string,
  patch: { name?: string; folderId?: string | null; metadata?: Record<string, unknown>; tags?: string[] },
): Promise<Result<{ file: files.FileView }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const file = await files.updateFile(fileId, patch)
    revalidatePath("/admin/files")
    return { ok: true, file }
  } catch (e) { return fail(e) }
}

export async function deleteFileAction(fileId: string): Promise<Result> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    await files.deleteFile(fileId)
    await audit("file_delete", { actorId: g.id, target: fileId })
    revalidatePath("/admin/files")
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateFolderAction(folderId: string, patch: { name?: string; parentId?: string | null }): Promise<Result<{ folder: files.FolderView }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const folder = await files.updateFolder(folderId, patch)
    revalidatePath("/admin/files")
    return { ok: true, folder }
  } catch (e) { return fail(e) }
}

export async function deleteFolderAction(folderId: string): Promise<Result> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    await files.deleteFolder(folderId)
    await audit("file_delete", { actorId: g.id, target: `folder:${folderId}` })
    revalidatePath("/admin/files")
    return { ok: true }
  } catch (e) { return fail(e) }
}
