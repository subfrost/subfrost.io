/**
 * Acquire a snapshot of subfrost-app's fuel_allocations into a JSON file, so the
 * load (scripts/migrate-fuel-data.ts) can run idempotently without re-hitting the
 * source. Reads ALL columns (incl. timestamps) so the original data stays
 * recoverable even though the load only applies address/amount/note.
 *
 * Run from the repo root, with cloud-sql-proxy pointed at the bestary instance
 * (lithomantic-heaven-bestary:us-central1:subfrost-db) and FUEL_SOURCE_DATABASE_URL
 * set to the proxied source connection string:
 *
 *   npx tsx scripts/dump-fuel-allocations.ts [outfile]
 *
 * Read-only on the source.
 */
import { mkdirSync, writeFileSync } from "fs"
import { dirname } from "path"
import { PrismaClient } from "@prisma/client"

const DEFAULT_OUT = "../.bestary-extracted/dump/fuel_allocations.json"

interface FuelSourceRow {
  id: string
  address: string
  amount: number
  note: string | null
  created_at: Date
  updated_at: Date
}

async function main() {
  const outPath = process.argv.slice(2).filter((a) => !a.startsWith("--"))[0] ?? DEFAULT_OUT
  const url = process.env.FUEL_SOURCE_DATABASE_URL
  if (!url) {
    throw new Error("FUEL_SOURCE_DATABASE_URL is required (proxied subfrost-app source DB).")
  }

  const prisma = new PrismaClient({ datasourceUrl: url })
  try {
    const rows = await prisma.$queryRawUnsafe<FuelSourceRow[]>(
      "SELECT id, address, amount, note, created_at, updated_at FROM public.fuel_allocations ORDER BY address",
    )
    if (rows.length === 0) {
      console.warn("WARNING: source returned 0 rows — writing an empty snapshot.")
    }
    mkdirSync(dirname(outPath), { recursive: true })
    writeFileSync(outPath, JSON.stringify(rows, null, 2), "utf-8")
    const total = rows.reduce((s, r) => s + r.amount, 0)
    console.log(`Wrote ${rows.length} allocations (total amount ${total}) → ${outPath}`)
  } finally {
    await prisma.$disconnect()
  }
}

main().catch((e) => {
  console.error(e)
  process.exit(1)
})
