#!/usr/bin/env node
// rebuild-entity-links.mjs — replace the noisy path-token EntityFileLink graph
// with precise, content-derived links (produced by the relink agent pass in
// /tmp/relink-out). Validates every link against the registry (entity exists,
// role valid, entity scope == file scope), drops the old auto-links, and inserts
// the new ones. Manual links (annotation not starting with "auto:"/"content:")
// are preserved.
//
// USAGE
//   DATABASE_URL=... node scripts/rebuild-entity-links.mjs [--dir /tmp/relink-out] [--report]

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const ROLES = new Set(["SIGNATORY", "COUNTERPARTY", "SUBJECT", "MENTIONED"])
const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const REPORT = argv.includes("--report")
const DIR = arg("--dir", "/tmp/relink-out")

const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()

// registry: id -> scope
const ents = await prisma.legalEntity.findMany({ select: { id: true, scope: true } })
const entScope = new Map(ents.map((e) => [e.id, e.scope]))
// files: id -> scope
const files = await prisma.driveFile.findMany({ select: { id: true, scope: true } })
const fileScope = new Map(files.map((f) => [f.id, f.scope]))

// --- load proposed links ---------------------------------------------------
const batchFiles = readdirSync(DIR).filter((f) => f.startsWith("batch-") && f.endsWith(".json")).sort()
if (!batchFiles.length) { console.error(`no batch-*.json in ${DIR}`); process.exit(1) }

const proposed = new Map() // fileId -> Set("entityId|role")
let raw = 0, badId = 0, badRole = 0, scopeMismatch = 0, unknownEntity = 0, unknownFile = 0
for (const bf of batchFiles) {
  let arr
  try { arr = JSON.parse(readFileSync(join(DIR, bf), "utf8")) } catch (e) { console.error(`  ! ${bf}: ${e.message}`); continue }
  if (!Array.isArray(arr)) continue
  for (const row of arr) {
    if (!row || typeof row.id !== "string") continue
    if (!fileScope.has(row.id)) { unknownFile++; continue }
    const fscope = fileScope.get(row.id)
    for (const l of row.links || []) {
      raw++
      if (!l || typeof l.entityId !== "string") { badId++; continue }
      if (!ROLES.has(l.role)) { badRole++; continue }
      if (!entScope.has(l.entityId)) { unknownEntity++; continue }
      if (entScope.get(l.entityId) !== fscope) { scopeMismatch++; continue } // cross-scope link → drop
      if (!proposed.has(row.id)) proposed.set(row.id, new Set())
      proposed.get(row.id).add(`${l.entityId}|${l.role}`)
    }
  }
}
const validLinks = [...proposed.values()].reduce((a, s) => a + s.size, 0)
const filesWithLinks = proposed.size
console.log(`proposed: ${raw} raw links → ${validLinks} valid across ${filesWithLinks} files`)
console.log(`  dropped: badId=${badId} badRole=${badRole} unknownEntity=${unknownEntity} unknownFile=${unknownFile} scopeMismatch=${scopeMismatch}`)

// role distribution
const roleCount = {}
for (const s of proposed.values()) for (const k of s) { const r = k.split("|")[1]; roleCount[r] = (roleCount[r] || 0) + 1 }
console.log("  by role:", roleCount)

if (REPORT) { console.log("\n(report mode — nothing written)"); await prisma.$disconnect(); process.exit(0) }

// --- apply: drop old auto/content links, insert the new content links ------
const del = await prisma.entityFileLink.deleteMany({ where: { OR: [{ annotation: { startsWith: "auto:" } }, { annotation: { startsWith: "content:" } }] } })
console.log(`\ndeleted ${del.count} old auto/content links (manual links preserved)`)

let inserted = 0
for (const [fileId, set] of proposed) {
  for (const key of set) {
    const [entityId, role] = key.split("|")
    await prisma.entityFileLink.upsert({
      where: { fileId_entityId_role: { fileId, entityId, role } },
      update: { annotation: "content: rebuilt from document" },
      create: { fileId, entityId, role, annotation: "content: rebuilt from document" },
    })
    inserted++
  }
  if (inserted % 100 === 0) console.log(`  …${inserted} links`)
}
const total = await prisma.entityFileLink.count()
console.log(`\ndone. inserted=${inserted}  total links now=${total}`)
await prisma.$disconnect()
