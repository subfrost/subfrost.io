#!/usr/bin/env node
// ===========================================================================
// seed-conversion-safes.mjs — record the remaining Z DAO → Subzero Research Inc
// conversion SAFEs that were classified "unexecuted" but which the founders are
// honoring (they convert real prior ZeroDAO investments and carry Token Rights,
// so they earn cap-table equity + FUEL like the executed conversions).
//
// Recorded as OUTSTANDING (so they count in the cap-table dilution + FUEL model)
// with a note that they're pending full execution. Find-or-creates the entity +
// shareholder and cross-links, matching seed-captable.mjs. Idempotent.
//
//   DATABASE_URL=... node scripts/seed-conversion-safes.mjs [--report]
// ===========================================================================

const REPORT = process.argv.includes("--report")
const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()

const CAP = 50_000_000
// name, kind, amount, discount, signedAt (nominal — unexecuted), note
const SAFES = [
  { name: "Samuel JJ Gosling", kind: "PERSON", amount: 16_000, disc: null, note: "Z DAO conversion SAFE (Samuel JJ Gosling) + Token Rights — pending full execution" },
  { name: "Loong Wang", kind: "PERSON", amount: 20_000, disc: 0.36, note: "Z DAO conversion SAFE + Token Rights — pending full execution" },
  { name: "Eleanora & Hyde", kind: "ORG", amount: 20_000, disc: 0.36, note: "Z DAO conversion SAFE + Token Rights — pending full execution" },
  { name: "Orng Labs", kind: "ORG", amount: 30_000, disc: 0.70, note: "Z DAO conversion SAFE + Token Rights — pending full execution" },
]
const SIGNED_AT = "2025-11-01" // nominal (unexecuted; same window as the other conversions)

async function ensureEntity(name, kind) {
  const f = await prisma.legalEntity.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })
  if (f) return f
  if (REPORT) return { id: "(new)", name, shareholderId: null }
  return prisma.legalEntity.create({ data: { name, kind, category: "FUNDED_INVESTOR", scope: "SUBFROST",
    notes: "Z DAO conversion investor (angel) — SAFE pending execution" } })
}
async function ensureShareholder(name, kind) {
  const f = await prisma.shareholder.findFirst({ where: { name } })
  if (f) return f
  if (REPORT) return { id: "(new)", name }
  return prisma.shareholder.create({ data: { name, type: kind === "ORG" ? "ENTITY" : "PERSON" } })
}

async function main() {
  console.log(`\n=== seed-conversion-safes ${REPORT ? "(REPORT)" : ""} ===\n`)
  let created = 0, skipped = 0
  for (const s of SAFES) {
    const ent = await ensureEntity(s.name, s.kind)
    const sh = await ensureShareholder(s.name, s.kind)
    if (!REPORT && ent.id !== "(new)" && sh.id !== "(new)" && !ent.shareholderId) {
      await prisma.legalEntity.update({ where: { id: ent.id }, data: { shareholderId: sh.id } })
    }
    const dup = REPORT ? null : await prisma.instrument.findFirst({
      where: { investorName: s.name, amountUsd: s.amount, valuationCap: CAP },
    })
    const pct = ((s.amount / CAP) * 100).toFixed(4)
    if (dup) { console.log(`  · ${s.name}  $${s.amount.toLocaleString()} — exists, skip`); skipped++; continue }
    console.log(`  + ${s.name}  $${s.amount.toLocaleString()} @ $50M${s.disc != null ? ` (${s.disc*100}% disc)` : ""}  → ${pct}%  [OUTSTANDING · pending]`)
    if (!REPORT) {
      await prisma.instrument.create({
        data: {
          type: "SAFE", status: "OUTSTANDING", investorName: s.name, investorEntity: s.name,
          shareholderId: sh.id, amountUsd: s.amount, signedAt: new Date(SIGNED_AT),
          safeKind: "POST_MONEY", valuationCap: CAP, discountRate: s.disc ?? null, notes: s.note,
        },
      })
    }
    created++
  }
  const total = SAFES.reduce((a, s) => a + s.amount, 0)
  console.log(`\ninstruments ${REPORT ? "would-create" : "created"}: ${created}  skipped: ${skipped}`)
  console.log(`added conversion capital: $${total.toLocaleString()} (${((total/CAP)*100).toFixed(4)}% additional dilution)`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
