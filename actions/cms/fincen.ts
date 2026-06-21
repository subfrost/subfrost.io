"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import {
  FincenError,
  getForm107, saveForm107,
  listSar, createSar, updateSar,
  listCtr, createCtr, updateCtr,
  listSubmissions, queueSubmission,
  type DraftRow, type SubmissionRow,
} from "@/lib/fincen/admin"
import type { Form107, Sar, Ctr } from "@/lib/fincen/schemas"

const REQUIRED: Privilege = "MANAGE_AML"
type Fail = { ok: false; error: string }

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function actor(): Promise<{ ok: true; me: CmsUser } | Fail> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(REQUIRED)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}

export async function getFincenDataAction(): Promise<
  { ok: true; form107: DraftRow<Form107> | null; sar: DraftRow<Sar>[]; ctr: DraftRow<Ctr>[]; submissions: SubmissionRow[] } | Fail
> {
  const a = await actor()
  if (!a.ok) return a
  const [form107, sar, ctr, submissions] = await Promise.all([getForm107(), listSar(), listCtr(), listSubmissions()])
  return { ok: true, form107, sar, ctr, submissions }
}

async function mutate(
  fn: () => Promise<unknown>,
  action: "save_form107" | "create_fincen_draft" | "update_fincen_draft" | "queue_fincen_submission",
  target: string | undefined,
  me: CmsUser,
): Promise<{ ok: true } | Fail> {
  try {
    await fn()
    await audit(action, { actorId: me.id, target: target ?? null, ip: await ip() })
    revalidatePath("/admin/fincen")
    return { ok: true }
  } catch (e) {
    if (e instanceof FincenError) return { ok: false, error: e.message }
    throw e
  }
}

export async function saveForm107Action(input: unknown): Promise<{ ok: true } | Fail> {
  const a = await actor(); if (!a.ok) return a
  return mutate(() => saveForm107(input, a.me.email), "save_form107", "form-107", a.me)
}
export async function createSarAction(input: unknown): Promise<{ ok: true } | Fail> {
  const a = await actor(); if (!a.ok) return a
  return mutate(() => createSar(input, a.me.email), "create_fincen_draft", "sar", a.me)
}
export async function updateSarAction(id: string, input: unknown): Promise<{ ok: true } | Fail> {
  const a = await actor(); if (!a.ok) return a
  return mutate(() => updateSar(id, input, a.me.email), "update_fincen_draft", id, a.me)
}
export async function createCtrAction(input: unknown): Promise<{ ok: true } | Fail> {
  const a = await actor(); if (!a.ok) return a
  return mutate(() => createCtr(input, a.me.email), "create_fincen_draft", "ctr", a.me)
}
export async function updateCtrAction(id: string, input: unknown): Promise<{ ok: true } | Fail> {
  const a = await actor(); if (!a.ok) return a
  return mutate(() => updateCtr(id, input, a.me.email), "update_fincen_draft", id, a.me)
}
export async function queueSubmissionAction(draftId: string): Promise<{ ok: true } | Fail> {
  const a = await actor(); if (!a.ok) return a
  return mutate(() => queueSubmission(draftId, a.me.email), "queue_fincen_submission", draftId, a.me)
}
