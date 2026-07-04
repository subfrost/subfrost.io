// scripts/seed-ecosystem.cjs
/**
 * Seeds/updates the ecosystem directory. Idempotent upsert by slug.
 * SAFE re-runs: existing rows only get descriptionZh backfilled when empty;
 * published/featured/sortOrder/logoUrl and team-edited text are never clobbered.
 *
 * Usage (local):  node scripts/seed-ecosystem.cjs --dry-run
 * Usage (in-pod): node /tmp/seed-ecosystem.cjs --file /tmp/ecosystem-seed.json
 */
const { PrismaClient } = require("@prisma/client")
const fs = require("node:fs")
const path = require("node:path")

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const fileIdx = args.indexOf("--file")
  const file = fileIdx >= 0 ? args[fileIdx + 1] : path.join(__dirname, "data", "ecosystem-seed.json")
  const seed = JSON.parse(fs.readFileSync(file, "utf8"))

  const prisma = new PrismaClient()
  let created = 0, updated = 0, skipped = 0
  try {
    for (const p of seed) {
      const existing = await prisma.ecosystemProject.findUnique({ where: { slug: p.slug } })
      if (!existing) {
        if (!dryRun) await prisma.ecosystemProject.create({ data: p })
        created++
        console.log(`+ create ${p.slug}`)
      } else if (!existing.descriptionZh && p.descriptionZh) {
        if (!dryRun) await prisma.ecosystemProject.update({ where: { slug: p.slug }, data: { descriptionZh: p.descriptionZh } })
        updated++
        console.log(`~ backfill zh ${p.slug}`)
      } else {
        skipped++
      }
    }
    console.log(`${dryRun ? "[dry-run] " : ""}done: ${created} created, ${updated} zh-backfilled, ${skipped} untouched`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
