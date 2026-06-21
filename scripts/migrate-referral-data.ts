/**
 * Migrate the referral graph (invite codes + redemptions) from subfrost-app's
 * Postgres dump into subfrost.io's DB. Parsing/loading logic lives in
 * `../lib/referral/migrate` (unit-tested); this is the thin runnable shell.
 *
 * Usage (run from the repo root):
 *   # validate the dumps without touching any DB (no DATABASE_URL needed):
 *   npx tsx scripts/migrate-referral-data.ts --dry-run
 *
 *   # real migration (requires DATABASE_URL pointing at subfrost.io's DB,
 *   # with the schema already deployed):
 *   npx tsx scripts/migrate-referral-data.ts
 *
 *   # custom dump paths:
 *   npx tsx scripts/migrate-referral-data.ts <codes.sql> <redemptions.sql>
 *
 * Idempotent: codes upsert by id, redemptions skipDuplicates. Safe to re-run.
 */
import { readFileSync } from "fs"
import { parseInviteCodes, parseRedemptions, loadReferralData } from "../lib/referral/migrate"

const DEFAULT_CODES = "../.bestary-extracted/dump/invite_codes.sql"
const DEFAULT_REDEMPTIONS = "../.bestary-extracted/dump/invite_code_redemptions.sql"

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const paths = args.filter((a) => !a.startsWith("--"))
  const codesPath = paths[0] ?? process.env.REFERRAL_CODES_SQL ?? DEFAULT_CODES
  const redemptionsPath = paths[1] ?? process.env.REFERRAL_REDEMPTIONS_SQL ?? DEFAULT_REDEMPTIONS

  console.log(`Reading codes      ← ${codesPath}`)
  console.log(`Reading redemptions ← ${redemptionsPath}`)
  const codes = parseInviteCodes(readFileSync(codesPath, "utf-8"))
  const redemptions = parseRedemptions(readFileSync(redemptionsPath, "utf-8"))

  const codeIds = new Set(codes.map((c) => c.id))
  const roots = codes.filter((c) => !c.parentCodeId).length
  const orphans = redemptions.filter((r) => !codeIds.has(r.codeId)).length
  console.log("\nParsed:")
  console.log(`  invite codes:        ${codes.length} (${roots} root, ${codes.length - roots} child)`)
  console.log(`  redemptions:         ${redemptions.length} (${orphans} orphaned → will be skipped)`)

  if (dryRun) {
    console.log("\n[dry-run] parsed cleanly; no database writes performed.")
    return
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for a real migration (use --dry-run to validate only).")
  }

  const { prisma } = await import("../lib/prisma")
  try {
    console.log("\nWriting to DATABASE_URL…")
    const result = await loadReferralData(prisma, { codes, redemptions })
    console.log("\nDone:")
    console.log(`  codes upserted:      ${result.codes}`)
    console.log(`  redemptions inserted: ${result.redemptions}`)
    console.log(`  orphans skipped:     ${result.orphaned}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
