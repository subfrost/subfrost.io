#!/usr/bin/env node
// ===========================================================================
// merge-entities.mjs — apply the entity dedup/relabel plan (entity_audit.json):
// for each duplicate group, repoint every FK from the merged copies onto the
// survivor (handling the EntityFileLink unique + the 1:1 Deserter/OylObligation),
// union addresses/tags/links into the survivor, then delete the merged copies.
// The survivor already carries the correct category/scope, so the merge also
// fixes the mislabels (e.g. Samuel Gosling OYL-employee → Samuel JJ Gosling
// SUBFROST-investor). Idempotent-ish: re-runs skip already-deleted merges.
//
//   DATABASE_URL=... node scripts/merge-entities.mjs --plan <entity_audit.json> [--report]
// ===========================================================================

const argv = process.argv.slice(2)
const REPORT = argv.includes("--report")
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const PLAN = arg("--plan")
if (!PLAN) { console.error("error: --plan <entity_audit.json> required"); process.exit(1) }

const { readFileSync } = await import("node:fs")
const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()
const plan = JSON.parse(readFileSync(PLAN, "utf8"))

async function mergeOne(survivorId, mergeId) {
  const survivor = await prisma.legalEntity.findUnique({ where: { id: survivorId } })
  const merged = await prisma.legalEntity.findUnique({ where: { id: mergeId } })
  if (!survivor) return { skip: `survivor ${survivorId} missing` }
  if (!merged) return { skip: `merged ${mergeId} already gone` }

  const links = await prisma.entityFileLink.count({ where: { entityId: mergeId } })
  if (REPORT) return { links, mergedName: merged.name, survivorName: survivor.name }

  // EntityFileLink: drop collisions (same file+role already on survivor), repoint rest
  const mergedLinks = await prisma.entityFileLink.findMany({ where: { entityId: mergeId } })
  for (const l of mergedLinks) {
    const clash = await prisma.entityFileLink.findFirst({ where: { entityId: survivorId, fileId: l.fileId, role: l.role } })
    if (clash) await prisma.entityFileLink.delete({ where: { id: l.id } })
    else await prisma.entityFileLink.update({ where: { id: l.id }, data: { entityId: survivorId } })
  }
  // optional / satellite FKs
  await prisma.envelope.updateMany({ where: { entityId: mergeId }, data: { entityId: survivorId } })
  await prisma.legalAgreement.updateMany({ where: { entityId: mergeId }, data: { entityId: survivorId } })
  for (const model of ["deserter", "oylObligation"]) {
    const has = await prisma[model].findFirst({ where: { entityId: survivorId } })
    if (!has) await prisma[model].updateMany({ where: { entityId: mergeId }, data: { entityId: survivorId } })
  }
  // union identity fields into the survivor where it's missing them
  const patch = {}
  const addrs = [...new Set([...(survivor.addresses || []), ...(merged.addresses || [])])]
  if (addrs.length !== (survivor.addresses || []).length) patch.addresses = addrs
  const tags = [...new Set([...(survivor.tags || []), ...(merged.tags || [])])]
  if (tags.length !== (survivor.tags || []).length) patch.tags = tags
  for (const f of ["shareholderId", "userId", "payeeId", "email"]) if (!survivor[f] && merged[f]) patch[f] = merged[f]
  if (Object.keys(patch).length) await prisma.legalEntity.update({ where: { id: survivorId }, data: patch })

  await prisma.legalEntity.delete({ where: { id: mergeId } })
  return { links: mergedLinks.length, mergedName: merged.name, survivorName: survivor.name, patched: Object.keys(patch) }
}

async function main() {
  console.log(`\n=== merge-entities ${REPORT ? "(REPORT)" : ""} ===\n`)
  let merged = 0, links = 0
  for (const g of plan.duplicates || []) {
    for (const mid of g.mergeIds) {
      const r = await mergeOne(g.survivorId, mid)
      if (r.skip) { console.log(`  · skip: ${r.skip}`); continue }
      console.log(`  ${REPORT ? "would merge" : "merged"} "${r.mergedName}" → "${r.survivorName}" (${r.links} links${r.patched?.length ? ", +"+r.patched.join("/") : ""})`)
      merged++; links += r.links
    }
  }
  console.log(`\n${REPORT ? "would merge" : "merged"}: ${merged} entities, repointed ~${links} file-links`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
