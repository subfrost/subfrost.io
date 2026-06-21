/** MTL licensing tracker persistence. Reached through actions/cms/mtl.ts (gated
 *  on MANAGE_AML). Keyed by 2-letter state code; the 51 jurisdictions are seeded
 *  idempotently. Ported from subfrost-admin's JSON-store MTL to Prisma. */
import prisma from "@/lib/prisma"
import { MtlUpsertSchema, STATE_SEED } from "@/lib/mtl/schema"

export class MtlError extends Error {}

export interface MtlRow {
  state: string
  name: string
  status: string
  nextFilingDue: string | null
  portalUrl: string | null
  notes: string | null
  updatedAt: string
}

type DbRow = { state: string; name: string; status: string; nextFilingDue: string | null; portalUrl: string | null; notes: string | null; updatedAt: Date }
const map = (r: DbRow): MtlRow => ({ state: r.state, name: r.name, status: r.status, nextFilingDue: r.nextFilingDue, portalUrl: r.portalUrl, notes: r.notes, updatedAt: r.updatedAt.toISOString() })

export async function listEntries(): Promise<MtlRow[]> {
  const rows = await prisma.mtlEntry.findMany({ orderBy: { state: "asc" } })
  return rows.map((r) => map(r as DbRow))
}

export async function seedStates(): Promise<{ created: number }> {
  const existing = await prisma.mtlEntry.findMany({ select: { state: true } })
  const have = new Set(existing.map((e) => e.state))
  const missing = STATE_SEED.filter((s) => !have.has(s.state))
  if (missing.length === 0) return { created: 0 }
  await prisma.mtlEntry.createMany({ data: missing.map((s) => ({ state: s.state, name: s.name })) })
  return { created: missing.length }
}

export async function upsertEntry(state: string, input: unknown): Promise<MtlRow> {
  const res = MtlUpsertSchema.safeParse(input)
  if (!res.success) throw new MtlError("Validation failed: " + JSON.stringify(res.error.issues))
  const existing = await prisma.mtlEntry.findUnique({ where: { state } })
  if (!existing) throw new MtlError(`Unknown jurisdiction: ${state}`)
  const { status, nextFilingDue, portalUrl, notes } = res.data
  const saved = await prisma.mtlEntry.update({ where: { state }, data: { status, nextFilingDue, portalUrl, notes } })
  return map(saved as DbRow)
}
