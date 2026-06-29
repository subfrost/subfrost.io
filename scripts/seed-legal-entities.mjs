#!/usr/bin/env node
// ===========================================================================
// seed-legal-entities.mjs — populate the Legal registry (LegalEntity rows) with
// the documented SUBFROST + OYL people/orgs that appear as signatories across
// the drive dumps. Seeding these BEFORE the drive ingest means the ingest's
// entity auto-matcher actually attaches files → entities (signatories,
// counterparties), instead of only recording suggestions.
//
// Sources: subfrost-dump/PEOPLE_FULL.md, oyl-dump/OYL_People_Roster.md, and the
// DLA Piper SAFE / Token-Rights folder names.
//
// USAGE
//   DATABASE_URL=... node scripts/seed-legal-entities.mjs            # apply
//   node scripts/seed-legal-entities.mjs --dry-run                   # preview (needs DB to dedupe; --report skips DB)
//   node scripts/seed-legal-entities.mjs --report                   # list only, no DB
//
// Idempotent: an entity already present at (name, scope) is left untouched.
// Categories: EMPLOYEE | FUNDED_INVESTOR | DESERTER | VOID_NONFUNDER | COUNTERPARTY
// Seeded conservatively — refine category/DESERTER status per person in /admin/legal.
// ===========================================================================

const argv = process.argv.slice(2)
const REPORT = argv.includes("--report")
const DRY = argv.includes("--dry-run") || REPORT

// [name, category, kind, email?]
const E = (name, category, kind = "PERSON", email = null) => ({ name, category, kind, email })
const ORG = (name, category, email = null) => E(name, category, "ORG", email)

const SUBFROST = [
  // founder / team / contractors
  E("Raymond Wesley Pulver IV", "EMPLOYEE", "PERSON", "rwp@subfrost.io"),
  E("Gabe Lee", "EMPLOYEE", "PERSON", "gabe@subfrost.io"),
  E("Sean Pulver", "EMPLOYEE", "PERSON", "sean@subzeroresearch.com"),
  E("Erick Delgado", "EMPLOYEE", "PERSON", "ed995499@gmail.com"),
  E("Misha Sychoff", "EMPLOYEE", "PERSON", "misha.sychoff@gmail.com"),
  E("Judo Flex", "EMPLOYEE"),
  E("Brooks", "FUNDED_INVESTOR"), // $200k backer + China liaison (also gets task-board IAM)
  // advisors
  E("Arthur Hayes", "EMPLOYEE", "PERSON", "cryptohayes@substack.com"),
  E("Peter Scoolidge", "COUNTERPARTY", "PERSON", "peter@sprfllp.com"), // advisor + securities counsel
  E("Andrew Magnus", "EMPLOYEE", "PERSON", "andrew@magnuscapital.com"),
  E("Hex", "EMPLOYEE", "PERSON", "hexfracture@gmail.com"),
  E("KJ", "EMPLOYEE"),
  // documented investors / backers
  ORG("Maelstrom Fund", "FUNDED_INVESTOR", "lukas@maelstrom.fund"),
  ORG("Lihou Capital Ltd", "FUNDED_INVESTOR"),
  ORG("Magnus Capital Pte. Ltd.", "FUNDED_INVESTOR"),
  E("Jonathan Poots", "FUNDED_INVESTOR", "PERSON", "jon@magnuscapital.com"),
  E("Ken Bassig", "FUNDED_INVESTOR", "PERSON", "ken@magnuscapital.com"),
  E("Noel Magnus", "FUNDED_INVESTOR"),
  ORG("Lemonswap Community", "FUNDED_INVESTOR"),
  E("Amie Veal", "FUNDED_INVESTOR"),
  // angel SAFE conversions (ex–Z DAO)
  E("Allen Day", "FUNDED_INVESTOR", "PERSON", "allenday@allenday.com"),
  E("Loong Wang", "FUNDED_INVESTOR"),
  ORG("Orng Labs", "FUNDED_INVESTOR"),
  E("Samuel JJ Gosling", "FUNDED_INVESTOR"),
  E("Stephen Corridan", "FUNDED_INVESTOR"),
  // counsel / auditors / integration / token counterparties
  E("Elliot Kaiman", "COUNTERPARTY", "PERSON", "ekaiman@wiggin.com"),
  ORG("Halborn Inc.", "COUNTERPARTY"),
  ORG("Codespect", "COUNTERPARTY"),
  E("Alexandre Trottier", "COUNTERPARTY"),
  ORG("BiS", "COUNTERPARTY"),
  E("Jorge Emiliano Lara Chavez", "COUNTERPARTY"), // Pizza.Fun / DOUGH SAFT
]

