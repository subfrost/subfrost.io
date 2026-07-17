#!/usr/bin/env node
// ===========================================================================
// materialize-entity-links.mjs — turn the content-derived
// `DriveFile.metadata.suggestedEntities` (produced by the ingest matcher +
// classifier-agent) into concrete `EntityFileLink` rows, so every entity's
// Documents tab shows the docs that name it.
//
// Unlike `ingest-drive.mjs --relink` (which re-matches on the file *path*),
// this reads the per-file `suggestedEntities` names from metadata (which the
// classifier derived from document *content*) and links them.
//
// USAGE
//   DATABASE_URL=... node scripts/materialize-entity-links.mjs --report   # dry-run
//   DATABASE_URL=... node scripts/materialize-entity-links.mjs            # write
//
// FLAGS
//   --report        resolve + count, write nothing
//   --limit N       cap files processed (smoke test)
//
// Idempotent: upserts on (fileId, entityId, role); re-runs are safe.
// ===========================================================================

const argv = process.argv.slice(2)
const has = (k) => argv.includes(k)
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const REPORT = has("--report")
const LIMIT = arg("--limit") ? parseInt(arg("--limit"), 10) : Infinity

// classification.type → default link role. Party/self-signed docs => SIGNATORY;
// invoices/payments => COUNTERPARTY; about-them => SUBJECT; named-only => MENTIONED.
const ROLE_BY_TYPE = {
  safe: "SIGNATORY", safe_side_letter: "SIGNATORY", token_warrant: "SIGNATORY",
  token_rights: "SIGNATORY", warrant: "SIGNATORY", subscription_agreement: "SIGNATORY",
  advisor_agreement: "SIGNATORY", employment_agreement: "SIGNATORY",
  indemnification_agreement: "SIGNATORY", restricted_stock: "SIGNATORY", stock_option: "SIGNATORY",
  board_consent: "SIGNATORY", stockholder_consent: "SIGNATORY", director_action: "SIGNATORY",
  nda: "SIGNATORY", tax_form: "SIGNATORY", identity_verification: "SIGNATORY",
  compliance_kyc: "SIGNATORY",
  invoice: "COUNTERPARTY", payment_receipt: "COUNTERPARTY", banking: "COUNTERPARTY",
  cap_table: "SUBJECT", valuation_409a: "SUBJECT", valuation_data: "SUBJECT",
  equity_incentive_plan: "SUBJECT", tax_filing: "SUBJECT",
  report_memo: "MENTIONED", correspondence: "MENTIONED", template: "MENTIONED",
  media_asset: "MENTIONED", other: "MENTIONED",
}
function roleFor(meta) {
  const t = meta?.classification?.type
  return (t && ROLE_BY_TYPE[t]) || "SUBJECT"
}

const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()

// name → entity, case-insensitive exact (the suggested names came from the
// registry, so exact match is the safe resolution).
const entities = await prisma.legalEntity.findMany({ select: { id: true, name: true, category: true } })
const byName = new Map()
for (const e of entities) byName.set(e.name.trim().toLowerCase(), e)

// Role = doc-type default, EXCEPT service providers (COUNTERPARTY category, e.g.
// law firms / CPAs / auditors) link as COUNTERPARTY rather than SIGNATORY.
function roleForEntity(meta, ent) {
  if (ent.category === "COUNTERPARTY") return "COUNTERPARTY"
  return roleFor(meta)
}

const allFiles = await prisma.driveFile.findMany({ select: { id: true, name: true, metadata: true } })
const files = allFiles.filter((f) => Array.isArray(f.metadata?.suggestedEntities) && f.metadata.suggestedEntities.length)

let processed = 0, created = 0, existed = 0, unresolved = 0
const unresolvedNames = new Map()

for (const f of files) {
  if (processed >= LIMIT) break
  const meta = f.metadata || {}
  const names = Array.isArray(meta.suggestedEntities) ? meta.suggestedEntities : []
  if (!names.length) continue
  processed++
  for (const raw of names) {
    const ent = byName.get(String(raw).trim().toLowerCase())
    if (!ent) { unresolved++; unresolvedNames.set(raw, (unresolvedNames.get(raw) || 0) + 1); continue }
    const role = roleForEntity(meta, ent)
    if (REPORT) {
      const exists = await prisma.entityFileLink.findUnique({
        where: { fileId_entityId_role: { fileId: f.id, entityId: ent.id, role } }, select: { id: true },
      })
      exists ? existed++ : created++
      continue
    }
    const before = await prisma.entityFileLink.findUnique({
      where: { fileId_entityId_role: { fileId: f.id, entityId: ent.id, role } }, select: { id: true },
    })
    if (before) { existed++; continue }
    await prisma.entityFileLink.create({
      data: { fileId: f.id, entityId: ent.id, role, annotation: `auto: materialized "${raw}"` },
    })
    created++
  }
}

console.log(`\n=== materialize-entity-links ${REPORT ? "(REPORT — nothing written)" : ""} ===`)
console.log(`files with suggestedEntities: ${files.length}  processed: ${processed}`)
console.log(`links ${REPORT ? "would-create" : "created"}: ${created}   already-existed: ${existed}`)
console.log(`unresolved name mentions: ${unresolved} (distinct: ${unresolvedNames.size})`)
if (unresolvedNames.size) {
  const top = [...unresolvedNames.entries()].sort((a, b) => b[1] - a[1]).slice(0, 25)
  console.log("top unresolved names (candidates to add to the registry):")
  for (const [n, c] of top) console.log(`  ${c}×  ${n}`)
}
await prisma.$disconnect()
