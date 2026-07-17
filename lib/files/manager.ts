import { randomUUID } from "crypto"
import { Prisma } from "@prisma/client"
import type { LegalScope, EntityFileRole, Folder, DriveFile } from "@prisma/client"
import prisma from "@/lib/prisma"
import { toSlug } from "@/lib/cms/slug"
import { filesPath } from "@/lib/files/paths"
import { isDocType, isDocStatus } from "@/lib/files/doc-types"
import {
  signedUploadUrl,
  signedDownloadUrl,
  uploadObject,
  deleteObject,
  objectSize,
} from "@/lib/files/store"

// The two drives, addressed by URL slug. SUBFROST is the default drive; OYL is
// the (formerly separate) "OYL Drive". Both live under one /admin/files tree.
export const DRIVES = [
  { slug: "subfrost", scope: "SUBFROST" as LegalScope, label: "SUBFROST" },
  { slug: "oyl", scope: "OYL" as LegalScope, label: "OYL" },
]
export function driveScopeFromSlug(slug: string): LegalScope | null {
  return DRIVES.find((d) => d.slug === slug)?.scope ?? null
}
export function driveSlugFromScope(scope: LegalScope): string {
  return DRIVES.find((d) => d.scope === scope)?.slug ?? "subfrost"
}
/** Effective slug for a row: stored slug, else derived from name (so path
 *  resolution works before the backfill has run). */
export function effSlug(row: { slug: string | null; name: string }): string {
  return row.slug || toSlug(row.name)
}

// Business logic for the "Documents" file manager. Actor-agnostic (takes an
// actorId) so the cookie-session server actions (actions/cms/files.ts) and the
// Bearer REST routes (/api/v1/files) both reuse it. GCS lives in ./store.

export interface FolderView {
  id: string
  name: string
  slug: string
  parentId: string | null
  scope: LegalScope
  createdAt: string
}
export interface FileView {
  id: string
  name: string
  slug: string
  folderId: string | null
  scope: LegalScope
  mimeType: string
  size: string // BigInt → string (JSON-safe)
  tags: string[]
  docType: string | null
  docStatus: string | null
  metadata: Record<string, unknown>
  createdAt: string
  updatedAt: string
}

function fview(f: { id: string; name: string; slug: string | null; parentId: string | null; scope: LegalScope; createdAt: Date }): FolderView {
  return { id: f.id, name: f.name, slug: effSlug(f), parentId: f.parentId, scope: f.scope, createdAt: f.createdAt.toISOString() }
}
function dview(f: {
  id: string; name: string; slug: string | null; folderId: string | null; scope: LegalScope; mimeType: string; size: bigint
  tags: string[]; docType?: string | null; docStatus?: string | null; metadata: unknown; createdAt: Date; updatedAt: Date
}): FileView {
  return {
    id: f.id, name: f.name, slug: effSlug(f), folderId: f.folderId, scope: f.scope, mimeType: f.mimeType, size: f.size.toString(),
    tags: f.tags, docType: f.docType ?? null, docStatus: f.docStatus ?? null, metadata: (f.metadata as Record<string, unknown>) ?? {},
    createdAt: f.createdAt.toISOString(), updatedAt: f.updatedAt.toISOString(),
  }
}

// --- slug helpers ----------------------------------------------------------

