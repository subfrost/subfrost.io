#!/usr/bin/env node
// ===========================================================================
// reconcile-contractors.mjs — wire the accounting + document + on-chain worlds
// together for the identified DIESEL contractors so each one's dossier shows
// their agreement/W-9, their invoices, and the DIESEL payments that settled them.
//
// This script does NOT fabricate invoices. It uses the REAL existing Invoice
// rows / DriveFiles already in prod. The only Invoice it CREATES is Area21's,
// whose invoice exists solely as a DriveFile (no Invoice row) — and it is built
// straight from that document (pdfUrl = the DriveFile's gcsObject).
//
// Per contractor: find-or-create a LegalEntity + a Payee and link them
// (LegalEntity.payeeId); add the payout address to the entity (so the dossier's
// on-chain join surfaces their DIESEL payments); tag "contractor"; attribute the
// settling DieselPayment(s) to the real invoice (or detach to address-only where
// the invoice is missing / none exists yet); flip crypto-settled invoice amounts
// into the DIESEL column; and link each W-9 / contractor agreement DriveFile.
//
// Finally it re-bases the bogus umbrella invoice (INV-DDL-GRANT-2026) to the sum
// of the DieselPayments that are STILL linked to it (the unidentified ones).
//
//   DATABASE_URL=... node scripts/reconcile-contractors.mjs --report   # dry-run
//   DATABASE_URL=... node scripts/reconcile-contractors.mjs            # writes
// ===========================================================================

const REPORT = process.argv.includes("--report")
const { PrismaClient } = await import("@prisma/client")
const prisma = new PrismaClient()
const ci = (name) => ({ equals: name, mode: "insensitive" })

const UMBRELLA_REF = "INV-DDL-GRANT-2026"

// The 4 unidentified recipient addresses whose payments STAY on the umbrella.
// (bc1pyph06j… received two payments; both stay.) Listed for the report only —
// the actual re-base is computed from what remains linked after reattribution.
const UNIDENTIFIED = [
  "bc1p9sv8l3w8nywz2rlu69nxxtetmxnqumng4rymrjgx43fdjsp337mqzeh339",
  "bc1p4nsffaqfv4yfgpkrlnhjxcl239rzmz42jhrz7lk2334rcnc7yv8sgmvtal",
  "bc1q4cjwlfnwrfs7pa0f5308zdaxxrqu43akw5x5uh",
  "bc1pyph06j7qsqgne9nrn5pcvtj0kecln6tlkza6uu73tl4ww4ny9fhske404e",
]

