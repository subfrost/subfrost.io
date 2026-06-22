/**
 * Acquire a snapshot of subfrost-app's fuel_allocations into a JSON file, so the
 * load (scripts/migrate-fuel-data.ts) can run idempotently without re-hitting the
 * source. Reads ALL columns (incl. timestamps) so the original data stays
 * recoverable even though the load only applies address/amount/note.
 *
 *   npx tsx scripts/dump-fuel-allocations.ts [outfile]
 *
 * Read-only on the source.
 *
 * ⚠️ DOES NOT WORK against subfrost-db as deployed: that instance is PRIVATE-IP-ONLY,
 * so a local cloud-sql-proxy cannot reach it ("instance does not have IP of type
 * PUBLIC"). This script is kept for a reachable source (public IP, or run inside the
 * VPC). The FUEL import (2026-06-21) was actually acquired via a server-side Cloud SQL
 * export → GCS → CSV → JSON; see docs/superpowers/runbooks/legacy-data-import.md §1.
 * It expects FUEL_SOURCE_DATABASE_URL pointing at a reachable proxied source.
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
