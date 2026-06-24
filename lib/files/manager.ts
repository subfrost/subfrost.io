import { randomUUID } from "crypto"
import prisma from "@/lib/prisma"
import {
  signedUploadUrl,
  signedDownloadUrl,
  uploadObject,
  deleteObject,
  objectSize,
} from "@/lib/files/store"

// Business logic for the "Documents" file manager. Actor-agnostic (takes an
// actorId) so the cookie-session server actions (actions/cms/files.ts) and the
// Bearer REST routes (/api/v1/files) both reuse it. GCS lives in ./store.

export interface FolderView {
  id: string
  name: string
  parentId: string | null
  createdAt: string
}
export interface FileView {
  id: string
  name: string
  folderId: string | null
  mimeType: string
  size: string // BigInt → string (JSON-safe)
  tags: string[]
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function fview(f: { id: string; name: string; parentId: string | null; createdAt: Date }): FolderView {
  return { id: f.id, name: f.name, parentId: f.parentId, createdAt: f.createdAt.toISOString() }
}
function dview(f: {
  id: string; name: string; folderId: string | null; mimeType: string; size: bigint
  tags: string[]; metadata: unknown; createdAt: Date; updatedAt: Date
}): FileView {
  return {
    id: f.id, name: f.name, folderId: f.folderId, mimeType: f.mimeType, size: f.size.toString(),
    tags: f.tags, metadata: (f.metadata as Record<string, unknown>) ?? {},
    createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
  }
}

export class FilesError extends Error {
  constructor(message: string, public status = 400) { super(message) }
}

/** Breadcrumb from root → folderId (inclusive). Root is represented by []. */
export async function breadcrumb(folderId: string | null): Promise<FolderView[]> {
  const chain: FolderView[] = []
  let cur = folderId
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    seen.add(cur)
    const f = await prisma.folder.findUnique({ where: { id: cur } })
    if (!f) break
    chain.unshift(fview(f))
    cur = f.parentId
  }
  return chain
}

/** List a folder's contents (root when folderId is null) + breadcrumb. */
export async function listFolder(folderId: string | null) {
  if (folderId) {
    const exists = await prisma.folder.findUnique({ where: { id: folderId }, select: { id: true } })
    if (!exists) throw new FilesError("Folder not found", 404)
  }
  const [folders, files, crumbs] = await Promise.all([
    prisma.folder.findMany({ where: { parentId: folderId }, orderBy: { name: "asc" } }),
    prisma.driveFile.findMany({ where: { folderId }, orderBy: { name: "asc" } }),
    breadcrumb(folderId),
  ])
  return { folderId, breadcrumb: crumbs, folders: folders.map(fview), files: files.map(dview) }
}

export async function createFolder(actorId: string, name: string, parentId: string | null): Promise<FolderView> {
  name = name.trim()
  if (!name) throw new FilesError("Folder name is required")
  if (parentId) {
    const p = await prisma.folder.findUnique({ where: { id: parentId }, select: { id: true } })
    if (!p) throw new FilesError("Parent folder not found", 404)
  }
  const dup = await prisma.folder.findFirst({ where: { parentId, name } })
  if (dup) throw new FilesError("A folder with that name already exists here", 409)
  const f = await prisma.folder.create({ data: { name, parentId, createdById: actorId } })
  return fview(f)
}

/** Browser/large-file upload: create the record + return a signed PUT URL.
 *  The client PUTs the bytes to `uploadUrl` (same Content-Type), then calls
 *  finalizeUpload to record the real size. */
export async function prepareUpload(
  actorId: string,
  input: { name: string; folderId: string | null; mimeType: string },
): Promise<{ file: FileView; uploadUrl: string }> {
  const name = input.name.trim()
  if (!name) throw new FilesError("File name is required")
  await assertFolder(input.folderId)
  await assertUniqueFileName(input.folderId, name)
  const gcsObject = `files/${randomUUID()}`
  const file = await prisma.driveFile.create({
    data: {
      name, folderId: input.folderId, mimeType: input.mimeType || "application/octet-stream",
      size: BigInt(0), gcsObject, createdById: actorId,
    },
  })
  const uploadUrl = await signedUploadUrl(gcsObject, file.mimeType)
  return { file: dview(file), uploadUrl }
}

/** After a direct PUT, reconcile the recorded size from GCS. */
export async function finalizeUpload(fileId: string): Promise<FileView> {
  const file = await prisma.driveFile.findUnique({ where: { id: fileId } })
  if (!file) throw new FilesError("File not found", 404)
  const size = await objectSize(file.gcsObject)
  const updated = await prisma.driveFile.update({
    where: { id: fileId }, data: { size: BigInt(size ?? 0) },
  })
  return dview(updated)
}

/** Server-side upload of a buffer (CLI / small files). */
export async function serverUpload(
  actorId: string,
  input: { name: string; folderId: string | null; mimeType: string; data: Buffer },
): Promise<FileView> {
  const name = input.name.trim()
  if (!name) throw new FilesError("File name is required")
  await assertFolder(input.folderId)
  await assertUniqueFileName(input.folderId, name)
  const gcsObject = `files/${randomUUID()}`
  const mimeType = input.mimeType || "application/octet-stream"
  await uploadObject(gcsObject, mimeType, input.data)
  const file = await prisma.driveFile.create({
    data: {
      name, folderId: input.folderId, mimeType, size: BigInt(input.data.byteLength),
      gcsObject, createdById: actorId,
    },
  })
  return dview(file)
}

