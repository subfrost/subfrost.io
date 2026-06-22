/**
 * Migration of subfrost-app's fuel_allocations into subfrost.io's FuelAllocation.
 * Parses a JSON snapshot (produced by scripts/dump-fuel-allocations.ts) into
 * FuelEntry[] and loads it in <=MAX_ENTRIES chunks via the admin's address-keyed
 * upsert. The snapshot keeps every source column (incl. timestamps) for
 * recoverability; only address/amount/note are loaded — upsertAllocations owns
 * validation/normalization, so the import writes data exactly like the admin UI.
 *
 * Pure here (parse + chunk); the DB effect is injected. The default upsert is a
 * lazy relative dynamic import so this module stays import-pure and tsx-runnable.
 * Runnable entrypoint: scripts/migrate-fuel-data.ts.
 */
import type { FuelEntry } from "./admin"

interface SourceRow {
  address: string
  amount: number
  note?: string | null
}

/** Map a JSON snapshot array → FuelEntry[]. Ignores id/timestamps (kept in the
 *  snapshot for recoverability). Throws on non-array or malformed JSON. */
export function parseFuelDump(jsonText: string): FuelEntry[] {
  const parsed = JSON.parse(jsonText)
  if (!Array.isArray(parsed)) {
    throw new Error("fuel dump must be a JSON array of allocation rows")
  }
  return (parsed as SourceRow[]).map((r) => ({
    address: r.address,
    amount: r.amount,
    note: r.note ?? null,
  }))
}

export interface MigrateResult {
  total: number
  chunks: number
}

/** Upsert entries in <=chunkSize batches (default 500, the upsertAllocations
 *  MAX_ENTRIES cap), summing counts. The upsert effect is injected for testing;
 *  the default lazily imports the real address-keyed admin upsert. Idempotent. */
export async function migrateFuelAllocations(
  entries: FuelEntry[],
  opts: {
    chunkSize?: number
    upsert?: (entries: FuelEntry[]) => Promise<{ count: number }>
  } = {},
): Promise<MigrateResult> {
  const chunkSize = opts.chunkSize ?? 500
  const upsert = opts.upsert ?? (await import("./admin")).upsertAllocations

  let total = 0
  let chunks = 0
  for (let i = 0; i < entries.length; i += chunkSize) {
    const chunk = entries.slice(i, i + chunkSize)
    const { count } = await upsert(chunk)
    total += count
    chunks += 1
  }
  return { total, chunks }
}
