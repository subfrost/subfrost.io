#!/usr/bin/env node
// ===========================================================================
// seed-captable.mjs — populate the SUBFROST / Subzero Research Inc cap table:
//   • Common Stock class (10,000,000 authorized)
//   • Raymond W Pulver IV as SOLE issued holder (7,000,000 shares) — as-issued
//     basis: Gabe & Sean's intended 70/25/5 was never legally issued (that split
//     lives on the FUEL side, not the equity ledger).
//   • One SAFE per executed SubZero investor, honoring the prior ZeroDAO raise.
//     Two-tranche Magnus successors => two Instrument rows (A @ $50M, B @ $25M)
//     so the post-money cap math stays exact.
//
// Every investor is find-or-created as a LegalEntity (FUNDED_INVESTOR) and a
// Shareholder, cross-linked via LegalEntity.shareholderId + Instrument.shareholderId,
// so each SAFE attributes to its entity dossier.
//
// Idempotent: re-runs skip a share class / holding / instrument that already
// matches. Safe to run repeatedly.
//
//   DATABASE_URL=... node scripts/seed-captable.mjs [--report]
// ===========================================================================

const REPORT = process.argv.includes("--report")
const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()

const CAP_A = 50_000_000 // Tranche A / single-tranche post-money cap
const CAP_B = 25_000_000 // Tranche B post-money cap

// investor rows. entity kind ORG|PERSON. tranches: [{amount, cap, label}].
// discount recorded for completeness (post-money cap binds ownership regardless).
const INVESTORS = [
  // ---- Magnus Capital successors — $900,000 total, 50% discount, POST_MONEY ----
  { name: "RANDOMTASK INC", kind: "ORG", disc: 0.50, signedAt: "2025-10-29",
    note: "Magnus Capital successor (Colin Currie-Sinclair); novates voided Z DAO deals",
    tranches: [ {amount: 104866.68, cap: CAP_A, label: "Tranche A"}, {amount: 115000, cap: CAP_B, label: "Tranche B"} ] },
  { name: "Matthijs van Driel", kind: "PERSON", disc: 0.50, signedAt: "2025-11-11",
    note: "ex-Magnus Capital member; novates voided Z DAO deals",
    tranches: [ {amount: 78333.33, cap: CAP_A, label: "Tranche A"}, {amount: 72380, cap: CAP_B, label: "Tranche B"} ] },
  { name: "Jorden Merricks", kind: "PERSON", disc: 0.50, signedAt: "2025-11-03",
    note: "successor to Austin Merricks (deceased), ex-Magnus Capital",
    tranches: [ {amount: 82500, cap: CAP_A, label: "Tranche A"}, {amount: 50000, cap: CAP_B, label: "Tranche B"} ] },
  { name: "Noel Mansour", kind: "PERSON", disc: 0.50, signedAt: "2025-10-30",
    note: "ex-Magnus Capital member; novates voided Z DAO deals",
    tranches: [ {amount: 78333.33, cap: CAP_A, label: "Tranche A"}, {amount: 47000, cap: CAP_B, label: "Tranche B"} ] },
  { name: "Jonathan Poots", kind: "PERSON", disc: 0.50, signedAt: "2025-10-29",
    note: "ex-Magnus Capital member; novates voided Z DAO deals",
    tranches: [ {amount: 78333.33, cap: CAP_A, label: "Tranche A"}, {amount: 31020, cap: CAP_B, label: "Tranche B"} ] },
  { name: "Joe Esfahani", kind: "PERSON", disc: 0.50, signedAt: "2025-11-03",
    note: "ex-Magnus Capital member; Tranche A $0, Tranche B only",
    tranches: [ {amount: 47000, cap: CAP_B, label: "Tranche B"} ] },
  { name: "Lil Voy", kind: "PERSON", disc: 0.50, signedAt: "2025-11-03",
    note: "ex-Magnus Capital member; tranche split DERIVED to close the $900k Magnus total (A per group-standard $78,333.33, remainder to B)",
    tranches: [ {amount: 78333.33, cap: CAP_A, label: "Tranche A"}, {amount: 36900, cap: CAP_B, label: "Tranche B"} ] },

  // ---- Headline Asia -> Maelstrom (Arthur) — $500,000, POST_MONEY ----
  { name: "Maelstrom Fund", kind: "ORG", disc: null, signedAt: "2025-11-01",
    note: "Arthur / ex-Headline Asia; honors prior ~$500k ZeroDAO investment. signedAt approximate.",
    tranches: [ {amount: 500000, cap: CAP_A, label: null} ] },

  // ---- Standalone Z DAO conversions — 36% discount ----
  { name: "Allen Day", kind: "PERSON", disc: 0.36, signedAt: "2025-11-01",
    note: "ex-Z DAO LLC (via POD BOX LLC Series 145) + advisor agreement",
    tranches: [ {amount: 30000, cap: CAP_A, label: null} ] },
  { name: "Stephen Corridan", kind: "PERSON", disc: 0.36, signedAt: "2025-11-01",
    note: "ex-Z DAO LLC conversion. amount ($20k) & signedAt from unsigned copy — confirm.",
    tranches: [ {amount: 20000, cap: CAP_A, label: null} ] },

  // ---- Standard SAFE — 24% discount ----
  { name: "Amie Veal", kind: "PERSON", disc: 0.24, signedAt: "2025-11-20",
    note: "standard $50M/24% SAFE incl. Token Rights",
    tranches: [ {amount: 1000, cap: CAP_A, label: null} ] },
]

const plan = []
function log(s) { plan.push(s); console.log(s) }