const OYL = [
  // founders & equity holders
  E("Alec Taggart", "EMPLOYEE", "PERSON", "alec@oyl.io"),
  E("Cole Jorissen", "EMPLOYEE", "PERSON", "c@oyl.io"),
  E("Ray Pulver", "EMPLOYEE", "PERSON", "rwp@oyl.io"), // technical co-founder (Alkanes)
  E("John Shi", "EMPLOYEE"),
  // core team / contractors
  E("Timilehin Adetayo", "EMPLOYEE", "PERSON", "dee@oyl.io"),
  E("Eric Butz", "EMPLOYEE", "PERSON", "eric@oyl.io"),
  E("Kevin Yao", "EMPLOYEE", "PERSON", "kevin@oyl.io"),
  E("Jonathan Navarrete", "EMPLOYEE", "PERSON", "jonatns@oyl.io"),
  E("Zachary Miller", "EMPLOYEE", "PERSON", "zachary@oyl.io"),
  E("Mark N", "EMPLOYEE", "PERSON", "mark@oyl.io"),
  E("Mariam Morris", "EMPLOYEE", "PERSON", "mariam@oyl.io"),
  E("Isabel Foxen Duke", "EMPLOYEE", "PERSON", "isabel@oyl.io"),
  E("Muharrem Senyil", "EMPLOYEE", "PERSON", "mo@oyl.io"),
  E("Roan McLean", "EMPLOYEE", "PERSON", "roan@oyl.io"),
  E("Taylor Rosenstein", "EMPLOYEE", "PERSON", "taylor@oyl.io"),
  E("Yaron Erkin", "EMPLOYEE", "PERSON", "yaron@oyl.io"),
  E("Tom Johnson III", "EMPLOYEE", "PERSON", "tom@oyl.io"),
  E("Jay Sheafson", "EMPLOYEE", "PERSON", "j@oyl.gg"),
  E("Drorjen", "EMPLOYEE", "PERSON", "drorjen@oyl.io"),
  E("Shawn Arney", "EMPLOYEE"),
  E("Andrew Hathaway", "EMPLOYEE"),
  E("Matthew Abrams", "EMPLOYEE"),
  E("Ellie-Jean Marguerite", "EMPLOYEE"),
  E("Hyke", "EMPLOYEE"),
  E("Angello Lazar", "EMPLOYEE"),
  E("Jiovan Bergen", "EMPLOYEE"),
  E("Christopher Darafeev", "EMPLOYEE"),
  E("Jerrod Jordan", "EMPLOYEE"),
  E("Samuel Gosling", "EMPLOYEE"),
  // contractor entities
  ORG("Butz Tech LLC", "COUNTERPARTY"),
  ORG("Guava Labs", "COUNTERPARTY"),
  ORG("M3 Electronic Labs", "COUNTERPARTY"),
  ORG("Drorjen LLC", "COUNTERPARTY"),
  ORG("Pubkey Group LLC", "COUNTERPARTY"), // Ray's entity; warrant holder
  ORG("Room 44 LLC", "COUNTERPARTY"),
  ORG("New Genesis Ventures LLC", "COUNTERPARTY"),
  ORG("Suave Tech Solutions LLC", "COUNTERPARTY"),
  ORG("Anymo Ltd", "COUNTERPARTY"),
  ORG("With Pleasure LLC", "COUNTERPARTY"),
  ORG("Protogeist LLC", "COUNTERPARTY"),
  // counsel / accounting
  ORG("DLA Piper", "COUNTERPARTY"),
  ORG("ChainwiseCPA", "COUNTERPARTY"),
  ORG("Sandshrew", "COUNTERPARTY"),
  // SAFE / Token-Rights / Warrant investors (DLA Piper folder)
  ORG("Antalpha", "FUNDED_INVESTOR"),
  ORG("Bitcoin Startup Lab", "FUNDED_INVESTOR"),
  ORG("Bonfire Union", "FUNDED_INVESTOR"),
  ORG("Borderless Cross", "FUNDED_INVESTOR"),
  E("Dan Greenberg", "FUNDED_INVESTOR"),
  E("Dominic Silk", "FUNDED_INVESTOR"), // also advisor/contractor
  E("Eric Chung", "FUNDED_INVESTOR"),
  ORG("Ethos Venture", "FUNDED_INVESTOR"),
  ORG("Flamingo DAO LLC", "FUNDED_INVESTOR"),
  ORG("FORESIGHTRESEARCH", "FUNDED_INVESTOR"),
  E("Gualberto Diaz", "FUNDED_INVESTOR"),
  ORG("Headline Asia Limited", "FUNDED_INVESTOR"),
  E("John Paul Scianna", "FUNDED_INVESTOR", "john.scianna@oyl.io"),
  ORG("KNSV Holdings", "FUNDED_INVESTOR"),
  E("Matthew Paik", "FUNDED_INVESTOR"),
  E("Munam Wasi", "FUNDED_INVESTOR"),
  E("Nick Hansen", "FUNDED_INVESTOR"),
  ORG("Public Works", "FUNDED_INVESTOR"),
  ORG("Pulsar", "FUNDED_INVESTOR"),
  E("Soban Saqib", "FUNDED_INVESTOR"),
  E("Waikit Lau", "FUNDED_INVESTOR"),
  ORG("Web3", "FUNDED_INVESTOR"),
  ORG("Arca Endeavor Fund", "FUNDED_INVESTOR"),
  ORG("Arca NFT Fund", "FUNDED_INVESTOR"),
  ORG("AVID3", "FUNDED_INVESTOR"),
  ORG("Bitcoin Magazine Fund", "FUNDED_INVESTOR"),
  E("Udi Wertheimer", "FUNDED_INVESTOR"),
  ORG("Block Space Force", "FUNDED_INVESTOR"),
]

