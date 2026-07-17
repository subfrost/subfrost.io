#!/usr/bin/env node
// ===========================================================================
// set-compliance-register.mjs — upsert the ComplianceRegister singleton from
// environment variables. This is how the confidential registration facts get
// into (and updated in) the running app WITHOUT ever committing them to this
// public repo: the values are passed at runtime, never stored in source.
//
// Run it as a one-off Cloud Run job (mirrors scripts/seed-compliance.mjs), e.g.:
//   gcloud run jobs create compliance-register-set --image <app-image> \
//     --set-secrets=DATABASE_URL=db-connection-string:latest \
//     --set-env-vars=COMPLIANCE_ENTITY_NAME=...,COMPLIANCE_BSA_ID=... \
//     --command=node --args=scripts/set-compliance-register.mjs ... && \
//   gcloud run jobs execute compliance-register-set --wait
//
// Only fields present in the environment are updated; omitted fields are left
// untouched, so you can tweak one value at a time.
//
// Recognized env vars:
//   COMPLIANCE_ENTITY_NAME, COMPLIANCE_BSA_ID, COMPLIANCE_MSB_TRACKING,
//   COMPLIANCE_CCO_NAME, COMPLIANCE_CCO_DESIGNATED (YYYY-MM-DD),
//   COMPLIANCE_MSB_REGISTERED (true/false)
// ===========================================================================

const REGISTER_ID = "default"

function collectUpdates() {
  const e = process.env
  const data = {}
  if (e.COMPLIANCE_ENTITY_NAME !== undefined) data.entityName = e.COMPLIANCE_ENTITY_NAME.trim()
  if (e.COMPLIANCE_BSA_ID !== undefined) data.bsaId = e.COMPLIANCE_BSA_ID.trim()
  if (e.COMPLIANCE_MSB_TRACKING !== undefined) data.msbTracking = e.COMPLIANCE_MSB_TRACKING.trim()
  if (e.COMPLIANCE_CCO_NAME !== undefined) data.ccoName = e.COMPLIANCE_CCO_NAME.trim()
  if (e.COMPLIANCE_CCO_DESIGNATED !== undefined) data.ccoDesignated = e.COMPLIANCE_CCO_DESIGNATED.trim()
  if (e.COMPLIANCE_MSB_REGISTERED !== undefined) data.msbRegistered = e.COMPLIANCE_MSB_REGISTERED.trim() === "true"
  return data
}

async function main() {
  const data = collectUpdates()
  const keys = Object.keys(data)
  if (keys.length === 0) {
    console.error("No COMPLIANCE_* env vars provided — nothing to update.")
    process.exit(1)
  }
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()
  try {
    await prisma.complianceRegister.upsert({
      where: { id: REGISTER_ID },
      create: { id: REGISTER_ID, ...data, updatedBy: "runtime-script" },
      update: { ...data, updatedBy: "runtime-script" },
    })
    console.log(`Updated compliance register fields: ${keys.join(", ")}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => { console.error(e); process.exit(1) })
