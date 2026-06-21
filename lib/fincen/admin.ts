/**
 * FinCEN/BSA draft + submission persistence on Prisma. Reached only through
 * `actions/cms/fincen.ts` (gated on MANAGE_AML). Form 107 is a singleton draft;
 * SAR/CTR are many. Real BSA E-Filing transport is deferred — `queueSubmission`
 * records a QUEUED row with a LOCAL tracking id so the audit trail + UI light up.
 * Mirrors the admin's lib/bsa.ts storage shape, swapped from the JSON store to
 * Prisma Json columns.
 */
import prisma from "@/lib/prisma"
import type { Prisma } from "@prisma/client"
import {
  Form107Schema, SarSchema, CtrSchema,
  type Form107, type Sar, type Ctr,
} from "@/lib/fincen/schemas"

export class FincenError extends Error {}

export type FincenType = "FORM107" | "SAR" | "CTR"

export interface DraftRow<T> {
  id: string
  type: FincenType
  data: T
  updatedBy: string
  updatedAt: string
}

export interface SubmissionRow {
  id: string
  draftId: string
  type: FincenType
  trackingId: string
  status: string
  message: string | null
  submittedBy: string
  submittedAt: string
}

type DbDraft = { id: string; type: string; data: unknown; updatedBy: string; updatedAt: Date }

function mapDraft<T>(d: DbDraft): DraftRow<T> {
  return { id: d.id, type: d.type as FincenType, data: d.data as T, updatedBy: d.updatedBy, updatedAt: d.updatedAt.toISOString() }
}

function parseOrThrow<T>(schema: { safeParse: (i: unknown) => { success: boolean; data?: T; error?: unknown } }, input: unknown): T {
  const res = schema.safeParse(input)
  if (!res.success) throw new FincenError("Validation failed: " + JSON.stringify((res.error as { issues?: unknown })?.issues ?? res.error))
  return res.data as T
}

const asJson = (v: unknown) => v as Prisma.InputJsonValue

// --- Form 107 (singleton) ---

export async function getForm107(): Promise<DraftRow<Form107> | null> {
  const d = await prisma.fincenDraft.findFirst({ where: { type: "FORM107" } })
  return d ? mapDraft<Form107>(d as DbDraft) : null
}

export async function saveForm107(input: unknown, updatedBy: string): Promise<DraftRow<Form107>> {
  const data = parseOrThrow<Form107>(Form107Schema, input)
  const existing = await prisma.fincenDraft.findFirst({ where: { type: "FORM107" } })
  const saved = existing
    ? await prisma.fincenDraft.update({ where: { id: existing.id }, data: { data: asJson(data), updatedBy } })
    : await prisma.fincenDraft.create({ data: { type: "FORM107", data: asJson(data), updatedBy } })
  return mapDraft<Form107>(saved as DbDraft)
}

// --- SAR (many) ---

export async function listSar(): Promise<DraftRow<Sar>[]> {
  const rows = await prisma.fincenDraft.findMany({ where: { type: "SAR" }, orderBy: { updatedAt: "desc" } })
  return rows.map((r) => mapDraft<Sar>(r as DbDraft))
}
export async function createSar(input: unknown, updatedBy: string): Promise<DraftRow<Sar>> {
  const data = parseOrThrow<Sar>(SarSchema, input)
  const saved = await prisma.fincenDraft.create({ data: { type: "SAR", data: asJson(data), updatedBy } })
  return mapDraft<Sar>(saved as DbDraft)
}
export async function updateSar(id: string, input: unknown, updatedBy: string): Promise<DraftRow<Sar>> {
  const data = parseOrThrow<Sar>(SarSchema, input)
  const saved = await prisma.fincenDraft.update({ where: { id }, data: { data: asJson(data), updatedBy } })
  return mapDraft<Sar>(saved as DbDraft)
}

// --- CTR (many) ---

export async function listCtr(): Promise<DraftRow<Ctr>[]> {
  const rows = await prisma.fincenDraft.findMany({ where: { type: "CTR" }, orderBy: { updatedAt: "desc" } })
  return rows.map((r) => mapDraft<Ctr>(r as DbDraft))
}
export async function createCtr(input: unknown, updatedBy: string): Promise<DraftRow<Ctr>> {
  const data = parseOrThrow<Ctr>(CtrSchema, input)
  const saved = await prisma.fincenDraft.create({ data: { type: "CTR", data: asJson(data), updatedBy } })
  return mapDraft<Ctr>(saved as DbDraft)
}
export async function updateCtr(id: string, input: unknown, updatedBy: string): Promise<DraftRow<Ctr>> {
  const data = parseOrThrow<Ctr>(CtrSchema, input)
  const saved = await prisma.fincenDraft.update({ where: { id }, data: { data: asJson(data), updatedBy } })
  return mapDraft<Ctr>(saved as DbDraft)
}

// --- Submissions (queued; real BSA transport deferred) ---

type DbSubmission = { id: string; draftId: string; type: string; trackingId: string; status: string; message: string | null; submittedBy: string; submittedAt: Date }

function mapSubmission(s: DbSubmission): SubmissionRow {
  return { id: s.id, draftId: s.draftId, type: s.type as FincenType, trackingId: s.trackingId, status: s.status, message: s.message, submittedBy: s.submittedBy, submittedAt: s.submittedAt.toISOString() }
}

export async function listSubmissions(): Promise<SubmissionRow[]> {
  const rows = await prisma.fincenSubmission.findMany({ orderBy: { submittedAt: "desc" } })
  return rows.map((r) => mapSubmission(r as DbSubmission))
}

export async function queueSubmission(draftId: string, submittedBy: string): Promise<SubmissionRow> {
  const draft = await prisma.fincenDraft.findUnique({ where: { id: draftId } })
  if (!draft) throw new FincenError("Draft not found")
  const trackingId = `LOCAL-${Math.random().toString(36).slice(2, 10).toUpperCase()}`
  const saved = await prisma.fincenSubmission.create({
    data: {
      draftId,
      type: draft.type,
      trackingId,
      status: "QUEUED",
      message: "Queued locally. Awaiting BSA E-Filing credential mount + transport.",
      submittedBy,
    },
  })
  return mapSubmission(saved as DbSubmission)
}
