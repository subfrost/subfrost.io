/**
 * One-off backfill: populate Folder.slug and DriveFile.slug for rows created
 * before slugs existed. Slugs are derived from `name` and de-duplicated within
 * their parent (folders) / folder (files), matching the uniqueness rules in
 * lib/files/manager.ts. Idempotent: rows that already have a slug are skipped.
 *
 * Run against the target database:
 *   DATABASE_URL=... npx tsx scripts/backfill-file-slugs.ts
 */
import { PrismaClient } from "@prisma/client"
import { toSlug } from "../lib/cms/slug"

const prisma = new PrismaClient()

function assign(base: string, taken: Set<string>): string {
  const seed = toSlug(base)
  let slug = seed
  let n = 1
  while (taken.has(slug)) {
    n += 1
    slug = `${seed}-${n}`
  }
  taken.add(slug)
  return slug
}

async function backfillFolders() {
  const folders = await prisma.folder.findMany({ select: { id: true, name: true, slug: true, parentId: true } })
  // Group by parentId (null → "root") and seed the taken-set with existing slugs.
  const groups = new Map<string, { taken: Set<string>; rows: typeof folders }>()
  for (const f of folders) {
    const key = f.parentId ?? "root"
    const g = groups.get(key) ?? { taken: new Set<string>(), rows: [] }
    if (f.slug) g.taken.add(f.slug)
    else g.rows.push(f)
    groups.set(key, g)
  }
  let n = 0
  for (const { taken, rows } of groups.values()) {
    for (const f of rows) {
      const slug = assign(f.name, taken)
      await prisma.folder.update({ where: { id: f.id }, data: { slug } })
      n++
    }
  }
  return n
}

async function backfillFiles() {
  const files = await prisma.driveFile.findMany({ select: { id: true, name: true, slug: true, folderId: true } })
  const groups = new Map<string, { taken: Set<string>; rows: typeof files }>()
  for (const f of files) {
    const key = f.folderId ?? "root"
    const g = groups.get(key) ?? { taken: new Set<string>(), rows: [] }
    if (f.slug) g.taken.add(f.slug)
    else g.rows.push(f)
    groups.set(key, g)
  }
  let n = 0
  for (const { taken, rows } of groups.values()) {
    for (const f of rows) {
      const slug = assign(f.name, taken)
      await prisma.driveFile.update({ where: { id: f.id }, data: { slug } })
      n++
    }
  }
  return n
}

async function main() {
  const folders = await backfillFolders()
  const files = await backfillFiles()
  console.log(`Backfilled ${folders} folder slug(s) and ${files} file slug(s).`)
}

main()
  .catch((e) => { console.error(e); process.exit(1) })
  .finally(() => prisma.$disconnect())
