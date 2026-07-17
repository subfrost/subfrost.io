#!/usr/bin/env node
// Records the contractor invoices that have no received-PDF (Erick's ICA-based
// monthly comp; Steven Shangraw's invoice 001 — confirmed by rwp), attributes
// their parked DIESEL payments, and tags the Beta Testers grouping as opex.
// Idempotent.  DATABASE_URL=... node scripts/reconcile-gmail-invoices.mjs [--report]
const REPORT = process.argv.includes("--report")
const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()
const ci = (n) => ({ equals: n, mode: "insensitive" })

// contractor comp invoices with no received-PDF, + the payment they settle
const INVOICES = [
  { ref: "CASUWU-2026-05", payee: "Erick Delgado", usd: 7000, diesel: 100, date: "2026-05-30",
    addr: "bc1p0eyyqrkzaadectpjkqlj7zfjg92a9m5cf2kswm6u5q9ahvvpltgqhvlglj",
    desc: "Casuwu (Erick Delgado) — May 2026 contractor comp · $7,000/mo in DIESEL (per ICA; no separate invoice PDF)" },
  { ref: "CASUWU-2026-06", payee: "Erick Delgado", usd: 7000, diesel: 145, date: "2026-06-28",
    addr: "bc1p0eyyqrkzaadectpjkqlj7zfjg92a9m5cf2kswm6u5q9ahvvpltgqhvlglj",
    desc: "Casuwu (Erick Delgado) — Jun 2026 contractor comp · $7,000/mo in DIESEL (per ICA)" },
  { ref: "INV-2026-001", payee: "Steven Shangraw", usd: 4000, diesel: 50, date: "2026-06-09",
    addr: "bc1pxsyq2t3g25ze3zc3crq7zah95q4rcrf40ncqjsut42n3seet3t0qet723w",
    desc: "Steven Shangraw — invoice 001 (settled 50 DIESEL; PDF pending)" },
]

async function main() {
  console.log(`\n=== reconcile-gmail-invoices ${REPORT ? "(REPORT)" : ""} ===\n`)
  for (const inv of INVOICES) {
    const pay = await prisma.payee.findFirst({ where: { name: ci(inv.payee) } })
    if (!pay) { console.log(`  ! no payee ${inv.payee} — skip`); continue }
    let row = await prisma.invoice.findUnique({ where: { ref: inv.ref } })
    if (row) console.log(`  ~ ${inv.ref} exists`)
    else {
      console.log(`  + ${inv.ref}  ${inv.payee}  ${inv.diesel} DIESEL ($${inv.usd}) PAID`)
      if (!REPORT) row = await prisma.invoice.create({ data: {
        ref: inv.ref, payeeId: pay.id, description: inv.desc, amountUsd: inv.usd,
        amountDiesel: inv.diesel, status: "PAID", issuedAt: new Date(inv.date) } })
    }
    if (!REPORT && row) {
      const pmt = await prisma.dieselPayment.findFirst({ where: { recipientAddress: inv.addr, amountDiesel: inv.diesel } })
      if (pmt && pmt.invoiceId !== row.id) { await prisma.dieselPayment.update({ where: { id: pmt.id }, data: { invoiceId: row.id } }); console.log(`      ↳ attributed ${inv.diesel} DIESEL payment`) }
    }
  }
  // Beta Testers grouping → operating expenses
  const bt = await prisma.legalEntity.findFirst({ where: { name: ci("Beta Testers") } })
  if (bt && !REPORT) {
    await prisma.legalEntity.update({ where: { id: bt.id }, data: {
      tags: [...new Set([...(bt.tags || []), "operating-expense", "opex"])],
      notes: (bt.notes ? bt.notes + " " : "") + "Classified as operating expenses. Holds the 4 still-unidentified DIESEL payout addresses (203 DIESEL)." } })
    console.log(`\n  Beta Testers → tagged operating-expense`)
  }
  // umbrella invoice: reflect opex framing
  const um = await prisma.invoice.findUnique({ where: { ref: "INV-DDL-GRANT-2026" } })
  if (um && !REPORT) await prisma.invoice.update({ where: { id: um.id }, data: {
    description: um.description.split(" — opex:")[0] + " — opex: the remaining unattributed payouts are operating expenses (Beta Testers) pending identification." } })
  console.log(`\ndone`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
