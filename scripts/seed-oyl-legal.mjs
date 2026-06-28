// Seeds the legal register (LegalEntity + satellites + agreements) from the
// corrected OYL/Subfrost corpus. Idempotent: keyed on (name, category), it
// updates in place on re-run rather than duplicating. Run against a real DB:
//
//   DATABASE_URL=postgres://… node scripts/seed-oyl-legal.mjs
//
// Source of truth for the funded-investor DIESEL figures: oyl-dump/make_diesel_doc.py
// (the "(corrected)" obligations doc — 26 funded investors, 36,447 DIESEL total).
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

// DIESEL = (purchase ÷ cap) × 0.5 × 440,000  ⇒  purchase = diesel / 220,000 × cap
const PREMINE = 440_000, FACTOR = 0.5
const purchaseFromDiesel = (diesel, cap) => Math.round((diesel / (FACTOR * PREMINE)) * cap)
const VEST = "Launched block 880,000 (~Jan 20 2025); 25% cliff Jan 20 2026, monthly to Jan 20 2027."

// ---- bucket 1: 26 funded OYL investors (honored DIESEL obligations) ----------
const CAP20 = 20_000_000, CAP60 = 60_000_000
const FUNDED = [
  ["Arca", "ORG", 11000, 5500, CAP20, "2023-09-11"],
  ["Foresight Research", "ORG", 5500, 2750, CAP20, "2023-09-20"],
  ["Web3.com Ventures", "ORG", 2750, 1375, CAP20, "2023-12-09"],
  ["Bitcoin Magazine Fund", "ORG", 2750, 1375, CAP20, null],
  ["Arca Endeavor Fund", "ORG", 2200, 1100, CAP60, "2024-06-01"],
  ["Ethos Venture Fund", "ORG", 1540, 770, CAP20, null],
  ["Flamingo DAO", "ORG", 1100, 550, CAP20, "2023-09-19"],
  ["AVID3", "ORG", 1100, 550, CAP20, "2023-12-01"],
  ["Headline Asia", "ORG", 1100, 550, CAP20, "2023-10-25"],
  ["Public Works", "ORG", 1100, 550, CAP20, "2023-12-05"],
  ["Bonfire Union", "ORG", 1100, 550, CAP20, null],
  ["Block Space Force", "ORG", 917, 458, CAP60, "2025-06-01"],
  ["Pulsar", "ORG", 550, 275, CAP20, "2023-12-11"],
  ["Antalpha", "ORG", 550, 275, CAP20, "2023-11-09"],
  ["KNSV (Kanosei)", "ORG", 550, 275, CAP20, "2023-12-28"],
  ["Borderless", "ORG", 550, 275, CAP20, null],
  ["Dominic Silk", "PERSON", 275, 137.5, CAP20, "2023-09-29"],
  ["Matthew Paik", "PERSON", 275, 137.5, CAP20, null],
  ["Gmoney / Gualberto", "PERSON", 275, 137.5, CAP20, null],
  ["Dan Greenberg", "PERSON", 275, 137.5, CAP20, null],
  ["John Paul Scianna", "PERSON", 275, 137.5, CAP20, null],
  ["Waikit Lau", "PERSON", 275, 137.5, CAP20, null],
  ["Eric Chung", "PERSON", 110, 55, CAP20, null],
  ["Nick Hansen", "PERSON", 110, 55, CAP20, null],
  ["Soban Saqib", "PERSON", 110, 55, CAP20, null],
  ["Bitcoin Startup Lab", "ORG", 110, 55, CAP20, null],
]

// ---- bucket 2: signed-but-unfunded SAFEs treated as void ---------------------
const VOID = [
  ["UTXO Management", "ORG"], ["Maelstrom (OYL)", "ORG"], ["Mask", "ORG"],
  ["Illuminating Alpha", "ORG"], ["Udi Wertheimer", "PERSON"], ["Domo", "PERSON"],
  ["Timshel", "PERSON"], ["Matt (LayerZero)", "PERSON"], ["Munam Wasi", "PERSON"],
  ["nxGen XYZ", "ORG"],
]

// ---- bucket 3: OYL internal team allocations = the "deserters" ----------------
// [name, oylRole, oylTokenPct, desertedVest]
const DESERTERS = [
  ["Kevin Yao", "Engineer (CryptoLogic LLC)", 17, "UNDECIDED"],
  ["Timilehin Adetayo (Dee)", "Engineer", 5, "UNDECIDED"],
  ["Eric Butz", "Engineer (Butz Tech LLC)", null, "UNDECIDED"],
  ["Jonathan Navarrette", "Engineer (Guava Labs)", null, "UNDECIDED"],
  ["Zachary Miller", "Engineer (M3 Electronic Labs)", null, "UNDECIDED"],
  ["Drorjen", "Engineer (Drorjen LLC)", null, "UNDECIDED"],
  ["Mariam Morris", "Finance / ops", null, "UNDECIDED"],
]

