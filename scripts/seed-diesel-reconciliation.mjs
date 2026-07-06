#!/usr/bin/env node
// ===========================================================================
// seed-diesel-reconciliation.mjs — ingest the on-chain DIESEL disbursement
// ledger (reconstructed from protostone edicts via subfrost-mobile-cli tx-detail)
// and tie it to a single PENDING umbrella invoice from Subzero Research Inc to
// DIESEL DAO LLC.
//
//   • DIESEL DAO LLC — LegalEntity (COUNTERPARTY) + Payee (the grantor)
//   • Umbrella Invoice (status OPEN = pending) itemizing the whole grant:
//     DIESEL disbursed by Subzero on the DAO's behalf to support alkanes.
//   • One DieselPayment per edict (source ONCHAIN, idempotent on txid+vout),
//     each linked to the umbrella invoice. Recipients stay as raw addresses
//     until identified (they then attach to entities → show on the dossier).
//
//   DATABASE_URL=... node scripts/seed-diesel-reconciliation.mjs --ledger <edicts.json> [--report]
// ===========================================================================

const argv = process.argv.slice(2)
const REPORT = argv.includes("--report")
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const LEDGER = arg("--ledger")
if (!LEDGER) { console.error("error: --ledger <path to diesel_edicts.json> required"); process.exit(1) }

const { readFileSync } = await import("node:fs")
const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()

const INV_REF = "INV-DDL-GRANT-2026"
const raw = JSON.parse(readFileSync(LEDGER, "utf8"))
// real external disbursements only (exclude shadow-vout AMM swaps → recipient null)
const edicts = (raw.disbursements || []).filter((r) => r.recipient)
const totalDiesel = Math.round(edicts.reduce((s, r) => s + r.amountBase, 0) / 1e6) / 100

async function main() {
  console.log(`\n=== seed-diesel-reconciliation ${REPORT ? "(REPORT — nothing written)" : ""} ===`)
  console.log(`ledger: ${edicts.length} edicts, ${totalDiesel} DIESEL disbursed\n`)

  // 1) DIESEL DAO LLC entity + payee
  let entity = await prisma.legalEntity.findFirst({ where: { name: { equals: "DIESEL DAO LLC", mode: "insensitive" } } })
  let payee = await prisma.payee.findFirst({ where: { name: { equals: "DIESEL DAO LLC", mode: "insensitive" } } })
  console.log(`DIESEL DAO LLC entity: ${entity ? "exists" : "CREATE"}   payee: ${payee ? "exists" : "CREATE"}`)
  if (!REPORT) {
    if (!entity) entity = await prisma.legalEntity.create({
      data: { name: "DIESEL DAO LLC", kind: "ORG", category: "COUNTERPARTY", scope: "SUBFROST",
        notes: "Grantor DAO (to be formed). Awards DIESEL as a grant to Subfrost/Subzero Research Inc to support alkanes. Umbrella invoice pending until entity formed + agreements signed." },
    })
    if (!payee) payee = await prisma.payee.create({ data: { name: "DIESEL DAO LLC", type: "ORG",
      notes: "DIESEL grant counterparty — see invoice " + INV_REF } })
  }

  // 2) Umbrella invoice (pending = OPEN)
  let invoice = await prisma.invoice.findUnique({ where: { ref: INV_REF } })
  console.log(`umbrella invoice ${INV_REF}: ${invoice ? "exists" : "CREATE"} (${totalDiesel} DIESEL, status OPEN/pending)`)
  if (!REPORT && !invoice) {
    invoice = await prisma.invoice.create({
      data: {
        ref: INV_REF, payeeId: payee.id, status: "OPEN", amountUsd: 0, amountDiesel: totalDiesel,
        issuedAt: new Date("2026-07-05"),
        description: "PENDING grant reconciliation — DIESEL disbursed by Subzero Research Inc on behalf of DIESEL DAO LLC to support alkanes development. Itemized from on-chain edicts (subfrost-mobile-cli). Pending DAO formation + signed grant agreements.",
      },
    })
  }

  // 3) DieselPayment per edict, linked to the umbrella invoice
  let created = 0, updated = 0
  for (const e of edicts) {
    const amountDiesel = e.amountBase / 1e8
    const paidAt = e.blockTime ? new Date(e.blockTime * 1000) : new Date()
    if (REPORT) {
      const ex = await prisma.dieselPayment.findFirst({ where: { txid: e.txid, vout: e.output_idx } })
      console.log(`  ${ex ? "exists" : "+ new"}  ${amountDiesel.toFixed(2)} DIESEL  ${e.txid.slice(0, 12)}…:${e.output_idx} -> ${e.recipient.slice(0, 20)}…  ${paidAt.toISOString().slice(0, 10)}`)
      ex ? updated++ : created++
      continue
    }
    const ex = await prisma.dieselPayment.findFirst({ where: { txid: e.txid, vout: e.output_idx } })
    const data = {
      txid: e.txid, vout: e.output_idx, amountDiesel, recipientAddress: e.recipient,
      paidAt, blockHeight: e.blockHeight ?? null, source: "ONCHAIN", invoiceId: invoice.id,
    }
    if (ex) { await prisma.dieselPayment.update({ where: { id: ex.id }, data }); updated++ }
    else { await prisma.dieselPayment.create({ data }); created++ }
  }

  console.log(`\n=== summary ===`)
  console.log(`payments ${REPORT ? "would-create" : "created"}: ${created}   ${REPORT ? "would-update" : "updated"}: ${updated}`)
  console.log(`umbrella invoice: ${INV_REF} · ${totalDiesel} DIESEL · OPEN (pending) · payee DIESEL DAO LLC`)
  console.log(`recipients: ${new Set(edicts.map((e) => e.recipient)).size} distinct addresses (attach to entities once identified)`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