// Patch email/kind defaults
function normalize(list, scope) {
  return list.map((e) => ({
    name: e.name, scope, category: e.category, kind: e.kind, email: e.email ?? null,
    notes: "seeded from people roster",
  }))
}
const ALL = [...normalize(SUBFROST, "SUBFROST"), ...normalize(OYL, "OYL")]

async function main() {
  console.log(`\n=== seed-legal-entities ===`)
  console.log(`SUBFROST: ${SUBFROST.length}   OYL: ${OYL.length}   total: ${ALL.length}`)
  const byCat = {}
  for (const e of ALL) byCat[`${e.scope}/${e.category}`] = (byCat[`${e.scope}/${e.category}`] || 0) + 1
  console.log("by scope/category:", byCat)

  if (REPORT) {
    for (const e of ALL) console.log(`  [${e.scope}] ${e.category.padEnd(16)} ${e.kind.padEnd(7)} ${e.name}${e.email ? `  <${e.email}>` : ""}`)
    return
  }

  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()
  let created = 0, existed = 0
  for (const e of ALL) {
    const found = await prisma.legalEntity.findFirst({ where: { name: e.name, scope: e.scope }, select: { id: true } })
    if (found) { existed++; continue }
    if (!DRY) await prisma.legalEntity.create({ data: e })
    created++
    if (created % 25 === 0) console.log(`  …${created} created`)
  }
  console.log(`\ndone. created=${created} alreadyPresent=${existed}${DRY ? " (dry-run — no writes)" : ""}`)
  await prisma.$disconnect()
}

main().catch((e) => { console.error(e); process.exit(1) })