// ---------------------------------------------------------------------------
// Contractor reconciliation plan. All invoices referenced by `ref` already
// exist in prod EXCEPT Area21's (createInvoice). Payment actions match a
// DieselPayment by recipientAddress + amountDiesel (unique per address).
//   action "attribute" → set invoiceId = <the real invoice>
//   action "detach"    → set invoiceId = null (address-attributed only)
// docLinks reference REAL DriveFiles by their unique gcsObject.
// ---------------------------------------------------------------------------
const CONTRACTORS = [
  {
    entity: "Erick Delgado (casuwu)", payee: "Erick Delgado", kind: "PERSON",
    recategorize: true, // EMPLOYEE → COUNTERPARTY (Independent Contractor Agreement, not employment)
    address: "bc1p0eyyqrkzaadectpjkqlj7zfjg92a9m5cf2kswm6u5q9ahvvpltgqhvlglj",
    payments: [
      { amount: 100, action: "detach", note: "May 2026 — no invoice yet, address-attributed" },
      { amount: 145, action: "detach", note: "Jun 2026 — no invoice yet, address-attributed" },
    ],
    invoiceUpdates: [],
    createInvoice: null,
    docLinks: [
      { gcs: "files/4d53cd53-4273-42e9-a8ba-53cefec99c55", role: "SIGNATORY", label: "Casuwu Contractor Paperwork (000221, executed)" },
      { gcs: "files/f5508f26-f617-4727-818a-a67435f55903", role: "SIGNATORY", label: "Casuwu Contractor Paperwork (000222, executed)" },
    ],
    notes: ["no invoice row — 2 payments attributed by address only"],
  },
  {
    entity: "Steven Shangraw", payee: "Steven Shangraw", kind: "PERSON",
    address: "bc1pxsyq2t3g25ze3zc3crq7zah95q4rcrf40ncqjsut42n3seet3t0qet723w",
    payments: [
      { amount: 78, action: "attribute", invoiceRef: "INV-2026-002", note: "Jul 2 — invoice 002" },
      { amount: 50, action: "detach", note: "Jun 9 — invoice 001 MISSING, address-attributed" },
    ],
    invoiceUpdates: [
      { ref: "INV-2026-002", amountDiesel: 78, status: "PAID" }, // keep amountUsd 4000
    ],
    createInvoice: null,
    docLinks: [],
    notes: ["invoice 001 (the June 9 / 50-DIESEL settlement) is not in the system — PENDING"],
  },
  {
    entity: "CryptoLogic LLC", payee: "CryptoLogic LLC", kind: "ORG",
    address: "bc1pmkfdw9pzkgvp0490dzxc5wts7jacytmr6um30evw08jh4cghta0q8seqr6",
    payments: [
      { amount: 50, action: "attribute", invoiceRef: "INV-cryptologic-llc-001", note: "Jun 26" },
      { amount: 25, action: "attribute", invoiceRef: "INV-cryptologic-llc-003", note: "Jul 3" },
    ],
    invoiceUpdates: [
      // these figures are DIESEL, not USD — move to the DIESEL column, zero the USD
      { ref: "INV-cryptologic-llc-001", amountDiesel: 50, amountUsd: 0, status: "PAID" },
      { ref: "INV-cryptologic-llc-003", amountDiesel: 25, amountUsd: 0, status: "PAID" },
    ],
    createInvoice: null,
    docLinks: [],
    notes: ["no W-9 / contractor-agreement DriveFile on file for CryptoLogic (Kevin Yao)"],
  },
  {
    entity: "Area21 Labs LLC", payee: "Area21 Labs LLC", kind: "ORG",
    address: "bc1pg94pgyjkm3rthlzu8u9mut2yj54s9vmez65qg0jwh5fnmmj7tpps0yllfx",
    payments: [
      { amount: 63.6, action: "attribute", invoiceRef: "AREA21-INV-1", note: "Jun 19" },
    ],
    invoiceUpdates: [],
    // invoice exists ONLY as a DriveFile → create the Invoice row from that doc
    createInvoice: {
      ref: "AREA21-INV-1", amountUsd: 5000, amountDiesel: 63.6, status: "PAID",
      issuedAt: "2026-06-19", description: "Area21 Labs invoice #1 — software dev · $5,000/mo settled in DIESEL",
      pdfUrlGcs: "files/008c6960-1bd9-41e1-9fb8-eee17277c222", // 'Invoice 1 - Area21 Labs.pdf'
    },
    docLinks: [
      { gcs: "files/a60feb5c-6dd7-4429-bf51-863c65cea321", role: "SUBJECT", tax: true, label: "Area21 Labs LLC - W9 (executed)" },
      { gcs: "files/356b3b25-bb87-4297-97ed-8f8318b72681", role: "SIGNATORY", label: "Area21 Software Developer Agreement (signed)" },
    ],
    notes: [],
  },
  {
    entity: "Vitor Oliveira", payee: "Vitor Oliveira", kind: "PERSON",
    address: "bc1pd44fca0yxm89wn9tf5epnlfcyqp4c4d82764m49u7q7pedu5cerqzgh7d8",
    payments: [
      { amount: 35, action: "attribute", invoiceRef: "INV-001", note: "Jun 21" },
    ],
    invoiceUpdates: [
      { ref: "INV-001", amountDiesel: 35, status: "PAID" }, // amountUsd was blank (0)
    ],
    createInvoice: null,
    docLinks: [
      // foreign contractor (Brazil) → W-8BEN is his tax form
      { gcs: "files/845175ea-a37a-4bc5-9e02-ae322ed8bb36", role: "SUBJECT", tax: true, label: "W-8BEN-Vitor (executed)" },
    ],
    notes: ["tax form on file is a W-8BEN (foreign), not a W-9"],
  },
  {
    entity: "Hassan McKusick", payee: "Hassan McKusick", kind: "PERSON",
    address: "bc1pdu7fy3gveufm2ujvwdsrl2tlapz2rykhzvn80a5kht00gnjeqt4q6zntqq",
    payments: [
      { amount: 23, action: "attribute", invoiceRef: "#1", note: "Jun 7" },
    ],
    invoiceUpdates: [
      { ref: "#1", amountDiesel: 23, status: "PAID" }, // keep amountUsd 1400 (billed $1400, settled 23 DIESEL)
    ],
    createInvoice: null,
    docLinks: [],
    notes: ["no W-9 / contractor-agreement DriveFile on file for Hassan"],
  },
]

