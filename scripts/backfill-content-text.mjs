#!/usr/bin/env node
// backfill-content-text.mjs — populate DriveFile.contentText (searchable body)
// for every ingested doc, so search can match inside documents. Uses the
// id↔local-path manifest and scripts/extract-text.sh. Idempotent; capped.
//
// USAGE
//   DATABASE_URL=... node scripts/backfill-content-text.mjs [--manifest /tmp/classify-manifest.jsonl] [--limit N] [--only-missing]

import { readFileSync, existsSync } from "node:fs"
import { execFileSync } from "node:child_process"
import { dirname, join } from "node:path"
import { fileURLToPath } from "node:url"

const __dirname = dirname(fileURLToPath(import.meta.url))
const EXTRACT = join(__dirname, "extract-text.sh")
const CAP = 50000

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const MANIFEST = arg("--manifest", "/tmp/classify-manifest.jsonl")
const LIMIT = arg("--limit") ? parseInt(arg("--limit"), 10) : Infinity
const ONLY_MISSING = argv.includes("--only-missing")

const rows = readFileSync(MANIFEST, "utf8").trim().split("\n").map((l) => JSON.parse(l))
console.log(`manifest: ${rows.length} files; extracting up to ${CAP} chars each…`)

const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()

let done = 0, empty = 0, skipped = 0, missing = 0
for (const r of rows) {
  if (done >= LIMIT) break
  if (ONLY_MISSING) {
    const cur = await prisma.driveFile.findUnique({ where: { id: r.id }, select: { contentText: true } })
    if (cur?.contentText) { skipped++; continue }
  }
  if (!existsSync(r.abs)) { missing++; continue }
  let text = ""
  try {
    text = execFileSync("bash", [EXTRACT, r.abs, String(CAP)], { maxBuffer: 4 * 1024 * 1024 }).toString()
  } catch { text = "" }
  text = text.replace(/\s+/g, " ").trim().slice(0, CAP)
  if (!text || text.startsWith("(no text extractor") || text.startsWith("(missing file")) { empty++; text = "" }
  await prisma.driveFile.update({ where: { id: r.id }, data: { contentText: text || null } })
  done++
  if (done % 100 === 0) console.log(`  …${done} updated`)
}
console.log(`\ndone. updated=${done} emptyText=${empty} skipped(hasText)=${skipped} missingFile=${missing}`)
await prisma.$disconnect()
