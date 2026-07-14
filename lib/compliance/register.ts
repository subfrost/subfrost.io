// The compliance register: the program's identity/registration facts (legal
// entity, MSB registration id + tracking, compliance officer). A DB-backed
// singleton (id "default"), UI-editable via actions/cms/compliance.ts. Kept in
// the database — never in this public repo — so the confidential values live
// only in the running (auth-gated) app. Reached through the aml.read/aml.edit
// gated actions.

import prisma from "@/lib/prisma"
import { z } from "zod"

export class RegisterError extends Error {}

export const REGISTER_ID = "default"

export interface RegisterRow {
  entityName: string
  msbRegistered: boolean
  bsaId: string
  msbTracking: string
  ccoName: string
  ccoDesignated: string
  updatedBy: string | null
  updatedAt: string | null
}

const EMPTY: RegisterRow = {
  entityName: "", msbRegistered: true, bsaId: "", msbTracking: "",
  ccoName: "", ccoDesignated: "", updatedBy: null, updatedAt: null,
}

const ISO_DATE = /^\d{4}-\d{2}-\d{2}$/

export const RegisterUpdateSchema = z.object({
  entityName: z.string().trim().max(200),
  msbRegistered: z.boolean(),
  bsaId: z.string().trim().max(60),
  msbTracking: z.string().trim().max(60),
  ccoName: z.string().trim().max(120),
  ccoDesignated: z.string().trim().regex(ISO_DATE, "Use YYYY-MM-DD").or(z.literal("")),
})
export type RegisterUpdate = z.infer<typeof RegisterUpdateSchema>

type DbRow = {
  entityName: string; msbRegistered: boolean; bsaId: string; msbTracking: string
  ccoName: string; ccoDesignated: string; updatedBy: string | null; updatedAt: Date
}

function map(r: DbRow): RegisterRow {
  return {
    entityName: r.entityName, msbRegistered: r.msbRegistered, bsaId: r.bsaId,
    msbTracking: r.msbTracking, ccoName: r.ccoName, ccoDesignated: r.ccoDesignated,
    updatedBy: r.updatedBy, updatedAt: r.updatedAt.toISOString(),
  }
}

/** The singleton register. Returns empty defaults if it hasn't been created yet
 *  (so the dashboard renders placeholders instead of throwing). */
export async function getRegister(): Promise<RegisterRow> {
  const row = await prisma.complianceRegister.findUnique({ where: { id: REGISTER_ID } })
  return row ? map(row as DbRow) : EMPTY
}

/** Idempotent seed — creates the empty singleton if absent, never overwrites. */
export async function seedRegister(): Promise<{ created: boolean }> {
  const existing = await prisma.complianceRegister.findUnique({ where: { id: REGISTER_ID }, select: { id: true } })
  if (existing) return { created: false }
  await prisma.complianceRegister.create({ data: { id: REGISTER_ID } })
  return { created: true }
}

export async function updateRegister(input: unknown, updatedBy: string): Promise<RegisterRow> {
  const res = RegisterUpdateSchema.safeParse(input)
  if (!res.success) throw new RegisterError("Validation failed: " + JSON.stringify(res.error.issues))
  const d = res.data
  const saved = await prisma.complianceRegister.upsert({
    where: { id: REGISTER_ID },
    create: { id: REGISTER_ID, ...d, updatedBy },
    update: { ...d, updatedBy },
  })
  return map(saved as DbRow)
}
