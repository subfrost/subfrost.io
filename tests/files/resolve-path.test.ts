// WS2 — exercises the slug path resolver + path builder against an in-memory
// Prisma mock. Proves: descends folders by slug, finds a terminal file, falls
// back to a name-derived slug for legacy rows (slug === null), and rejects
// unknown drives / paths.
import { describe, it, expect, vi } from "vitest"

const now = new Date("2026-01-01T00:00:00Z")

// A tiny two-drive tree.
const folders = [
  { id: "f1", name: "Contracts", slug: "contracts", parentId: null, scope: "SUBFROST", createdAt: now, updatedAt: now },
  { id: "f2", name: "SAFEs", slug: "safes", parentId: "f1", scope: "SUBFROST", createdAt: now, updatedAt: now },
  // legacy row with no stored slug — must resolve via toSlug(name) = "board-consents"
  { id: "f3", name: "Board Consents", slug: null, parentId: "f1", scope: "SUBFROST", createdAt: now, updatedAt: now },
  { id: "o1", name: "Corp", slug: "corp", parentId: null, scope: "OYL", createdAt: now, updatedAt: now },
]
const driveFiles = [
  { id: "file1", name: "acme.pdf", slug: "acme-pdf", folderId: "f2", scope: "SUBFROST", mimeType: "application/pdf", size: BigInt(10), metadata: {}, tags: [], createdAt: now, updatedAt: now },
]

function match<T extends Record<string, unknown>>(rows: T[], where: Record<string, unknown>): T[] {
  return rows.filter((r) => Object.entries(where).every(([k, v]) => v === undefined || r[k] === v))
}

vi.mock("@/lib/prisma", () => {
  const folder = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => match(folders, where)[0] ?? null),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => match(folders, where)),
  }
  const driveFile = {
    findFirst: vi.fn(async ({ where }: { where: Record<string, unknown> }) => match(driveFiles, where)[0] ?? null),
    findMany: vi.fn(async ({ where }: { where: Record<string, unknown> }) => match(driveFiles, where)),
  }
  const client = { folder, driveFile }
  return { prisma: client, default: client }
})

import { resolvePath, filesPath, FilesError } from "@/lib/files/manager"

describe("filesPath", () => {
  it("builds a drive-rooted path from slugs", () => {
    expect(filesPath("subfrost")).toBe("/admin/files/subfrost")
    expect(filesPath("oyl", ["corp", "board"])).toBe("/admin/files/oyl/corp/board")
  })
})

describe("resolvePath", () => {
  it("descends nested folders and returns the folder view (no file)", async () => {
    const r = await resolvePath("subfrost", ["contracts", "safes"])
    expect(r.file).toBeNull()
    expect(r.folderId).toBe("f2")
    expect(r.folderChain.map((f) => f.slug)).toEqual(["contracts", "safes"])
    expect(r.scope).toBe("SUBFROST")
  })

  it("resolves a terminal file by slug", async () => {
    const r = await resolvePath("subfrost", ["contracts", "safes", "acme-pdf"])
    expect(r.file?.id).toBe("file1")
    expect(r.folderId).toBe("f2")
  })

  it("resolves a legacy folder (null slug) by its name-derived slug", async () => {
    const r = await resolvePath("subfrost", ["contracts", "board-consents"])
    expect(r.folderId).toBe("f3")
    expect(r.folderChain.map((f) => f.slug)).toEqual(["contracts", "board-consents"])
  })

  it("scopes root lookups to the drive", async () => {
    const r = await resolvePath("oyl", ["corp"])
    expect(r.folderId).toBe("o1")
    // 'contracts' is a SUBFROST root, so it must NOT resolve under the oyl drive
    await expect(resolvePath("oyl", ["contracts"])).rejects.toBeInstanceOf(FilesError)
  })

  it("rejects an unknown drive", async () => {
    await expect(resolvePath("nope", [])).rejects.toBeInstanceOf(FilesError)
  })
})
