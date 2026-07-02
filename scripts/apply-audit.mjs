#!/usr/bin/env node
// apply-audit.mjs — apply the corrections from the audit agent pass
// (/tmp/audit-out) to prod: fix docType / docStatus / summary and, when the
// audit supplies a corrected link set, replace that file's content links.
// Only touches files the audit marked action:"fix". Idempotent. --report previews.
//
// USAGE  DATABASE_URL=... node scripts/apply-audit.mjs [--dir /tmp/audit-out] [--report]

import { readdirSync, readFileSync } from "node:fs"
import { join } from "node:path"

const TYPE_SLUGS = new Set([
  "certificate_incorporation","charter_amendment","bylaws","certificate_secretary","corporate_policy","formation_filing",
  "board_consent","stockholder_consent","director_action",
  "equity_incentive_plan","restricted_stock","stock_option","advisor_agreement","employment_agreement","indemnification_agreement","cap_table",
  "safe","safe_side_letter","token_warrant","token_rights","warrant","subscription_agreement",
  "valuation_409a","valuation_data","tax_form","tax_filing","invoice","payment_receipt","banking",
  "nda","compliance_kyc","identity_verification","report_memo","correspondence","template","media_asset","other",
])
const STATUS_SLUGS = new Set(["executed","partially_executed","unsigned","draft","template","void","na"])
const ROLES = new Set(["SIGNATORY","COUNTERPARTY","SUBJECT","MENTIONED"])

const argv = process.argv.slice(2)
const arg = (k, d) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : d }
const REPORT = argv.includes("--report")
const DIR = arg("--dir", "/tmp/audit-out")

const fixes = new Map() // id -> {docType?, docStatus?, summary?, links?}
for (const f of readdirSync(DIR).filter((f) => f.startsWith("batch-") && f.endsWith(".json")).sort()) {
  let arr; try { arr = JSON.parse(readFileSync(join(DIR, f), "utf8")) } catch { continue }
  if (!Array.isArray(arr)) continue
  for (const r of arr) {
    if (!r || r.action !== "fix" || typeof r.id !== "string") continue
    const fix = fixes.get(r.id) || {}
    if (TYPE_SLUGS.has(r.docType)) fix.docType = r.docType
    if (STATUS_SLUGS.has(r.docStatus)) fix.docStatus = r.docStatus
    if (typeof r.summary === "string" && r.summary.trim()) fix.summary = r.summary.slice(0, 240)
    if (Array.isArray(r.links)) fix.links = r.links.filter((l) => l && typeof l.entityId === "string" && ROLES.has(l.role))
    fixes.set(r.id, fix)
  }
}
console.log(`audit fixes: ${fixes.size} files`)
const counts = { docType: 0, docStatus: 0, summary: 0, links: 0 }
for (const v of fixes.values()) for (const k of Object.keys(counts)) if (v[k] !== undefined) counts[k]++
console.log("  changing:", counts)

if (REPORT) { console.log("\n(report mode — nothing written)"); process.exit(0) }

const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()
const entScope = new Map((await prisma.legalEntity.findMany({ select: { id: true, scope: true } })).map((e) => [e.id, e.scope]))
const now = new Date().toISOString()
let updated = 0, relinked = 0, notFound = 0

for (const [id, fix] of fixes) {
  const file = await prisma.driveFile.findUnique({ where: { id }, select: { scope: true, docType: true, docStatus: true, metadata: true } })
  if (!file) { notFound++; continue }
  const data = {}
  if (fix.docType) data.docType = fix.docType
  if (fix.docStatus) data.docStatus = fix.docStatus
  if (fix.docType || fix.docStatus || fix.summary) {
    const meta = (file.metadata && typeof file.metadata === "object") ? { ...file.metadata } : {}
    const cls = (meta.classification && typeof meta.classification === "object") ? { ...meta.classification } : {}
    if (fix.docType) cls.type = fix.docType
    if (fix.docStatus) cls.status = fix.docStatus
    if (fix.summary) cls.summary = fix.summary
    cls.auditedAt = now
    meta.classification = cls
    data.metadata = meta
  }
  if (Object.keys(data).length) { await prisma.driveFile.update({ where: { id }, data }); updated++ }

  if (fix.links) {
    // validate scope, then replace this file's content/auto links with the corrected set
    const valid = fix.links.filter((l) => entScope.get(l.entityId) === file.scope)
    await prisma.entityFileLink.deleteMany({ where: { fileId: id, OR: [{ annotation: { startsWith: "auto:" } }, { annotation: { startsWith: "content:" } }] } })
    for (const l of valid) {
      await prisma.entityFileLink.upsert({
        where: { fileId_entityId_role: { fileId: id, entityId: l.entityId, role: l.role } },
        update: { annotation: "content: audit-corrected" },
        create: { fileId: id, entityId: l.entityId, role: l.role, annotation: "content: audit-corrected" },
      })
    }
    relinked++
  }
}
console.log(`\ndone. updated=${updated} relinkedFiles=${relinked} notFound=${notFound}`)
await prisma.$disconnect()
