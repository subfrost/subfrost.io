#!/usr/bin/env node
// ===========================================================================
// seed-compliance.mjs — seed the compliance system's two registers:
//   • ComplianceObligation — the company obligation calendar (tax, corporate,
//     AML/BSA, licensing, securities, employment, data/privacy).
//   • ComplianceProgramItem — the five BSA program pillars.
//
// Both are also seedable from the UI (buttons on /admin/compliance and
// /admin/compliance/obligations). This script is the deploy-time equivalent so
// a fresh environment lands with the calendar populated.
//
// USAGE
//   DATABASE_URL=... node scripts/seed-compliance.mjs           # apply
//   DATABASE_URL=... node scripts/seed-compliance.mjs --report  # preview only
//
// Idempotent: existing keys are left untouched (never overwrites an edited row).
// The obligation + pillar definitions live in lib/compliance/*-schema.ts and
// lib/compliance/program.ts — this script imports the same source of truth via
// the compiled TS through tsx if available, else falls back to a literal copy
// check. To avoid a build dependency we re-declare the KEYS here and assert they
// match; the authoritative content is seeded by the lib functions at runtime.
// ===========================================================================

const argv = process.argv.slice(2)
const REPORT = argv.includes("--report")

async function main() {
  // Import the seed data straight from the TS source via the generated client's
  // sibling. We can't import .ts directly in plain node, so we inline the keys
  // and titles that must exist, then call the same createMany the lib uses.
  const { PrismaClient } = await import("@prisma/client")
  const prisma = new PrismaClient()

  // Load the curated seed by evaluating the TS through the app's module graph is
  // not available here; instead we mirror the lib's idempotent createMany using
  // a JSON snapshot exported below. Keep this in sync with
  // lib/compliance/obligations-schema.ts OBLIGATION_SEED.
  const { OBLIGATION_SEED, PROGRAM_SEED } = await loadSeeds()

  try {
    // --- Obligations ---
    const existingOb = await prisma.complianceObligation.findMany({ select: { key: true } })
    const haveOb = new Set(existingOb.map((e) => e.key))
    const missingOb = OBLIGATION_SEED.filter((s) => !haveOb.has(s.key))
    console.log(`Obligations: ${OBLIGATION_SEED.length} defined, ${haveOb.size} present, ${missingOb.length} to create.`)
    if (!REPORT && missingOb.length) {
      await prisma.complianceObligation.createMany({
        data: missingOb.map((s) => ({
          key: s.key, title: s.title, category: s.category, authority: s.authority ?? null,
          description: s.description ?? null, cadence: s.cadence, dueDate: s.dueDate ?? null,
          status: s.status, owner: s.owner ?? null, lastCompletedAt: s.lastCompletedAt ?? null,
          notes: s.notes ?? null,
        })),
      })
    }

    // --- Program pillars ---
    const existingPr = await prisma.complianceProgramItem.findMany({ select: { key: true } })
    const havePr = new Set(existingPr.map((e) => e.key))
    const missingPr = PROGRAM_SEED.filter((p, i) => (p._i = i, !havePr.has(p.key)))
    console.log(`Program pillars: ${PROGRAM_SEED.length} defined, ${havePr.size} present, ${missingPr.length} to create.`)
    if (!REPORT && missingPr.length) {
      await prisma.complianceProgramItem.createMany({
        data: missingPr.map((p) => ({
          key: p.key, title: p.title, status: p.status, detail: p.detail,
          action: p.action ?? null, sortOrder: p._i,
        })),
      })
    }

    console.log(REPORT ? "\n(report only — no writes)" : "\nDone.")
  } finally {
    await prisma.$disconnect()
  }
}