/** A slug unique within a parent folder, appending -2, -3, … on collision. */
async function uniqueFolderSlug(parentId: string | null, base: string, ignoreId?: string): Promise<string> {
  const seed = toSlug(base)
  let slug = seed
  let n = 1
  while (true) {
    const existing = await prisma.folder.findFirst({ where: { parentId, slug }, select: { id: true } })
    if (!existing || existing.id === ignoreId) return slug
    n += 1
    slug = `${seed}-${n}`
  }
}
async function uniqueFileSlug(folderId: string | null, base: string, ignoreId?: string): Promise<string> {
  const seed = toSlug(base)
  let slug = seed
  let n = 1
  while (true) {
    const existing = await prisma.driveFile.findFirst({ where: { folderId, slug }, select: { id: true } })
    if (!existing || existing.id === ignoreId) return slug
    n += 1
    slug = `${seed}-${n}`
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

/** List a folder's contents (root when folderId is null) + breadcrumb. At root,
 *  `scope` filters to a single drive (SUBFROST = Documents, OYL = OYL Drive). */
export async function listFolder(folderId: string | null, scope: LegalScope = "SUBFROST") {
  if (folderId) {
    const exists = await prisma.folder.findUnique({ where: { id: folderId }, select: { id: true } })
    if (!exists) throw new FilesError("Folder not found", 404)
  }
  const [folders, files, crumbs] = await Promise.all([
    prisma.folder.findMany({ where: { parentId: folderId, ...(folderId ? {} : { scope }) }, orderBy: { name: "asc" } }),
    prisma.driveFile.findMany({ where: { folderId, ...(folderId ? {} : { scope }) }, orderBy: { name: "asc" } }),
    breadcrumb(folderId),
  ])
  return { folderId, scope, breadcrumb: crumbs, folders: folders.map(fview), files: files.map(dview) }
}

export { filesPath }

export interface ResolvedPath {
  scope: LegalScope
  driveSlug: string
  /** Root → current folder (inclusive). Empty at a drive root. */
  folderChain: FolderView[]
  /** The folder being viewed (null = drive root). */
  folderId: string | null
  /** Set when the terminal segment addressed a file rather than a folder. */
  file: FileView | null
}

/** Resolve a `/admin/files/<drive>/<slug>/…` path to a folder (explorer) or a
 *  terminal file (renderer). Matches by stored slug, falling back to a slug
 *  derived from the name so legacy rows resolve before the backfill runs. */
export async function resolvePath(driveSlug: string, segments: string[]): Promise<ResolvedPath> {
  const scope = driveScopeFromSlug(driveSlug)
  if (!scope) throw new FilesError("Unknown drive", 404)

  let parentId: string | null = null
  const folderChain: FolderView[] = []

  for (let i = 0; i < segments.length; i++) {
    const seg = segments[i]
    const atRoot: boolean = parentId === null
    // scope only constrains root-level rows (children inherit their parent's drive)
    const scopeAtRoot = atRoot ? { scope } : {}
    // Try to descend into a child folder.
    const folderWhere: Prisma.FolderWhereInput = { parentId, slug: seg, ...scopeAtRoot }
    let folder: Folder | null = await prisma.folder.findFirst({ where: folderWhere })
    if (!folder) {
      const kidsWhere: Prisma.FolderWhereInput = { parentId, ...scopeAtRoot }
      const kids: Folder[] = await prisma.folder.findMany({ where: kidsWhere })
      folder = kids.find((k) => effSlug(k) === seg) ?? null
    }
    if (folder) {
      folderChain.push(fview(folder))
      parentId = folder.id
      continue
    }
    // Not a folder — the last segment may be a file in the current folder.
    if (i === segments.length - 1) {
      const fileWhere: Prisma.DriveFileWhereInput = { folderId: parentId, slug: seg, ...scopeAtRoot }
      let file: DriveFile | null = await prisma.driveFile.findFirst({ where: fileWhere })
      if (!file) {
        const dfsWhere: Prisma.DriveFileWhereInput = { folderId: parentId, ...scopeAtRoot }
        const dfs: DriveFile[] = await prisma.driveFile.findMany({ where: dfsWhere })
        file = dfs.find((d) => effSlug(d) === seg) ?? null
      }
      if (file) return { scope, driveSlug, folderChain, folderId: parentId, file: dview(file) }
    }
    throw new FilesError("Not found", 404)
  }

  return { scope, driveSlug, folderChain, folderId: parentId, file: null }
}

export interface NavTreeNode { name: string; slug: string; path: string; children: NavTreeNode[] }
export interface NavTreeDrive { slug: string; label: string; path: string; children: NavTreeNode[] }

/** The top two folder levels of each drive, for the collapsible nav tree. */
export async function filesNavTree(): Promise<NavTreeDrive[]> {
  const out: NavTreeDrive[] = []
  for (const drive of DRIVES) {
    const roots = await prisma.folder.findMany({
      where: { parentId: null, scope: drive.scope }, orderBy: { name: "asc" },
    })
    const level1: NavTreeNode[] = []
    for (const r of roots) {
      const rSlug = effSlug(r)
      const kids = await prisma.folder.findMany({ where: { parentId: r.id }, orderBy: { name: "asc" } })
      level1.push({
        name: r.name, slug: rSlug, path: filesPath(drive.slug, [rSlug]),
        children: kids.map((k) => {
          const kSlug = effSlug(k)
          return { name: k.name, slug: kSlug, path: filesPath(drive.slug, [rSlug, kSlug]), children: [] }
        }),
      })
    }
    out.push({ slug: drive.slug, label: drive.label, path: filesPath(drive.slug), children: level1 })
  }
  return out
}

export async function createFolder(
  actorId: string, name: string, parentId: string | null, scope: LegalScope = "SUBFROST",
): Promise<FolderView> {
  name = name.trim()
  if (!name) throw new FilesError("Folder name is required")
  // A child folder always inherits its parent's drive; scope only applies at root.
  if (parentId) {
    const p = await prisma.folder.findUnique({ where: { id: parentId }, select: { id: true, scope: true } })
    if (!p) throw new FilesError("Parent folder not found", 404)
    scope = p.scope
  }
  const dup = await prisma.folder.findFirst({ where: { parentId, name } })
  if (dup) throw new FilesError("A folder with that name already exists here", 409)
  const slug = await uniqueFolderSlug(parentId, name)
  const f = await prisma.folder.create({ data: { name, slug, parentId, scope, createdById: actorId } })
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
  const scope = await folderScope(input.folderId)
  await assertUniqueFileName(input.folderId, name)
  const gcsObject = `files/${randomUUID()}`
  const slug = await uniqueFileSlug(input.folderId, name)
  const file = await prisma.driveFile.create({
    data: {
      name, slug, folderId: input.folderId, scope, mimeType: input.mimeType || "application/octet-stream",
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
  const scope = await folderScope(input.folderId)
  await assertUniqueFileName(input.folderId, name)
  const gcsObject = `files/${randomUUID()}`
  const mimeType = input.mimeType || "application/octet-stream"
  await uploadObject(gcsObject, mimeType, input.data)
  const slug = await uniqueFileSlug(input.folderId, name)
  const file = await prisma.driveFile.create({
    data: {
      name, slug, folderId: input.folderId, scope, mimeType, size: BigInt(input.data.byteLength),
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
  patch: { name?: string; folderId?: string | null; metadata?: Record<string, unknown>; tags?: string[]; docType?: string | null; docStatus?: string | null },
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
    data.folderId = patch.folderId
    data.scope = await folderScope(patch.folderId) // moving drives re-scopes the file
  }
  if (patch.metadata !== undefined) data.metadata = patch.metadata
  if (patch.tags !== undefined) data.tags = patch.tags
  if (patch.docType !== undefined) data.docType = patch.docType && isDocType(patch.docType) ? patch.docType : null
  if (patch.docStatus !== undefined) data.docStatus = patch.docStatus && isDocStatus(patch.docStatus) ? patch.docStatus : null
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

// --- search ----------------------------------------------------------------
export interface FileSearchHit {
  file: FileView
  folderPath: { id: string; name: string; slug: string }[] // breadcrumb (root → parent)
  snippet: string // ts_headline of the match; hits wrapped in %%HL%%…%%EH%% sentinels (escape then convert to <mark> on render)
  matchedName: boolean
}

type SearchRow = {
  id: string; name: string; slug: string | null; folderId: string | null; scope: LegalScope
  mimeType: string; size: bigint; tags: string[]; docType: string | null; docStatus: string | null
  metadata: unknown; createdAt: Date; updatedAt: Date; rank: number; snippet: string | null; matched_name: boolean
}

/**
 * Google-Drive-style search: matches the filename AND the text inside documents
 * (plus the summary + tags), ranked, with a highlighted snippet. Full-text
 * (websearch_to_tsquery) for word/phrase matching, OR ILIKE for substrings/prefixes.
 */
export async function searchFiles(query: string, opts?: { scope?: LegalScope; limit?: number }): Promise<FileSearchHit[]> {
  const q = query.trim()
  if (q.length < 2) return []
  const limit = Math.min(Math.max(opts?.limit ?? 40, 1), 100)
  const like = `%${q.replace(/[\\%_]/g, (m) => "\\" + m)}%`
  const scopeCond = opts?.scope ? Prisma.sql`AND f.scope = ${opts.scope}::"LegalScope"` : Prisma.empty
  const rows = await prisma.$queryRaw<SearchRow[]>(Prisma.sql`
    WITH q AS (SELECT websearch_to_tsquery('english', ${q}) AS tsq)
    SELECT f.id, f.name, f.slug, f."folderId", f.scope, f."mimeType", f.size, f.tags,
           f."docType", f."docStatus", f.metadata, f."createdAt", f."updatedAt",
           ts_rank(
             to_tsvector('english', coalesce(f."contentText",'') || ' ' || f.name || ' ' || coalesce(f.metadata->'classification'->>'summary','')),
             q.tsq
           ) AS rank,
           ts_headline('english',
             coalesce(NULLIF(f."contentText",''), coalesce(f.metadata->'classification'->>'summary', f.name)),
             q.tsq, 'StartSel=%%HL%%,StopSel=%%EH%%,MaxWords=22,MinWords=8,MaxFragments=1,ShortWord=2'
           ) AS snippet,
           (f.name ILIKE ${like}) AS matched_name
    FROM "DriveFile" f, q
    WHERE (
      to_tsvector('english', coalesce(f."contentText",'') || ' ' || f.name || ' ' || coalesce(f.metadata->'classification'->>'summary','') || ' ' || array_to_string(f.tags,' ')) @@ q.tsq
      OR f.name ILIKE ${like}
      OR coalesce(f."contentText",'') ILIKE ${like}
    )
    ${scopeCond}
    ORDER BY (f.name ILIKE ${like}) DESC, rank DESC, f."updatedAt" DESC
    LIMIT ${limit}
  `)

  // resolve folder breadcrumbs for the hits (few folders total → one fetch)
  const allFolders = await prisma.folder.findMany({ select: { id: true, name: true, slug: true, parentId: true } })
  const byId = new Map(allFolders.map((f) => [f.id, f]))
  const pathOf = (folderId: string | null) => {
    const chain: { id: string; name: string; slug: string }[] = []
    let cur = folderId ? byId.get(folderId) : undefined
    let guard = 0
    while (cur && guard++ < 30) {
      chain.unshift({ id: cur.id, name: cur.name, slug: effSlug(cur) })
      cur = cur.parentId ? byId.get(cur.parentId) : undefined
    }
    return chain
  }

  return rows.map((r) => ({
    file: dview({
      id: r.id, name: r.name, slug: r.slug, folderId: r.folderId, scope: r.scope, mimeType: r.mimeType,
      size: r.size, tags: r.tags, docType: r.docType, docStatus: r.docStatus, metadata: r.metadata,
      createdAt: r.createdAt, updatedAt: r.updatedAt,
    }),
    folderPath: pathOf(r.folderId),
    snippet: r.snippet ?? "",
    matchedName: !!r.matched_name,
  }))
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

/** Resolve the drive (scope) a file should belong to from its folder. Root-level
 *  files default to SUBFROST. Also asserts the folder exists. */
async function folderScope(folderId: string | null): Promise<LegalScope> {
  if (!folderId) return "SUBFROST"
  const f = await prisma.folder.findUnique({ where: { id: folderId }, select: { scope: true } })
  if (!f) throw new FilesError("Folder not found", 404)
  return f.scope
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

// --- entity links (the file↔registry graph) -------------------------------

export interface FileEntityLinkView {
  id: string
  role: EntityFileRole
  annotation: string | null
  entity: { id: string; name: string; kind: string; category: string; scope: LegalScope }
}
export interface EntityFileView {
  id: string // link id
  role: EntityFileRole
  annotation: string | null
  file: FileView
}

/** Link a file to a registry entity (signatory/counterparty/subject/mentioned).
 *  Idempotent on (file, entity, role). */
export async function linkEntityToFile(
  actorId: string | null,
  input: { fileId: string; entityId: string; role?: EntityFileRole; annotation?: string | null },
): Promise<FileEntityLinkView> {
  const [file, entity] = await Promise.all([
    prisma.driveFile.findUnique({ where: { id: input.fileId }, select: { id: true } }),
    prisma.legalEntity.findUnique({ where: { id: input.entityId }, select: { id: true } }),
  ])
  if (!file) throw new FilesError("File not found", 404)
  if (!entity) throw new FilesError("Entity not found", 404)
  const role = input.role ?? "SUBJECT"
  const link = await prisma.entityFileLink.upsert({
    where: { fileId_entityId_role: { fileId: input.fileId, entityId: input.entityId, role } },
    update: { annotation: input.annotation ?? null },
    create: { fileId: input.fileId, entityId: input.entityId, role, annotation: input.annotation ?? null, createdById: actorId },
    include: { entity: { select: { id: true, name: true, kind: true, category: true, scope: true } } },
  })
  return { id: link.id, role: link.role, annotation: link.annotation, entity: link.entity }
}

export async function unlinkEntityFromFile(linkId: string): Promise<void> {
  await prisma.entityFileLink.delete({ where: { id: linkId } }).catch(() => {
    throw new FilesError("Link not found", 404)
  })
}

/** Every entity linked to a file (for the file's detail panel). */
export async function listFileLinks(fileId: string): Promise<FileEntityLinkView[]> {
  const links = await prisma.entityFileLink.findMany({
    where: { fileId },
    orderBy: { createdAt: "asc" },
    include: { entity: { select: { id: true, name: true, kind: true, category: true, scope: true } } },
  })
  return links.map((l) => ({ id: l.id, role: l.role, annotation: l.annotation, entity: l.entity }))
}

/** Every file linked to an entity (for the entity's Documents tab). */
export async function listEntityFiles(entityId: string): Promise<EntityFileView[]> {
  const links = await prisma.entityFileLink.findMany({
    where: { entityId },
    orderBy: { createdAt: "desc" },
    include: { file: true },
  })
  return links.map((l) => ({ id: l.id, role: l.role, annotation: l.annotation, file: dview(l.file) }))
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
