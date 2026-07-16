#!/usr/bin/env node

/**
 * Record the real, acknowledged Subzero Research Inc. FinCEN Form 107 (RMSB)
 * registration into the /admin FinCEN module.
 *
 * This filing was submitted directly through the BSA E-Filing portal (outside
 * this system) and acknowledged by FinCEN. This script upserts:
 *   1. the corrected singleton Form 107 draft (what was actually filed), and
 *   2. an ACKNOWLEDGED submission row carrying the real FinCEN identifiers.
 *
 * Idempotent: re-running updates in place (Form 107 is a singleton; the
 * submission is keyed on its real BSA E-Filing Tracking ID).
 *
 * Run:  node scripts/record-subzero-filing.cjs
 */

const fs = require("fs")
const path = require("path")
const { PrismaClient } = require("@prisma/client")

function loadEnvFromFileIfPresent(filePath) {
  if (!fs.existsSync(filePath)) return
  const raw = fs.readFileSync(filePath, "utf8")
  for (const line of raw.split(/\r?\n/)) {
    const trimmed = line.trim()
    if (!trimmed || trimmed.startsWith("#")) continue
    const eq = trimmed.indexOf("=")
    if (eq === -1) continue
    const key = trimmed.slice(0, eq).trim()
    if (!key || process.env[key] != null) continue
    let value = trimmed.slice(eq + 1).trim()
    if ((value.startsWith('"') && value.endsWith('"')) || (value.startsWith("'") && value.endsWith("'"))) {
      value = value.slice(1, -1)
    }
    process.env[key] = value
  }
}

loadEnvFromFileIfPresent(path.join(__dirname, "..", ".env.local"))
loadEnvFromFileIfPresent(path.join(__dirname, "..", ".env"))

const RECORDED_BY = "grey@subfrost.io"

// What was actually filed (source of truth: BSA E-Filing portal + acknowledgement).
const FORM107 = {
  legalName: "Subzero Research Inc",
  dbaNames: [],
  ein: "99-1852777",
  formOfOrganization: "corporation",
  stateOfOrganization: "DE", // incorporated in Delaware
  principalAddress: {
    line1: "1300 Fairview Avenue",
    line2: "Unit E",
    city: "Houston",
    state: "TX",
    zip: "77006",
  },
  geography: "US",
  msbActivities: ["money-transmitter"],
  conductsBusinessInAllStates: false,
  statesOfActivity: [],
  numberOfBranches: 0,
  numberOfAgents: 0,
  primaryRegulator: "irs",
  officers: [
    { name: "flex", title: "Director", role: "director", includeOnFiling: true },
    { name: "grey", title: "Compliance", role: "compliance", includeOnFiling: true },
  ],
  owners: [],
  reasonForFiling: "initial",
  preparerName: "grey",
}

// The acknowledged filing's real FinCEN identifiers.
const FILING = {
  trackingId: "MRX26-00005866", // BSA E-Filing Tracking ID
  bsaId: "31000331323980", // permanent FinCEN BSA ID
  enrollmentCode: "SRI174904", // org enrollment code on the BSA E-Filing account
  status: "ACKNOWLEDGED",
  submittedAt: new Date("2026-05-26T20:58:01Z"), // 2026-05-26 04:58:01 PM EDT
  acknowledgedAt: new Date("2026-05-28T09:18:56Z"), // 2026-05-28 05:18:56 AM EDT
  message: "Initial RMSB registration (Form 107) filed via BSA E-Filing portal and acknowledged by FinCEN.",
}

async function main() {
  const prisma = new PrismaClient()
  try {
    // 1. Upsert the singleton Form 107 draft with the corrected/filed values.
    const existingDraft = await prisma.fincenDraft.findFirst({ where: { type: "FORM107" } })
    const draft = existingDraft
      ? await prisma.fincenDraft.update({
          where: { id: existingDraft.id },
          data: { data: FORM107, updatedBy: RECORDED_BY },
        })
      : await prisma.fincenDraft.create({
          data: { type: "FORM107", data: FORM107, updatedBy: RECORDED_BY },
        })
    console.log(`Form 107 draft ${existingDraft ? "updated" : "created"}: ${draft.id}`)

    // 2. Upsert the acknowledged submission keyed on its real tracking id.
    const existingSub = await prisma.fincenSubmission.findFirst({ where: { trackingId: FILING.trackingId } })
    const subData = {
      draftId: draft.id,
      type: "FORM107",
      trackingId: FILING.trackingId,
      status: FILING.status,
      message: FILING.message,
      bsaId: FILING.bsaId,
      enrollmentCode: FILING.enrollmentCode,
      acknowledgedAt: FILING.acknowledgedAt,
      submittedAt: FILING.submittedAt,
      submittedBy: RECORDED_BY,
    }
    const sub = existingSub
      ? await prisma.fincenSubmission.update({ where: { id: existingSub.id }, data: subData })
      : await prisma.fincenSubmission.create({ data: subData })
    console.log(`Submission ${existingSub ? "updated" : "created"}: ${sub.id}`)
    console.log(`  Tracking ID:  ${sub.trackingId}`)
    console.log(`  BSA ID:       ${sub.bsaId}`)
    console.log(`  Enrollment:   ${sub.enrollmentCode}`)
    console.log(`  Status:       ${sub.status}`)
    console.log("Done.")
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
