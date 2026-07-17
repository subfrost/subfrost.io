// Prisma-backed store for the company obligation calendar. Reached only through
// actions/cms/compliance.ts (gated on aml.read / aml.edit). Pure vocab + helpers
// live in ./obligations-schema.ts; this module owns persistence, idempotent
// seeding, and the recurrence roll-forward.

import prisma from "@/lib/prisma"
import {
  ObligationUpsertSchema,
  OBLIGATION_SEED,
  nextOccurrence,
  type ObligationCategory,
  type ObligationCadence,
  type ObligationStatus,
} from "./obligations-schema"

export class ObligationError extends Error {}

export interface ObligationRow {
  id: string
  key: string
  title: string
  category: ObligationCategory
  authority: string | null
  description: string | null
  cadence: ObligationCadence
  dueDate: string | null
  status: ObligationStatus
  owner: string | null
  lastCompletedAt: string | null
  docUrl: string | null
  notes: string | null
  updatedAt: string
}

type DbRow = {
  id: string; key: string; title: string; category: string; authority: string | null
  description: string | null; cadence: string; dueDate: string | null; status: string
  owner: string | null; lastCompletedAt: string | null; docUrl: string | null
  notes: string | null; updatedAt: Date
}

function map(r: DbRow): ObligationRow {
  return {
    id: r.id, key: r.key, title: r.title,
    category: r.category as ObligationCategory,
    authority: r.authority, description: r.description,
    cadence: r.cadence as ObligationCadence,
    dueDate: r.dueDate, status: r.status as ObligationStatus,
    owner: r.owner, lastCompletedAt: r.lastCompletedAt, docUrl: r.docUrl,
    notes: r.notes, updatedAt: r.updatedAt.toISOString(),
  }
}

export async function listObligations(): Promise<ObligationRow[]> {
  const rows = await prisma.complianceObligation.findMany({
    orderBy: [{ status: "asc" }, { dueDate: "asc" }],
  })
  return rows.map((r) => map(r as DbRow))
}

/** Idempotent seed. Only creates missing keys — never overwrites an edited row. */
export async function seedObligations(): Promise<{ created: number }> {
  const existing = await prisma.complianceObligation.findMany({ select: { key: true } })
  const have = new Set(existing.map((e) => e.key))
  const missing = OBLIGATION_SEED.filter((s) => !have.has(s.key))
  if (missing.length === 0) return { created: 0 }
  const result = await prisma.complianceObligation.createMany({
    data: missing.map((s) => ({
      key: s.key, title: s.title, category: s.category, authority: s.authority,
      description: s.description, cadence: s.cadence, dueDate: s.dueDate,
      status: s.status, owner: s.owner, lastCompletedAt: s.lastCompletedAt ?? null,
      notes: s.notes ?? null,
    })),
  })
  return { created: result.count }
}

const clean = (v: string | null | undefined) => {
  const t = v?.trim()
  return t ? t : null
}

/** Create a new ad-hoc obligation with a generated key. */
export async function createObligation(input: unknown): Promise<ObligationRow> {
  const res = ObligationUpsertSchema.safeParse(input)
  if (!res.success) throw new ObligationError("Validation failed: " + JSON.stringify(res.error.issues))
  const d = res.data
  const slug = d.title.toLowerCase().replace(/[^a-z0-9]+/g, "-").replace(/^-|-$/g, "").slice(0, 40)
  const key = `custom-${slug || "obligation"}-${Date.now().toString(36)}`
  const saved = await prisma.complianceObligation.create({
    data: {
      key, title: d.title, category: d.category, authority: clean(d.authority),
      description: clean(d.description), cadence: d.cadence, dueDate: clean(d.dueDate),
      status: d.status, owner: clean(d.owner), lastCompletedAt: clean(d.lastCompletedAt),
      docUrl: clean(d.docUrl), notes: clean(d.notes),
    },
  })
  return map(saved as DbRow)
}

export async function updateObligation(id: string, input: unknown): Promise<ObligationRow> {
  const res = ObligationUpsertSchema.safeParse(input)
  if (!res.success) throw new ObligationError("Validation failed: " + JSON.stringify(res.error.issues))
  const existing = await prisma.complianceObligation.findUnique({ where: { id } })
  if (!existing) throw new ObligationError("Obligation not found")
  const d = res.data
  const saved = await prisma.complianceObligation.update({
    where: { id },
    data: {
      title: d.title, category: d.category, authority: clean(d.authority),
      description: clean(d.description), cadence: d.cadence, dueDate: clean(d.dueDate),
      status: d.status, owner: clean(d.owner), lastCompletedAt: clean(d.lastCompletedAt),
      docUrl: clean(d.docUrl), notes: clean(d.notes),
    },
  })
  return map(saved as DbRow)
}

export async function deleteObligation(id: string): Promise<void> {
  const existing = await prisma.complianceObligation.findUnique({ where: { id } })
  if (!existing) throw new ObligationError("Obligation not found")
  await prisma.complianceObligation.delete({ where: { id } })
}

/** Mark an obligation done. Recurring items roll forward to the next occurrence
 *  and reset to NOT_STARTED; one-time/as-needed items settle as COMPLETE. The
 *  completion date is stamped by the caller (server action) — passed in so this
 *  stays deterministic and testable. */
export async function completeObligation(id: string, completedISO: string): Promise<ObligationRow> {
  const existing = await prisma.complianceObligation.findUnique({ where: { id } })
  if (!existing) throw new ObligationError("Obligation not found")
  const cadence = existing.cadence as ObligationCadence
  const base = existing.dueDate ?? completedISO
  const rolled = nextOccurrence(base, cadence)
  const data = rolled
    ? { status: "NOT_STARTED" as const, dueDate: rolled, lastCompletedAt: completedISO }
    : { status: "COMPLETE" as const, lastCompletedAt: completedISO }
  const saved = await prisma.complianceObligation.update({ where: { id }, data })
  return map(saved as DbRow)
}
