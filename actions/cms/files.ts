"use server"

import { revalidatePath } from "next/cache"
import type { LegalScope, EntityFileRole } from "@prisma/client"
import { currentUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import * as files from "@/lib/files/manager"

type Ok<T> = { ok: true } & T
type Result<T = unknown> = Ok<T> | { ok: false; error: string }

// Both drives now live under one /admin/files tree; revalidate it after any
// mutation. (The `scope` arg is kept for call-site compatibility.)
function driveRevalidate(_scope: LegalScope = "SUBFROST") {
  revalidatePath("/admin/files")
}

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

export async function listFolderAction(folderId: string | null, scope: LegalScope = "SUBFROST"): Promise<Result<{ data: Awaited<ReturnType<typeof files.listFolder>> }>> {
  const g = await gate(false)
  if (!g.ok) return g
  try {
    return { ok: true, data: await files.listFolder(folderId, scope) }
  } catch (e) { return fail(e) }
}

export async function createFolderAction(name: string, parentId: string | null, scope: LegalScope = "SUBFROST"): Promise<Result<{ folder: files.FolderView }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const folder = await files.createFolder(g.id, name, parentId, scope)
    driveRevalidate(folder.scope)
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
    driveRevalidate(file.scope)
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
  patch: { name?: string; folderId?: string | null; metadata?: Record<string, unknown>; tags?: string[]; docType?: string | null; docStatus?: string | null },
): Promise<Result<{ file: files.FileView }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const file = await files.updateFile(fileId, patch)
    driveRevalidate("SUBFROST"); driveRevalidate("OYL") // a move can cross drives
    return { ok: true, file }
  } catch (e) { return fail(e) }
}

export async function deleteFileAction(fileId: string): Promise<Result> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    await files.deleteFile(fileId)
    await audit("file_delete", { actorId: g.id, target: fileId })
    driveRevalidate("SUBFROST"); driveRevalidate("OYL")
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function updateFolderAction(folderId: string, patch: { name?: string; parentId?: string | null }): Promise<Result<{ folder: files.FolderView }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const folder = await files.updateFolder(folderId, patch)
    driveRevalidate(folder.scope)
    return { ok: true, folder }
  } catch (e) { return fail(e) }
}

export async function deleteFolderAction(folderId: string): Promise<Result> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    await files.deleteFolder(folderId)
    await audit("file_delete", { actorId: g.id, target: `folder:${folderId}` })
    driveRevalidate("SUBFROST"); driveRevalidate("OYL")
    return { ok: true }
  } catch (e) { return fail(e) }
}

// --- file ↔ entity graph links --------------------------------------------

export async function linkEntityFileAction(
  input: { fileId: string; entityId: string; role?: EntityFileRole; annotation?: string | null },
): Promise<Result<{ link: files.FileEntityLinkView }>> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    const link = await files.linkEntityToFile(g.id, input)
    await audit("file_entity_link", { actorId: g.id, target: input.fileId, details: { entityId: input.entityId, role: link.role } })
    driveRevalidate("SUBFROST"); driveRevalidate("OYL")
    revalidatePath("/admin/legal")
    return { ok: true, link }
  } catch (e) { return fail(e) }
}

export async function unlinkEntityFileAction(linkId: string): Promise<Result> {
  const g = await gate(true)
  if (!g.ok) return g
  try {
    await files.unlinkEntityFromFile(linkId)
    await audit("file_entity_unlink", { actorId: g.id, target: linkId })
    driveRevalidate("SUBFROST"); driveRevalidate("OYL")
    revalidatePath("/admin/legal")
    return { ok: true }
  } catch (e) { return fail(e) }
}

export async function listFileLinksAction(fileId: string): Promise<Result<{ links: files.FileEntityLinkView[] }>> {
  const g = await gate(false)
  if (!g.ok) return g
  try {
    return { ok: true, links: await files.listFileLinks(fileId) }
  } catch (e) { return fail(e) }
}

export async function listEntityFilesAction(entityId: string): Promise<Result<{ files: files.EntityFileView[] }>> {
  const g = await gate(false)
  if (!g.ok) return g
  try {
    return { ok: true, files: await files.listEntityFiles(entityId) }
  } catch (e) { return fail(e) }
}
