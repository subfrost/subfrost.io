#!/usr/bin/env node
// ===========================================================================
// seed-invoices.mjs — load the extracted vendor-invoice corpus into the
// accounting system: one Payee per vendor, one Invoice per distinct invoice
// number (deduping the multiple DriveFile copies), each linked back to its
// source PDF (DriveFile.gcsObject → Invoice.pdfUrl).
//
// Historical vendor invoices → status PAID by default (settled via card/crypto;
// paidVia noted). Amounts are USD-denominated even when settled in DIESEL/USDT/BTC.
//
//   DATABASE_URL=... node scripts/seed-invoices.mjs --data <invoices_extracted.json> [--report]
// ===========================================================================

const argv = process.argv.slice(2)
const REPORT = argv.includes("--report")
const arg = (k) => { const i = argv.indexOf(k); return i >= 0 ? argv[i + 1] : undefined }
const DATA = arg("--data")
if (!DATA) { console.error("error: --data <invoices_extracted.json> required"); process.exit(1) }

const { readFileSync } = await import("node:fs")
const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()

const raw = JSON.parse(readFileSync(DATA, "utf8"))
const slug = (s) => s.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 24)

// Dedup by ref (multiple DriveFiles share one invoice number). Null-ref records
// each get a synthesized ref. Keep the first record per ref.
const byRef = new Map()
let synth = 0
for (const inv of raw.invoices) {
  const ref = inv.ref ? inv.ref.trim() : `INV-${slug(inv.vendor || "unknown")}-${(++synth).toString().padStart(3, "0")}`
  if (!byRef.has(ref)) byRef.set(ref, { ...inv, ref, dupDocs: [inv.docId] })
  else byRef.get(ref).dupDocs.push(inv.docId)
}
const invoices = [...byRef.values()]

async function main() {
  console.log(`\n=== seed-invoices ${REPORT ? "(REPORT — nothing written)" : ""} ===`)
  console.log(`${raw.invoices.length} docs → ${invoices.length} distinct invoices, ${new Set(invoices.map((i) => i.vendor)).size} vendors\n`)

  // payee cache
  const payeeByName = new Map()
  async function ensurePayee(name, type) {
    const key = name.trim().toLowerCase()
    if (payeeByName.has(key)) return payeeByName.get(key)
    let p = await prisma.payee.findFirst({ where: { name: { equals: name.trim(), mode: "insensitive" } } })
    if (!p && !REPORT) p = await prisma.payee.create({ data: { name: name.trim(), type: type === "PERSON" ? "PERSON" : "ORG" } })
    const id = p ? p.id : "(new)"
    payeeByName.set(key, id)
    return id
  }

  let created = 0, skipped = 0, payeesNew = 0
  let totalUsd = 0
  for (const inv of invoices) {
    const vendor = inv.vendor || "Unknown vendor"
    const before = payeeByName.size
    const payeeId = await ensurePayee(vendor, inv.vendorType)
    if (payeeByName.size > before && payeeId === "(new)") payeesNew++
    const exists = await prisma.invoice.findUnique({ where: { ref: inv.ref } })
    if (exists) { skipped++; continue }
    const amountUsd = typeof inv.amountUsd === "number" ? inv.amountUsd : 0
    totalUsd += amountUsd
    const parts = [inv.description || `${vendor} invoice`]
    if (inv.billTo) parts.push(`bill-to: ${inv.billTo}`)
    if (inv.currency && inv.currency !== "USD") parts.push(`${inv.currency} ${amountUsd}`)
    if (inv.paidVia) parts.push(`paid via ${inv.paidVia}`)
    if (inv.dupDocs.length > 1) parts.push(`${inv.dupDocs.length} copies`)
    if (amountUsd === 0 && inv.amountUsd == null) parts.push("amount not parsed — review")
    const description = parts.join(" · ").slice(0, 300)
    if (REPORT) {
      if (created < 12) console.log(`  + ${inv.ref}  ${vendor}  $${amountUsd}  ${inv.issuedAt || "?"}`)
      created++; continue
    }
    // link source PDF
    let pdfUrl = null
    const df = await prisma.driveFile.findUnique({ where: { id: inv.docId }, select: { gcsObject: true } })
    if (df?.gcsObject) pdfUrl = df.gcsObject
    await prisma.invoice.create({
      data: {
        ref: inv.ref, payeeId, description, amountUsd,
        amountDiesel: null, status: "PAID",
        issuedAt: inv.issuedAt ? new Date(inv.issuedAt) : new Date("2026-01-01"),
        pdfUrl,
      },
    })
    created++
  }

  console.log(`\n=== summary ===`)
  console.log(`invoices ${REPORT ? "would-create" : "created"}: ${created}   skipped(existing): ${skipped}`)
  console.log(`distinct vendors (payees): ${payeeByName.size}`)
  console.log(`total USD across new invoices: $${totalUsd.toLocaleString("en-US", { minimumFractionDigits: 2 })}`)
  console.log(`status: PAID (historical) · each linked to its source PDF where available`)
  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