// ---- bucket 4: Subfrost legal counterparties (scope SUBFROST) -----------------
// [name, kind, agreementType, agreementTitle, status]
const COUNTERPARTIES = [
  ["Halborn Inc.", "ORG", "NDA", "Mutual NDA (security audit)", "SIGNED"],
  ["Codespect", "ORG", "NDA", "NDA (security audit)", "SIGNED"],
  ["SPRF LLP (Peter Scoolidge)", "ORG", "ADVISOR", "Securities counsel + advisor", "SIGNED"],
  ["Wiggin and Dana (Elliot Kaiman)", "ORG", "OTHER", "Corporate counsel engagement", "SIGNED"],
  ["Area21 Labs LLC", "ORG", "CONTRACTOR", "Software Developer Agreement ($5k/mo DIESEL)", "DRAFT"],
  ["BiS", "ORG", "INTEGRATION", "SUBFROST Protocol Integration Agreement", "SIGNED"],
  ["Rockport Investment Partners", "ORG", "OTHER", "409A valuation engagement letter", "DRAFT"],
  ["Pizza.Fun (Jorge Lara)", "ORG", "OTHER", "DOUGH token SAFT ($10k / 3,333,333 DOUGH)", "SIGNED"],
]

// ---- bucket 5: our own employees (scope SUBFROST) ----------------------------
// [name, kind, email]
const EMPLOYEES = [
  ["Raymond Pulver IV (Ray)", "PERSON", "rwp@subfrost.io"],
  ["Sean Pulver", "PERSON", "sean@subzeroresearch.com"],
  ["Gabe Lee", "PERSON", "gabe@subfrost.io"],
  ["Erick Delgado (casuwu)", "PERSON", "ed995499@gmail.com"],
  ["Misha Sychoff", "PERSON", "misha.sychoff@gmail.com"],
  ["Hex (Steady State Growth Ltd)", "PERSON", "hexfracture@gmail.com"],
]

async function ensureEntity({ name, kind, category, scope, email = null }) {
  const existing = await prisma.legalEntity.findFirst({ where: { name, category } })
  if (existing) {
    return prisma.legalEntity.update({ where: { id: existing.id }, data: { kind, scope, email: email ?? existing.email } })
  }
  return prisma.legalEntity.create({ data: { name, kind, category, scope, email } })
}

async function ensureAgreement(entityId, scope, { type, title, status }) {
  const existing = await prisma.legalAgreement.findFirst({ where: { entityId, title } })
  if (existing) return existing
  return prisma.legalAgreement.create({ data: { entityId, scope, type, title, status } })
}

async function main() {
  let n = 0

  for (const [name, kind, diesel, claimable, cap, fundedAt] of FUNDED) {
    const e = await ensureEntity({ name, kind, category: "FUNDED_INVESTOR", scope: "OYL" })
    await prisma.oylObligation.upsert({
      where: { entityId: e.id },
      create: {
        entityId: e.id, funding: "FUNDED", purchaseUsd: purchaseFromDiesel(diesel, cap),
        valuationCap: cap, dieselOwed: diesel, dieselClaimable: claimable,
        fundedAt: fundedAt ? new Date(fundedAt) : null, vestingNote: VEST,
      },
      update: {
        funding: "FUNDED", purchaseUsd: purchaseFromDiesel(diesel, cap), valuationCap: cap,
        dieselOwed: diesel, dieselClaimable: claimable, vestingNote: VEST,
        fundedAt: fundedAt ? new Date(fundedAt) : null,
      },
    })
    n++
  }

  for (const [name, kind] of VOID) {
    const e = await ensureEntity({ name, kind, category: "VOID_NONFUNDER", scope: "OYL" })
    await prisma.oylObligation.upsert({
      where: { entityId: e.id },
      create: { entityId: e.id, funding: "UNFUNDED_VOID", dieselOwed: 0, dieselClaimable: 0, notes: "Signed SAFE but never funded — treated as void." },
      update: { funding: "UNFUNDED_VOID", dieselOwed: 0, dieselClaimable: 0 },
    })
    n++
  }

  for (const [name, role, pct, vest] of DESERTERS) {
    const e = await ensureEntity({ name, kind: "PERSON", category: "DESERTER", scope: "OYL" })
    await prisma.deserter.upsert({
      where: { entityId: e.id },
      create: { entityId: e.id, oylRole: role, oylTokenPct: pct, desertedVest: vest, swapStatus: "NOT_STARTED" },
      update: { oylRole: role, oylTokenPct: pct },
    })
    n++
  }

  for (const [name, kind, type, title, status] of COUNTERPARTIES) {
    const e = await ensureEntity({ name, kind, category: "COUNTERPARTY", scope: "SUBFROST" })
    await ensureAgreement(e.id, "SUBFROST", { type, title, status })
    n++
  }

  for (const [name, kind, email] of EMPLOYEES) {
    await ensureEntity({ name, kind, category: "EMPLOYEE", scope: "SUBFROST", email })
    n++
  }

  console.log(`Seeded/updated ${n} legal entities (` +
    `${FUNDED.length} funded · ${VOID.length} void · ${DESERTERS.length} deserters · ` +
    `${COUNTERPARTIES.length} counterparties · ${EMPLOYEES.length} employees).`)
}

main().catch((e) => { console.error(e); process.exit(1) }).finally(() => prisma.$disconnect())