const report = { payeeLinks: 0, entitiesCreated: [], payeesCreated: [], entitiesUpdated: [], invoicesUpdated: [], invoicesCreated: [], paymentsAttributed: [], paymentsDetached: [], fileLinks: [], docTyped: [] }
const line = []
function log(s) { line.push(s); console.log(s) }

async function ensureFileLink(gcs, entityId, role, entityName, label, tax) {
  const file = await prisma.driveFile.findUnique({ where: { gcsObject: gcs } })
  if (!file) { log(`    ! DriveFile not found for ${gcs} — skip`); return }
  // normalize tax-form docType if missing
  if (tax && !["tax_form", "w9"].includes((file.docType || "").toLowerCase())) {
    log(`    ~ set docType='tax_form' on ${file.name}`)
    report.docTyped.push({ file: file.name })
    if (!REPORT) await prisma.driveFile.update({ where: { id: file.id }, data: { docType: "tax_form" } })
  }
  const existing = await prisma.entityFileLink.findFirst({ where: { fileId: file.id, entityId, role } })
  if (existing) { log(`    · link exists: ${role} → ${label || file.name}`); return }
  log(`    + link ${role} → ${label || file.name}`)
  report.fileLinks.push({ entity: entityName, role, file: file.name })
  if (!REPORT) await prisma.entityFileLink.create({ data: { fileId: file.id, entityId, role } })
}

