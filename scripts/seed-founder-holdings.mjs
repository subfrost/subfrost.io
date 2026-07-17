// Seed the INTENDED founder cap-table holdings (the FUEL founder split derives
// from these). Requires the `ShareHolding.issued` column — run this ONLY AFTER
// `prisma db push` has added it. Idempotent.
//
//   source ~/.ioenv >/dev/null 2>&1
//   RAW=$(gcloud secrets versions access latest --secret=db-connection-string)
//   export DATABASE_URL=$(python3 -c "import re;u='''$RAW'''.strip();m=re.match(r'(postgres(?:ql)?://[^@]+@)([^/]+)(/[^?]+)(.*)',u);print(m.group(1)+'127.0.0.1:5433'+m.group(3).split('?')[0]+'?sslmode=disable')")
//   node scripts/seed-founder-holdings.mjs
//
// Result (all Common Stock): Raymond 7,000,000 issued=true (as-issued), Gabriel
// 2,500,000 issued=false + Sean 500,000 issued=false (intended, unissued). The
// FUEL founder split is then 7M/2.5M/0.5M = 70/25/5.
import { PrismaClient } from "@prisma/client"
const prisma = new PrismaClient()

const RAYMOND_ENTITY = "cmr3pbey20000ava1zmwi07za"
const GABRIEL_ENTITY = "cmqvojy4o004backrav8qr21a"
const SEAN_ENTITY = "cmqvojxyo004aackrxgwyoesi"
const GABE_USER = "cmq9z1y480002rm9wunybc21r" // gabe@subfrost.io

// name, shares, issued, entityId, userId
const FOUNDERS = [
  { name: "Gabriel Lee", shares: 2_500_000, issued: false, entityId: GABRIEL_ENTITY, userId: GABE_USER },
  { name: "Sean Pulver", shares: 500_000, issued: false, entityId: SEAN_ENTITY, userId: null },
]

async function main() {
  const common = await prisma.shareClass.findFirst({ where: { type: "COMMON" }, orderBy: { createdAt: "asc" } })
  if (!common) throw new Error('No COMMON share class found — seed "Common Stock" first.')

  for (const f of FOUNDERS) {
    // Shareholder (by name) — create or reuse.
    let sh = await prisma.shareholder.findFirst({ where: { name: f.name } })
    if (!sh) {
      sh = await prisma.shareholder.create({
        data: { name: f.name, type: "PERSON", userId: f.userId ?? undefined },
      })
    } else if (f.userId && !sh.userId) {
      sh = await prisma.shareholder.update({ where: { id: sh.id }, data: { userId: f.userId } })
    }

    // ShareHolding on Common Stock, marked intended (issued=false).
    const existing = await prisma.shareHolding.findFirst({ where: { shareholderId: sh.id, shareClassId: common.id } })
    if (existing) {
      await prisma.shareHolding.update({ where: { id: existing.id }, data: { shares: f.shares, issued: false } })
    } else {
      await prisma.shareHolding.create({
        data: {
          shareholderId: sh.id, shareClassId: common.id, shares: f.shares, issued: false,
          issuedAt: new Date("2026-01-01"), notes: "Intended founder allocation (unissued) — FUEL split basis.",
        },
      })
    }

    // Link the LegalEntity to its Shareholder identity.
    await prisma.legalEntity.update({ where: { id: f.entityId }, data: { shareholderId: sh.id } })
  }

  // Raymond's existing 7,000,000 holding stays as-issued.
  const raymond = await prisma.legalEntity.findUnique({ where: { id: RAYMOND_ENTITY }, select: { shareholderId: true } })
  if (raymond?.shareholderId) {
    const rh = await prisma.shareHolding.findFirst({ where: { shareholderId: raymond.shareholderId, shareClassId: common.id } })
    if (rh && rh.issued !== true) {
      await prisma.shareHolding.update({ where: { id: rh.id }, data: { issued: true } })
    }
  }

  const holdings = await prisma.shareHolding.findMany({
    where: { shareClassId: common.id },
    include: { shareholder: { select: { name: true } } },
    orderBy: { shares: "desc" },
  })
  const total = holdings.reduce((s, h) => s + h.shares, 0)
  console.log("Common Stock holdings (founder split basis):")
  for (const h of holdings) {
    console.log(`  ${h.shareholder.name.padEnd(24)} ${String(h.shares).padStart(10)}  issued=${h.issued}  → ${((h.shares / total) * 100).toFixed(1)}%`)
  }
}

main().then(() => prisma.$disconnect()).catch(async (e) => { console.error(e); await prisma.$disconnect(); process.exit(1) })
