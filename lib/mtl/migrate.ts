/**
 * Migration of subfrost-admin's `mtl-state` JSON (singleton {entries:[]}) into
 * subfrost.io's MtlEntry. Pure parse/map here; the DB effect is injected for
 * tests (mirrors lib/fuel/migrate.ts). Idempotent by `state` (PK).
 * Runnable entrypoint: scripts/migrate-compliance-data.ts.
 */
import type { MtlStatusValue } from "./schema"

interface SourceMtlEntry {
  state: string
  name: string
  status: string
  nextFilingDue?: string
  portalUrl?: string
  notes?: string
}

export interface MtlLoadRow {
  state: string
  name: string
  status: MtlStatusValue
  nextFilingDue: string | null
  portalUrl: string | null
  notes: string | null
}

const STATUS_MAP: Record<string, MtlStatusValue> = {
  "agent-of-stripe": "AGENT_OF_STRIPE",
  registered: "REGISTERED",
  "filed-pending": "FILED_PENDING",
  exempt: "EXEMPT",
  "not-yet-needed": "NOT_YET_NEEDED",
  "needs-filing": "NEEDS_FILING",
}

export function mapMtlStatus(kebab: string): MtlStatusValue {
  const v = STATUS_MAP[kebab]
  if (!v) throw new Error(`unknown MTL status: ${kebab}`)
  return v
}

/** Parse the `mtl-state` snapshot. The store writes a singleton as an array-of-one
 *  ([{entries:[]}]); accept that or the bare {entries:[]} object. */
export function parseMtlDump(jsonText: string): MtlLoadRow[] {
  const parsed = JSON.parse(jsonText)
  const state = (Array.isArray(parsed) ? parsed[0] : parsed) as { entries?: SourceMtlEntry[] } | undefined
  if (!state || !Array.isArray(state.entries)) {
    throw new Error("mtl dump must contain an entries array ([{entries:[]}] or {entries:[]})")
  }
  return state.entries.map((e) => ({
    state: e.state,
    name: e.name,
    status: mapMtlStatus(e.status),
    nextFilingDue: e.nextFilingDue ?? null,
    portalUrl: e.portalUrl ?? null,
    notes: e.notes ?? null,
  }))
}

export interface MtlMigrateResult {
  total: number
}

export async function migrateMtl(
  rows: MtlLoadRow[],
  opts: { upsertRow?: (r: MtlLoadRow) => Promise<void> } = {},
): Promise<MtlMigrateResult> {
  const upsertRow = opts.upsertRow ?? (await defaultUpsertRow())
  for (const r of rows) await upsertRow(r)
  return { total: rows.length }
}

async function defaultUpsertRow(): Promise<(r: MtlLoadRow) => Promise<void>> {
  const prisma = (await import("@/lib/prisma")).default
  return async (r: MtlLoadRow) => {
    await prisma.mtlEntry.upsert({
      where: { state: r.state },
      create: { state: r.state, name: r.name, status: r.status, nextFilingDue: r.nextFilingDue, portalUrl: r.portalUrl, notes: r.notes },
      update: { name: r.name, status: r.status, nextFilingDue: r.nextFilingDue, portalUrl: r.portalUrl, notes: r.notes },
    })
  }
}
