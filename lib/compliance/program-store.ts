// Prisma-backed store for the five BSA program pillars. Seeded once from the
// static PROGRAM_PILLARS (lib/compliance/program.ts), then editable in the UI so
// a gap can be closed without a code deploy. Reached only through
// actions/cms/compliance.ts (gated on aml.read / aml.edit).

import prisma from "@/lib/prisma"
import { PROGRAM_PILLARS, type PillarStatus } from "./program"

export class ProgramError extends Error {}

export const PILLAR_STATUSES: PillarStatus[] = ["OK", "PARTIAL", "GAP"]

export interface ProgramItemRow {
  key: string
  title: string
  status: PillarStatus
  detail: string
  action: string | null
  sortOrder: number
  updatedBy: string | null
  updatedAt: string
}

type DbRow = {
  key: string; title: string; status: string; detail: string; action: string | null
  sortOrder: number; updatedBy: string | null; updatedAt: Date
}

function map(r: DbRow): ProgramItemRow {
  return {
    key: r.key, title: r.title, status: r.status as PillarStatus, detail: r.detail,
    action: r.action, sortOrder: r.sortOrder, updatedBy: r.updatedBy,
    updatedAt: r.updatedAt.toISOString(),
  }
}

/** List pillars in display order. Empty until seeded. */
export async function listProgramItems(): Promise<ProgramItemRow[]> {
  const rows = await prisma.complianceProgramItem.findMany({ orderBy: { sortOrder: "asc" } })
  return rows.map((r) => map(r as DbRow))
}

/** Idempotent seed from the static pillars — only creates missing keys. */
export async function seedProgramItems(): Promise<{ created: number }> {
  const existing = await prisma.complianceProgramItem.findMany({ select: { key: true } })
  const have = new Set(existing.map((e) => e.key))
  const missing = PROGRAM_PILLARS
    .map((p, i) => ({ p, sortOrder: i }))
    .filter(({ p }) => !have.has(p.key))
  if (missing.length === 0) return { created: 0 }
  const result = await prisma.complianceProgramItem.createMany({
    data: missing.map(({ p, sortOrder }) => ({
      key: p.key, title: p.title, status: p.status, detail: p.detail,
      action: p.action ?? null, sortOrder,
    })),
  })
  return { created: result.count }
}

export interface ProgramItemUpdate {
  status: PillarStatus
  detail: string
  action?: string | null
}

export async function updateProgramItem(
  key: string,
  input: ProgramItemUpdate,
  updatedBy: string,
): Promise<ProgramItemRow> {
  if (!PILLAR_STATUSES.includes(input.status)) throw new ProgramError(`Invalid status: ${input.status}`)
  const detail = input.detail?.trim()
  if (!detail) throw new ProgramError("Detail is required")
  const existing = await prisma.complianceProgramItem.findUnique({ where: { key } })
  if (!existing) throw new ProgramError("Program item not found")
  const saved = await prisma.complianceProgramItem.update({
    where: { key },
    data: { status: input.status, detail, action: input.action?.trim() || null, updatedBy },
  })
  return map(saved as DbRow)
}
