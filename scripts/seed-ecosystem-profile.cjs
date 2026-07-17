// scripts/seed-ecosystem-profile.cjs
/**
 * Seeds PROFILE content (markdown body, contract rows, optional description
 * refinements) for EXISTING ecosystem projects. It NEVER creates a project:
 * unknown slugs are reported and skipped (create them via /admin first).
 * For each listed slug this file is the source of truth: profile fields are
 * overwritten and contract rows replaced when present in the entry.
 *
 * Usage (local):  node scripts/seed-ecosystem-profile.cjs --dry-run
 * Usage (in-pod): NODE_PATH=/app/node_modules node /app/scripts/seed-ecosystem-profile.cjs
 */
const { PrismaClient } = require("@prisma/client")
const fs = require("node:fs")
const path = require("node:path")

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const fileIdx = args.indexOf("--file")
  const dataDir = path.join(__dirname, "data")
  const file = fileIdx >= 0 ? args[fileIdx + 1] : path.join(dataDir, "ecosystem-profiles.json")
  const seed = JSON.parse(fs.readFileSync(file, "utf8"))

  const prisma = new PrismaClient()
  let updated = 0, missing = 0
  try {
    for (const e of seed) {
      const existing = await prisma.ecosystemProject.findUnique({ where: { slug: e.slug } })
      if (!existing) {
        missing++
        console.warn(`! missing project "${e.slug}" — skipped (create it via /admin first)`)
        continue
      }
      const data = {}
      if (e.profileMd) data.profileEn = fs.readFileSync(path.join(dataDir, e.profileMd), "utf8")
      if (e.profileMdZh) data.profileZh = fs.readFileSync(path.join(dataDir, e.profileMdZh), "utf8")
      if (e.descriptionEn) data.descriptionEn = e.descriptionEn
      if (e.descriptionZh) data.descriptionZh = e.descriptionZh
      if (Array.isArray(e.contracts)) {
        data.contracts = {
          deleteMany: {},
          create: e.contracts.map((c, i) => ({
            label: c.label, alkaneId: c.alkaneId,
            noteEn: c.noteEn || "", noteZh: c.noteZh || "", sortOrder: i,
          })),
        }
      }
      if (!dryRun) await prisma.ecosystemProject.update({ where: { slug: e.slug }, data })
      updated++
      console.log(`~ profile ${e.slug}${e.contracts ? ` (+${e.contracts.length} contracts)` : ""}`)
    }
    console.log(`${dryRun ? "[dry-run] " : ""}done: ${updated} updated, ${missing} missing`)
    if (missing > 0) process.exitCode = 1
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