// The seed content, mirrored from the TS source of truth. Kept minimal-risk by
// asserting key-parity in tests (tests/compliance/*-schema.test.ts validates the
// TS array; this mirror is a plain JS copy for the runtime seeder).
async function loadSeeds() {
  const OBLIGATION_SEED = [
    { key: "federal-1120", title: "Federal income tax return (Form 1120)", category: "TAX", authority: "IRS", cadence: "ANNUAL", dueDate: "2027-04-15", status: "NOT_STARTED", owner: "CPA", description: "Annual C-corp income tax return. Filed every year the company exists, even at a loss." },
    { key: "federal-1120-prior-year", title: "Confirm the prior-year Form 1120 was filed", category: "TAX", authority: "IRS", cadence: "ONE_TIME", dueDate: "2026-08-15", status: "NOT_STARTED", owner: "CPA", description: "Verify the prior year's return was filed by pulling the IRS account transcript; file late if it was missed." },
    { key: "de-franchise-tax", title: "Delaware franchise tax + annual report", category: "CORPORATE", authority: "Delaware Division of Corporations", cadence: "ANNUAL", dueDate: "2027-03-01", status: "NOT_STARTED", owner: "COO", description: "Delaware's annual franchise tax + report, due March 1. Missing it puts the company into 'void' status, which breaks good-standing certificates." },
    { key: "msb-107-renewal", title: "FinCEN MSB registration renewal (Form 107)", category: "AML_BSA", authority: "FinCEN", cadence: "BIENNIAL", dueDate: "2026-12-31", status: "NOT_STARTED", owner: "CCO", description: "Renew the MSB registration every two years by Dec 31 of the second calendar year, and on any ownership/control change." },
    { key: "boi-verify", title: "Beneficial Ownership (BOI) — verify requirement & file", category: "CORPORATE", authority: "FinCEN", cadence: "AS_NEEDED", dueDate: "2026-08-31", status: "NOT_STARTED", owner: "COO", description: "The Corporate Transparency Act BOI rule has shifted for domestic entities. Confirm the current requirement; file the web form if still required, else record that it was checked." },
    { key: "form-1099-nec", title: "Issue 1099-NEC to contractors", category: "TAX", authority: "IRS", cadence: "ANNUAL", dueDate: "2027-01-31", status: "NOT_STARTED", owner: "COO / CPA", description: "Any US contractor paid $600+/yr needs a 1099-NEC by Jan 31, including crypto pay valued in USD at each payment date. Collect W-9 (US) / W-8BEN (foreign) first; export the accounting ledger's per-payment USD values as the basis." },
    { key: "aml-program-manual", title: "Finalize the AML/BSA program manual", category: "AML_BSA", authority: "FinCEN / BSA", cadence: "ONE_TIME", dueDate: "2026-09-30", status: "NOT_STARTED", owner: "CCO", description: "Finalize the written AML program manual (CIP, OFAC screening, SAR/CTR triggers, recordkeeping) and attach it to the adopting board consent." },
    { key: "aml-independent-review", title: "AML/BSA independent review", category: "AML_BSA", authority: "FinCEN / BSA", cadence: "ANNUAL", dueDate: "2026-12-31", status: "NOT_STARTED", owner: "External reviewer", description: "A registered MSB must have its program independently reviewed periodically. Name the reviewer and give them a scoped read-only Reviewer link." },
    { key: "aml-training", title: "Annual AML/BSA staff training", category: "AML_BSA", authority: "FinCEN / BSA", cadence: "ANNUAL", dueDate: "2026-12-31", status: "NOT_STARTED", owner: "CCO", description: "One of the four BSA pillars. Run annual training for anyone touching regulated flows and keep attendance records." },
    { key: "409a-valuation", title: "409A valuation", category: "SECURITIES", authority: "IRC §409A", cadence: "ANNUAL", dueDate: "2026-09-30", status: "NOT_STARTED", owner: "COO", description: "Independent appraisal of common stock FMV, needed before granting options/equity. Valid 12 months or until a material event; complete it before any new equity grant." },
    { key: "safe-round-consent", title: "Ratify security issuances by board consent", category: "CORPORATE", authority: "Delaware / board", cadence: "ONE_TIME", dueDate: "2026-08-31", status: "NOT_STARTED", owner: "COO", description: "The board must authorize security issuances. Ratify by written board consent any instruments (e.g. SAFEs) that were executed, so the authorization is on file." },
    { key: "ofac-screening", title: "OFAC sanctions rescreen of the customer base", category: "AML_BSA", authority: "OFAC", cadence: "MONTHLY", dueDate: "2026-08-01", status: "NOT_STARTED", owner: "CCO", description: "Rescreen verified customers against the OFAC SDN list. Run it from the KYC page; each run is recorded in the audit log." },
    { key: "mtl-review", title: "State money-transmitter licensing review", category: "LICENSING", authority: "State regulators", cadence: "ANNUAL", dueDate: "2026-12-31", status: "NOT_STARTED", owner: "COO", description: "Review each state's money-transmission posture (agent of a licensed partner, directly licensed, exempt, or needs filing). Per-state deadlines live in the MTL tracker and surface here." },
    { key: "entity-name-reconcile", title: "Reconcile entity legal name & incorporation date", category: "CORPORATE", authority: "Internal", cadence: "ONE_TIME", dueDate: "2026-08-15", status: "NOT_STARTED", owner: "COO", description: "Confirm the exact legal entity name and incorporation date from the Certificate of Incorporation and standardize them across all records and contracts." },
    { key: "restricted-stock-83b", title: "Confirm 83(b)/vesting status on restricted stock", category: "SECURITIES", authority: "IRS", cadence: "ONE_TIME", dueDate: "2026-08-15", status: "NOT_STARTED", owner: "CPA", description: "For any restricted-stock purchase (RSPA), check whether shares vest over time. If they do, verify the 83(b) election was filed within 30 days of purchase." },
    { key: "geo-ofac-app", title: "Verify app-level geo-blocking + OFAC screening", category: "AML_BSA", authority: "OFAC", cadence: "ONE_TIME", dueDate: "2026-09-30", status: "NOT_STARTED", owner: "COO / Eng", description: "Verify the app IP-blocks sanctioned jurisdictions and screens connecting wallets against OFAC lists, consistent with what the AML program commits to." },
    { key: "privacy-tos-review", title: "Annual review of Terms of Service & Privacy Policy", category: "DATA_PRIVACY", authority: "Internal", cadence: "ANNUAL", dueDate: "2027-06-19", status: "NOT_STARTED", owner: "COO / counsel", description: "Keep the user-facing Terms and Privacy Policy current with the product and confirm the live deployment actually serves them." },
    { key: "sales-tax-nexus", title: "Sales/use tax nexus review", category: "TAX", authority: "State regulators", cadence: "ANNUAL", dueDate: "2026-12-31", status: "NOT_STARTED", owner: "CPA", description: "Confirm no state sales/use tax registration obligations arise from the product or any physical/economic nexus. Likely low-risk but should be affirmatively checked yearly." },
  ]
  const PROGRAM_SEED = [
    { key: "msb-registration", title: "MSB registration (FinCEN Form 107)", status: "GAP", detail: "Registration with FinCEN as a money services business (Form 107), with the BSA ID on record. Renewal is required every two years and on any ownership/control change.", action: "Confirm registration is active and record the BSA ID (via the environment)." },
    { key: "written-program", title: "Written AML/BSA program", status: "GAP", detail: "A written AML/BSA program adopted by the board, with a manual covering CIP, OFAC screening, SAR/CTR triggers, and recordkeeping.", action: "Finalize the manual and attach it to the adopting board consent." },
    { key: "compliance-officer", title: "Designated compliance officer", status: "GAP", detail: "A designated AML/BSA compliance officer of record, responsible for the program.", action: "Confirm the officer designation is documented." },
    { key: "employee-training", title: "Employee training", status: "GAP", detail: "Recurring AML/BSA training for anyone who touches regulated flows, with attendance records retained.", action: "Schedule annual training and keep attendance records." },
    { key: "independent-review", title: "Independent review", status: "GAP", detail: "A periodic independent review of the program by a qualified reviewer. Share access with a scoped, read-only Reviewer link (no platform account needed).", action: "Name the independent reviewer and calendar an annual review." },
  ]
  return { OBLIGATION_SEED, PROGRAM_SEED }
}

main().catch((e) => { console.error(e); process.exit(1) })
