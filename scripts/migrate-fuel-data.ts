/**
 * Load a fuel_allocations snapshot into subfrost.io's FuelAllocation. Parse/load
 * logic lives in ../lib/fuel/migrate (unit-tested); this is the thin runnable shell.
 *
 * Usage (run from the repo root):
 *   # validate the snapshot without touching any DB (no DATABASE_URL needed):
 *   npx tsx scripts/migrate-fuel-data.ts --dry-run
 *
 *   # real load (DATABASE_URL = subfrost.io target DB, via the io cloud-sql-proxy):
 *   npx tsx scripts/migrate-fuel-data.ts
 *
 *   # custom snapshot path:
 *   npx tsx scripts/migrate-fuel-data.ts <snapshot.json>
 *
 * Idempotent: upserts by address (source wins). Safe to re-run.
 */
import { readFileSync } from "fs"
import { parseFuelDump, migrateFuelAllocations } from "../lib/fuel/migrate"

const DEFAULT_DUMP = "../.bestary-extracted/dump/fuel_allocations.json"

async function main() {
  const args = process.argv.slice(2)
  const dryRun = args.includes("--dry-run")
  const dumpPath = args.filter((a) => !a.startsWith("--"))[0] ?? process.env.FUEL_DUMP_JSON ?? DEFAULT_DUMP

  console.log(`Reading FUEL snapshot ← ${dumpPath}`)
  const entries = parseFuelDump(readFileSync(dumpPath, "utf-8"))
  const totalAmount = entries.reduce((s, e) => s + e.amount, 0)
  console.log(`\nParsed: ${entries.length} allocations, total amount = ${totalAmount}`)
  console.log("Sample:", entries.slice(0, 3))

  if (dryRun) {
    console.log("\n[dry-run] parsed cleanly; no database writes performed.")
    return
  }

  if (!process.env.DATABASE_URL) {
    throw new Error("DATABASE_URL is required for a real load (use --dry-run to validate only).")
  }

  const { prisma } = await import("../lib/prisma")
  try {
    console.log("\nWriting to DATABASE_URL…")
    const res = await migrateFuelAllocations(entries)
    console.log(`\nDone: upserted ${res.total} allocations in ${res.chunks} chunk(s).`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
