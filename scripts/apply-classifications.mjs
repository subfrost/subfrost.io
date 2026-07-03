#!/usr/bin/env node
// apply-classifications.mjs — write the document-type classifications produced by
// the classify-drive-docs workflow (scripts/classify-workflow, per-batch JSON in
// /tmp/classify-out) back onto the DriveFile rows: docType, docStatus, a one-line
// summary in metadata.classification, and merged semantic tags.
//
// USAGE
//   DATABASE_URL=... node scripts/apply-classifications.mjs [--dir /tmp/classify-out] [--report]
//
// Idempotent: re-running overwrites docType/docStatus/summary and re-merges tags.
// --report validates the input and prints the tally without touching the DB.

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

// Keep in sync with lib/files/doc-types.ts
const TYPE_SLUGS = new Set([
  "certificate_incorporation","charter_amendment","bylaws","certificate_secretary","corporate_policy","formation_filing",
  "board_consent","stockholder_consent","director_action",
  "equity_incentive_plan","restricted_stock","stock_option","advisor_agreement","employment_agreement","indemnification_agreement","cap_table",
  "safe","safe_side_letter","token_warrant","token_rights","warrant","subscription_agreement",
  "valuation_409a","valuation_data","tax_form","tax_filing","invoice","payment_receipt","banking",
  "nda","compliance_kyc","identity_verification","report_memo","correspondence","template","media_asset","other",
])
const STATUS_SLUGS = new Set(["executed","partially_executed","unsigned","draft","template","void","na"])

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const REPORT = argv.includes("--report")
const DIR = arg("--dir", "/tmp/classify-out")

// --- load + dedupe all batch files -----------------------------------------
// Sort so any batch-rerun-*.json (a correction pass) sorts AFTER batch-<n>.json
// and therefore wins in the "later batch overwrites" merge below.
const files = readdirSync(DIR).filter((f) => f.startsWith("batch-") && f.endsWith(".json")).sort()
if (!files.length) { console.error(`no batch-*.json in ${DIR}`); process.exit(1) }

const byId = new Map()
let parsedRows = 0, badRows = 0, coerced = 0
for (const f of files) {
  let arr
  try { arr = JSON.parse(readFileSync(join(DIR, f), "utf8")) } catch (e) { console.error(`  ! ${f}: bad JSON (${e.message})`); continue }
  if (!Array.isArray(arr)) { console.error(`  ! ${f}: not an array`); continue }
  for (const r of arr) {
    if (!r || typeof r.id !== "string") { badRows++; continue }
    let type = r.type, status = r.status
    if (!TYPE_SLUGS.has(type)) { type = "other"; coerced++ }
    if (!STATUS_SLUGS.has(status)) { status = "na"; coerced++ }
    const tags = Array.isArray(r.tags) ? r.tags.map((t) => String(t).toLowerCase().trim().replace(/\s+/g, "-")).filter(Boolean) : []
    const summary = typeof r.summary === "string" ? r.summary.slice(0, 240) : ""
    byId.set(r.id, { id: r.id, type, status, summary, tags }) // later batch wins on dup
    parsedRows++
  }
}

const rows = [...byId.values()]
const tally = {}
for (const r of rows) tally[r.type] = (tally[r.type] || 0) + 1
console.log(`loaded ${files.length} batch files → ${rows.length} unique files (${parsedRows} rows, ${badRows} bad, ${coerced} coerced to other/na)`)
console.log("by type:", Object.fromEntries(Object.entries(tally).sort((a, b) => b[1] - a[1])))

if (REPORT) { console.log("\n(report mode — nothing written)"); process.exit(0) }

// --- write back ------------------------------------------------------------
const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()
const now = new Date().toISOString()
let updated = 0, notFound = 0
for (const r of rows) {
  const existing = await prisma.driveFile.findUnique({ where: { id: r.id }, select: { tags: true, metadata: true } })
  if (!existing) { notFound++; continue }
  const merged = [...new Set([...(existing.tags || []), ...r.tags])]
  const metadata = { ...(existing.metadata && typeof existing.metadata === "object" ? existing.metadata : {}),
    classification: { type: r.type, status: r.status, summary: r.summary, by: "classifier-agent", at: now } }
  await prisma.driveFile.update({
    where: { id: r.id },
    data: { docType: r.type, docStatus: r.status, tags: merged, metadata },
  })
  updated++
  if (updated % 100 === 0) console.log(`  …${updated} updated`)
}
console.log(`\ndone. updated=${updated} notFound=${notFound}`)
await prisma.$disconnect()