/** File metadata + a short-lived signed download URL (for preview/download). */
export async function getFile(fileId: string, asDownload = false): Promise<{ file: FileView; url: string }> {
  const file = await prisma.driveFile.findUnique({ where: { id: fileId } })
  if (!file) throw new FilesError("File not found", 404)
  const url = await signedDownloadUrl(file.gcsObject, asDownload ? file.name : undefined)
  return { file: dview(file), url }
}

export async function updateFile(
  fileId: string,
  patch: { name?: string; folderId?: string | null; metadata?: Record<string, unknown>; tags?: string[] },
): Promise<FileView> {
  const file = await prisma.driveFile.findUnique({ where: { id: fileId } })
  if (!file) throw new FilesError("File not found", 404)
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new FilesError("Name cannot be empty")
    data.name = name
  }
  if (patch.folderId !== undefined) {
    await assertFolder(patch.folderId)
    data.folderId = patch.folderId
  }
  if (patch.metadata !== undefined) data.metadata = patch.metadata
  if (patch.tags !== undefined) data.tags = patch.tags
  // uniqueness check for the resulting (folder, name)
  const targetFolder = (data.folderId !== undefined ? data.folderId : file.folderId) as string | null
  const targetName = (data.name !== undefined ? data.name : file.name) as string
  if (data.name !== undefined || data.folderId !== undefined) {
    const dup = await prisma.driveFile.findFirst({
      where: { folderId: targetFolder, name: targetName, id: { not: fileId } },
    })
    if (dup) throw new FilesError("A file with that name already exists in the destination", 409)
  }
  const updated = await prisma.driveFile.update({ where: { id: fileId }, data })
  return dview(updated)
}

export async function deleteFile(fileId: string): Promise<void> {
  const file = await prisma.driveFile.findUnique({ where: { id: fileId } })
  if (!file) throw new FilesError("File not found", 404)
  await deleteObject(file.gcsObject)
  await prisma.driveFile.delete({ where: { id: fileId } })
}

export async function updateFolder(
  folderId: string,
  patch: { name?: string; parentId?: string | null },
): Promise<FolderView> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId } })
  if (!folder) throw new FilesError("Folder not found", 404)
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const name = patch.name.trim()
    if (!name) throw new FilesError("Name cannot be empty")
    data.name = name
  }
  if (patch.parentId !== undefined) {
    if (patch.parentId === folderId) throw new FilesError("A folder cannot be its own parent")
    // prevent moving into a descendant
    if (patch.parentId && (await isDescendant(patch.parentId, folderId))) {
      throw new FilesError("Cannot move a folder into its own subtree")
    }
    await assertFolder(patch.parentId)
    data.parentId = patch.parentId
  }
  const updated = await prisma.folder.update({ where: { id: folderId }, data })
  return fview(updated)
}

/** Recursively delete a folder: removes all descendant files' GCS objects +
 *  records, then the folder subtree (folder rows cascade via FolderTree). */
export async function deleteFolder(folderId: string): Promise<void> {
  const folder = await prisma.folder.findUnique({ where: { id: folderId }, select: { id: true } })
  if (!folder) throw new FilesError("Folder not found", 404)
  const ids = await collectSubtree(folderId)
  const files = await prisma.driveFile.findMany({ where: { folderId: { in: ids } }, select: { id: true, gcsObject: true } })
  await Promise.all(files.map((f) => deleteObject(f.gcsObject)))
  await prisma.driveFile.deleteMany({ where: { folderId: { in: ids } } })
  await prisma.folder.delete({ where: { id: folderId } }) // cascades child folders
}

// --- helpers ---------------------------------------------------------------

async function assertFolder(folderId: string | null): Promise<void> {
  if (!folderId) return
  const f = await prisma.folder.findUnique({ where: { id: folderId }, select: { id: true } })
  if (!f) throw new FilesError("Folder not found", 404)
}

async function assertUniqueFileName(folderId: string | null, name: string): Promise<void> {
  const dup = await prisma.driveFile.findFirst({ where: { folderId, name } })
  if (dup) throw new FilesError("A file with that name already exists here", 409)
}

async function collectSubtree(rootId: string): Promise<string[]> {
  const out = [rootId]
  let frontier = [rootId]
  while (frontier.length) {
    const kids = await prisma.folder.findMany({ where: { parentId: { in: frontier } }, select: { id: true } })
    frontier = kids.map((k) => k.id)
    out.push(...frontier)
  }
  return out
}

async function isDescendant(candidateId: string, ancestorId: string): Promise<boolean> {
  let cur: string | null = candidateId
  const seen = new Set<string>()
  while (cur && !seen.has(cur)) {
    if (cur === ancestorId) return true
    seen.add(cur)
    const f: { parentId: string | null } | null = await prisma.folder.findUnique({
      where: { id: cur }, select: { parentId: true },
    })
    cur = f?.parentId ?? null
  }
  return false
}
