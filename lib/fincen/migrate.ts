/**
 * Migration of subfrost-admin's FinCEN JSON collections (form-107 / sar / ctr
 * drafts + submissions) into subfrost.io's FincenDraft / FincenSubmission. Pure
 * parse/map/validate here; the DB effects are injected for tests (mirrors
 * lib/fuel/migrate.ts). Idempotent by SOURCE id — preserving ids keeps the
 * draft→submission FK and makes re-runs no-ops. data is opaque Json (never log it).
 */
import { Form107Schema, SarSchema, CtrSchema } from "@/lib/fincen/schemas"

type SourceType = "form-107" | "sar" | "ctr"
type TargetType = "FORM107" | "SAR" | "CTR"

interface SourceDraft { id: string; type: SourceType; data: unknown; updatedAt: string; updatedBy: string }
interface SourceSubmission {
  id: string; draftId: string; type: SourceType; submittedAt: string; submittedBy: string
  trackingId: string; status: "queued" | "accepted" | "rejected"; message?: string
}

export interface DraftLoadRow { id: string; type: TargetType; data: unknown; updatedBy: string }
export interface SubmissionLoadRow {
  id: string; draftId: string; type: TargetType; trackingId: string
  status: "QUEUED" | "ACCEPTED" | "REJECTED"; message: string | null; submittedBy: string; submittedAt: string
}

const TYPE_MAP: Record<string, TargetType> = { "form-107": "FORM107", sar: "SAR", ctr: "CTR" }
const SUB_STATUS_MAP: Record<string, SubmissionLoadRow["status"]> = { queued: "QUEUED", accepted: "ACCEPTED", rejected: "REJECTED" }

export function mapFincenType(t: SourceType): TargetType {
  const v = TYPE_MAP[t]
  if (!v) throw new Error(`unknown fincen type: ${t}`)
  return v
}

function readArr(text?: string): unknown[] {
  if (!text || !text.trim()) return []
  const p = JSON.parse(text)
  return Array.isArray(p) ? p : [p]
}

function mapDraft(d: SourceDraft): DraftLoadRow {
  return { id: d.id, type: mapFincenType(d.type), data: d.data, updatedBy: d.updatedBy }
}

function mapSubmission(s: SourceSubmission): SubmissionLoadRow {
  const status = SUB_STATUS_MAP[s.status]
  if (!status) throw new Error(`unknown submission status: ${s.status}`)
  return {
    id: s.id, draftId: s.draftId, type: mapFincenType(s.type), trackingId: s.trackingId,
    status, message: s.message ?? null, submittedBy: s.submittedBy, submittedAt: s.submittedAt,
  }
}

/** Parse the 4 source collection files (each as raw JSON text). form-107 is a
 *  singleton (array-of-one); sar/ctr/submissions are arrays. Missing/empty → []. */
export function parseFincenDumps(input: {
  form107?: string; sar?: string; ctr?: string; submissions?: string
}): { drafts: DraftLoadRow[]; submissions: SubmissionLoadRow[] } {
  const drafts: DraftLoadRow[] = [
    ...(readArr(input.form107) as SourceDraft[]).map(mapDraft),
    ...(readArr(input.sar) as SourceDraft[]).map(mapDraft),
    ...(readArr(input.ctr) as SourceDraft[]).map(mapDraft),
  ]
  const submissions = (readArr(input.submissions) as SourceSubmission[]).map(mapSubmission)
  return { drafts, submissions }
}

/** Validate each draft's data against the io zod schema; return warnings (never throws). */
export function validateFincenDrafts(drafts: DraftLoadRow[]): string[] {
  const schemaFor = { FORM107: Form107Schema, SAR: SarSchema, CTR: CtrSchema }
  const warnings: string[] = []
  for (const d of drafts) {
    const res = schemaFor[d.type].safeParse(d.data)
    if (!res.success) warnings.push(`draft ${d.id} (${d.type}) failed validation`)
  }
  return warnings
}

export interface FincenMigrateResult { drafts: number; submissions: number }

export async function migrateFincen(
  drafts: DraftLoadRow[],
  submissions: SubmissionLoadRow[],
  opts: {
    upsertDraft?: (d: DraftLoadRow) => Promise<void>
    upsertSubmission?: (s: SubmissionLoadRow) => Promise<void>
  } = {},
): Promise<FincenMigrateResult> {
  const def = (!opts.upsertDraft || !opts.upsertSubmission) ? await defaultEffects() : null
  const upsertDraft = opts.upsertDraft ?? def!.upsertDraft
  const upsertSubmission = opts.upsertSubmission ?? def!.upsertSubmission
  for (const d of drafts) await upsertDraft(d) // drafts before submissions (FK)
  for (const s of submissions) await upsertSubmission(s)
  return { drafts: drafts.length, submissions: submissions.length }
}

async function defaultEffects() {
  const prisma = (await import("@/lib/prisma")).default
  const asJson = (v: unknown) => v as never // Prisma.InputJsonValue at the call site
  return {
    upsertDraft: async (d: DraftLoadRow) => {
      await prisma.fincenDraft.upsert({
        where: { id: d.id },
        create: { id: d.id, type: d.type, data: asJson(d.data), updatedBy: d.updatedBy },
        update: { type: d.type, data: asJson(d.data), updatedBy: d.updatedBy },
      })
    },
    upsertSubmission: async (s: SubmissionLoadRow) => {
      await prisma.fincenSubmission.upsert({
        where: { id: s.id },
        create: {
          id: s.id, draftId: s.draftId, type: s.type, trackingId: s.trackingId,
          status: s.status, message: s.message, submittedBy: s.submittedBy, submittedAt: new Date(s.submittedAt),
        },
        update: {
          draftId: s.draftId, type: s.type, trackingId: s.trackingId,
          status: s.status, message: s.message, submittedBy: s.submittedBy, submittedAt: new Date(s.submittedAt),
        },
      })
    },
  }
}