// find-or-create a LegalEntity by exact (case-insensitive) name
async function ensureEntity(name, kind) {
  const found = await prisma.legalEntity.findFirst({ where: { name: { equals: name, mode: "insensitive" } } })
  if (found) return { entity: found, created: false }
  if (REPORT) return { entity: { id: "(new)", name }, created: true }
  const entity = await prisma.legalEntity.create({
    data: { name, kind, category: "FUNDED_INVESTOR", scope: "SUBFROST" },
  })
  return { entity, created: true }
}

// find-or-create a Shareholder by exact name
async function ensureShareholder(name, holderType) {
  const found = await prisma.shareholder.findFirst({ where: { name } })
  if (found) return { sh: found, created: false }
  if (REPORT) return { sh: { id: "(new)", name }, created: true }
  const sh = await prisma.shareholder.create({ data: { name, type: holderType } })
  return { sh, created: true }
}

async function main() {
  log(`\n=== seed-captable ${REPORT ? "(REPORT — nothing written)" : ""} ===\n`)

  // 1) Common Stock class (10M authorized) — idempotent
  let common = await prisma.shareClass.findFirst({ where: { type: "COMMON" } })
  if (!common) {
    log("create ShareClass: Common Stock, 10,000,000 authorized, par 0.0001")
    if (!REPORT) common = await prisma.shareClass.create({
      data: { name: "Common Stock", type: "COMMON", authorizedShares: 10_000_000, parValue: 0.0001 },
    })
  } else log(`ShareClass exists: ${common.name} (${common.authorizedShares.toLocaleString()} auth)`)

  // 2) Raymond — sole issued holder, 7,000,000 common (as-issued basis)
  const { sh: ray, created: rayNew } = await ensureShareholder("Raymond W Pulver IV", "PERSON")
  log(`${rayNew ? "create" : "exists"} Shareholder: Raymond W Pulver IV`)
  // link his LegalEntity -> shareholder (use canonical legal-name entity)
  const rayEnt = await prisma.legalEntity.findFirst({ where: { name: { equals: "Raymond Wesley Pulver IV", mode: "insensitive" } } })
  if (rayEnt && !REPORT && ray.id !== "(new)") await prisma.legalEntity.update({ where: { id: rayEnt.id }, data: { shareholderId: ray.id } })
  if (!REPORT && common && ray.id) {
    const hasHolding = await prisma.shareHolding.findFirst({ where: { shareholderId: ray.id, shareClassId: common.id } })
    if (!hasHolding) {
      log("  issue 7,000,000 Common to Raymond (sole issued holder → 100% of issued)")
      await prisma.shareHolding.create({
        data: { shareholderId: ray.id, shareClassId: common.id, shares: 7_000_000,
          issuedAt: new Date("2025-01-20"), notes: "Founder allocation — sole properly-issued holder (as-issued basis)" },
      })
    } else log("  Raymond holding already present")
  } else log("  issue 7,000,000 Common to Raymond")

  // 3) SAFE investors
  let created = 0, skipped = 0
  for (const inv of INVESTORS) {
    const { entity, created: entNew } = await ensureEntity(inv.name, inv.kind)
    const { sh, created: shNew } = await ensureShareholder(inv.name, inv.kind === "ORG" ? "ENTITY" : "PERSON")
    if (!REPORT && entity.id !== "(new)" && sh.id !== "(new)" && !entity.shareholderId) {
      await prisma.legalEntity.update({ where: { id: entity.id }, data: { shareholderId: sh.id } })
    }
    const total = inv.tranches.reduce((s, t) => s + t.amount, 0)
    log(`\n${inv.name}  [entity ${entNew ? "CREATED" : "exists"} · shareholder ${shNew ? "CREATED" : "exists"}]  $${total.toLocaleString()}`)
    for (const t of inv.tranches) {
      const label = t.label ? ` ${t.label}` : ""
      const notes = `${inv.note}${t.label ? ` — ${t.label} @ $${(t.cap/1e6)}M cap` : ""}`
      // idempotency: same investor + amount + cap + signedAt
      const dup = REPORT ? null : await prisma.instrument.findFirst({
        where: { investorName: inv.name, amountUsd: t.amount, valuationCap: t.cap, signedAt: new Date(inv.signedAt) },
      })
      if (dup) { log(`  · SAFE${label} $${t.amount.toLocaleString()} @ $${(t.cap/1e6)}M — exists, skip`); skipped++; continue }
      log(`  + SAFE${label} $${t.amount.toLocaleString()} @ $${(t.cap/1e6)}M cap${inv.disc != null ? ` (${inv.disc*100}% disc)` : ""}  → ${((t.amount/t.cap)*100).toFixed(4)}%`)
      if (!REPORT) {
        await prisma.instrument.create({
          data: {
            type: "SAFE", status: "OUTSTANDING", investorName: inv.name,
            investorEntity: inv.name, shareholderId: sh.id === "(new)" ? null : sh.id,
            amountUsd: t.amount, signedAt: new Date(inv.signedAt),
            safeKind: "POST_MONEY", valuationCap: t.cap, discountRate: inv.disc ?? null,
            notes,
          },
        })
      }
      created++
    }
  }

  // 4) summary
  const totalRaised = INVESTORS.reduce((s, i) => s + i.tranches.reduce((a, t) => a + t.amount, 0), 0)
  const dilution = INVESTORS.reduce((s, i) => s + i.tranches.reduce((a, t) => a + t.amount / t.cap, 0), 0)
  log(`\n=== summary ===`)
  log(`instruments ${REPORT ? "would-create" : "created"}: ${created}   skipped(existing): ${skipped}`)
  log(`total honored: $${totalRaised.toLocaleString()}   implied SAFE dilution: ${(dilution*100).toFixed(4)}%   Raymond retains: ${(100 - dilution*100).toFixed(4)}%`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