async function main() {
  log(`\n=== reconcile-contractors ${REPORT ? "(REPORT — dry-run, nothing written)" : "(WRITING)"} ===\n`)

  for (const c of CONTRACTORS) {
    log(`\n■ ${c.entity}`)

    // ---- Payee (find-or-create) ----
    let pay = await prisma.payee.findFirst({ where: { name: ci(c.payee) } })
    if (!pay) {
      log(`  + create Payee "${c.payee}" (${c.kind})`)
      report.payeesCreated.push(c.payee)
      if (!REPORT) pay = await prisma.payee.create({ data: { name: c.payee, type: c.kind === "ORG" ? "ORG" : "PERSON" } })
    } else log(`  · Payee exists: ${c.payee}`)

    // ---- LegalEntity (find-or-create) ----
    let ent = await prisma.legalEntity.findFirst({ where: { name: ci(c.entity) } })
    if (!ent) {
      log(`  + create LegalEntity "${c.entity}" (${c.kind}, COUNTERPARTY, tag contractor)`)
      report.entitiesCreated.push(c.entity)
      if (!REPORT) ent = await prisma.legalEntity.create({
        data: { name: c.entity, kind: c.kind, category: "COUNTERPARTY", scope: "SUBFROST",
          tags: ["contractor"], addresses: [c.address], payeeId: pay?.id ?? null },
      })
    } else log(`  · LegalEntity exists: ${c.entity} (${ent.category})`)

    // ---- link payee + address + tag + recategorize (idempotent patch) ----
    if (ent && !REPORT) {
      const patch = {}
      if (!ent.payeeId && pay) patch.payeeId = pay.id
      const addrs = [...new Set([...(ent.addresses || []), c.address])]
      if (addrs.length !== (ent.addresses || []).length) patch.addresses = addrs
      const tags = [...new Set([...(ent.tags || []), "contractor"])]
      if (tags.length !== (ent.tags || []).length) patch.tags = tags
      if (c.recategorize && ent.category !== "COUNTERPARTY") patch.category = "COUNTERPARTY"
      if (Object.keys(patch).length) {
        await prisma.legalEntity.update({ where: { id: ent.id }, data: patch })
        report.entitiesUpdated.push({ entity: c.entity, patch: Object.keys(patch).join(", ") })
      }
    }
    log(`  → link payee · +address ${c.address.slice(0, 12)}… · tag contractor${c.recategorize ? " · recategorize EMPLOYEE→COUNTERPARTY" : ""}`)
    // (report bookkeeping for dry-run too)
    if (REPORT) {
      const need = []
      if (!ent || !ent.payeeId) need.push("payeeId")
      if (!ent || !(ent.addresses || []).includes(c.address)) need.push("addresses")
      if (!ent || !(ent.tags || []).includes("contractor")) need.push("tags")
      if (c.recategorize && (!ent || ent.category !== "COUNTERPARTY")) need.push("category")
      if (need.length) report.entitiesUpdated.push({ entity: c.entity, patch: need.join(", ") })
    }

    // ---- create Area21 invoice from its DriveFile ----
    if (c.createInvoice) {
      const spec = c.createInvoice
      let inv = await prisma.invoice.findUnique({ where: { ref: spec.ref } })
      if (inv) log(`  · Invoice ${spec.ref} already exists`)
      else {
        log(`  + create Invoice ${spec.ref}: $${spec.amountUsd} USD / ${spec.amountDiesel} DIESEL PAID · pdfUrl=${spec.pdfUrlGcs}`)
        report.invoicesCreated.push({ ref: spec.ref, usd: spec.amountUsd, diesel: spec.amountDiesel })
        if (!REPORT && pay) inv = await prisma.invoice.create({ data: {
          ref: spec.ref, payeeId: pay.id, description: spec.description,
          amountUsd: spec.amountUsd, amountDiesel: spec.amountDiesel, status: spec.status,
          issuedAt: new Date(spec.issuedAt), pdfUrl: spec.pdfUrlGcs } })
      }
    }

    // ---- flip existing invoices to DIESEL / PAID ----
    for (const u of c.invoiceUpdates) {
      const inv = await prisma.invoice.findUnique({ where: { ref: u.ref } })
      if (!inv) { log(`  ! invoice ${u.ref} not found — skip`); continue }
      const data = {}
      if (u.amountDiesel != null && inv.amountDiesel !== u.amountDiesel) data.amountDiesel = u.amountDiesel
      if (u.amountUsd != null && inv.amountUsd !== u.amountUsd) data.amountUsd = u.amountUsd
      if (u.status && inv.status !== u.status) data.status = u.status
      const usdNote = u.amountUsd === 0 ? " (USD→0: figure is DIESEL)" : ""
      log(`  ~ invoice ${u.ref}: set amountDiesel=${u.amountDiesel}${usdNote}, status ${u.status}`)
      report.invoicesUpdated.push({ ref: u.ref, amountDiesel: u.amountDiesel, amountUsd: u.amountUsd ?? inv.amountUsd })
      if (!REPORT && Object.keys(data).length) await prisma.invoice.update({ where: { id: inv.id }, data })
    }

    // ---- payment attribution / detachment ----
    for (const p of c.payments) {
      const pmt = await prisma.dieselPayment.findFirst({ where: { recipientAddress: c.address, amountDiesel: p.amount } })
      if (!pmt) { log(`  ! payment ${p.amount} → ${c.address.slice(0, 10)}… not found — skip`); continue }
      if (p.action === "attribute") {
        const inv = await prisma.invoice.findUnique({ where: { ref: p.invoiceRef } })
        if (!inv) { log(`  ! invoice ${p.invoiceRef} missing for ${p.amount} payment — skip`); continue }
        log(`  ↳ attribute ${p.amount} DIESEL → ${p.invoiceRef} (off umbrella) [${p.note}]`)
        report.paymentsAttributed.push({ amount: p.amount, invoice: p.invoiceRef, entity: c.entity })
        if (!REPORT) await prisma.dieselPayment.update({ where: { id: pmt.id }, data: { invoiceId: inv.id } })
      } else { // detach
        log(`  ↳ detach ${p.amount} DIESEL → invoiceId=null, address-attributed [${p.note}]`)
        report.paymentsDetached.push({ amount: p.amount, entity: c.entity, note: p.note })
        if (!REPORT) await prisma.dieselPayment.update({ where: { id: pmt.id }, data: { invoiceId: null } })
      }
    }

    // ---- W-9 / contractor-agreement DriveFile links ----
    for (const d of c.docLinks) {
      if (!ent && REPORT) { log(`    (entity would be created — link ${d.role} → ${d.label})`); report.fileLinks.push({ entity: c.entity, role: d.role, file: d.label }); continue }
      if (ent) await ensureFileLink(d.gcs, ent.id, d.role, c.entity, d.label, d.tax)
    }

    for (const n of c.notes) log(`  note: ${n}`)
  }

  // ---- link every remaining Payee → its exact like-named LegalEntity ----
  log(`\n■ Payee → LegalEntity linking (exact name, where entity exists & unlinked)`)
  const payees = await prisma.payee.findMany()
  for (const p of payees) {
    const e = await prisma.legalEntity.findFirst({ where: { name: ci(p.name), payeeId: null } })
    if (e) {
      log(`  + link Payee "${p.name}" → entity ${e.id}`)
      report.payeeLinks++
      if (!REPORT) await prisma.legalEntity.update({ where: { id: e.id }, data: { payeeId: p.id } })
    }
  }
  // count total payees now linked (for the report)
  const linkedNow = REPORT ? null : await prisma.legalEntity.count({ where: { payeeId: { not: null } } })

  // ---- re-base the umbrella invoice to the sum of what's STILL linked to it ----
  log(`\n■ Umbrella ${UMBRELLA_REF}`)
  const umbrella = await prisma.invoice.findUnique({ where: { ref: UMBRELLA_REF } })
  if (umbrella) {
    // In dry-run the detaches haven't happened, so compute the intended remainder:
    // everything currently linked minus the payments we will attribute/detach.
    let remainingSum
    if (REPORT) {
      const stillLinked = await prisma.dieselPayment.findMany({ where: { invoiceId: umbrella.id } })
      const movingAddrs = new Set(CONTRACTORS.flatMap((c) => c.payments.map((p) => `${c.address}|${p.amount}`)))
      remainingSum = stillLinked
        .filter((pm) => !movingAddrs.has(`${pm.recipientAddress}|${pm.amountDiesel}`))
        .reduce((s, pm) => s + pm.amountDiesel, 0)
    } else {
      const agg = await prisma.dieselPayment.aggregate({ where: { invoiceId: umbrella.id }, _sum: { amountDiesel: true } })
      remainingSum = agg._sum.amountDiesel ?? 0
    }
    remainingSum = Math.round(remainingSum * 1e6) / 1e6
    log(`  ~ amountDiesel: ${umbrella.amountDiesel} → ${remainingSum} (sum of the ${UNIDENTIFIED.length} unidentified recipients still on the umbrella)`)
    report.umbrella = { was: umbrella.amountDiesel, now: remainingSum }
    if (!REPORT && umbrella.amountDiesel !== remainingSum) await prisma.invoice.update({ where: { id: umbrella.id }, data: { amountDiesel: remainingSum } })
  } else log(`  ! ${UMBRELLA_REF} not found`)

  // ---- summary table ----
  log(`\n=== SUMMARY (${REPORT ? "would-do" : "done"}) ===`)
  log(`Entities created:     ${report.entitiesCreated.join(", ") || "(none)"}`)
  log(`Payees created:       ${report.payeesCreated.join(", ") || "(none)"}`)
  log(`Entities patched:     ${report.entitiesUpdated.map((e) => `${e.entity} [${e.patch}]`).join("; ") || "(none)"}`)
  log(`Invoices created:     ${report.invoicesCreated.map((i) => `${i.ref} ($${i.usd}/${i.diesel}◆)`).join(", ") || "(none)"}`)
  log(`Invoices → DIESEL:    ${report.invoicesUpdated.map((i) => `${i.ref}=${i.amountDiesel}◆`).join(", ") || "(none)"}`)
  log(`Payments attributed:  ${report.paymentsAttributed.map((p) => `${p.amount}◆→${p.invoice}`).join(", ") || "(none)"}`)
  log(`Payments detached:    ${report.paymentsDetached.map((p) => `${p.amount}◆ (${p.entity})`).join(", ") || "(none)"}`)
  log(`File links:           ${report.fileLinks.map((f) => `${f.role}:${f.file}`).join("; ") || "(none)"}`)
  log(`docType normalized:   ${report.docTyped.map((d) => d.file).join(", ") || "(none)"}`)
  log(`Payee→Entity links:   ${report.payeeLinks}${linkedNow != null ? ` (total entities linked now: ${linkedNow})` : ""}`)
  log(`Umbrella amountDiesel: ${report.umbrella ? `${report.umbrella.was} → ${report.umbrella.now}` : "n/a"}`)

  await prisma.$disconnect()
}
main().catch((e) => { console.error(e); process.exit(1) })
