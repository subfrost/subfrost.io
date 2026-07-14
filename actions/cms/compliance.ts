"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit, type AuditAction } from "@/lib/cms/audit"
import {
  ObligationError,
  listObligations,
  seedObligations,
  createObligation,
  updateObligation,
  deleteObligation,
  completeObligation,
  type ObligationRow,
} from "@/lib/compliance/obligations"
import {
  ProgramError,
  listProgramItems,
  seedProgramItems,
  updateProgramItem,
  type ProgramItemRow,
  type ProgramItemUpdate,
} from "@/lib/compliance/program-store"

type Fail = { ok: false; error: string }

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function actor(required: Privilege): Promise<{ ok: true; me: CmsUser } | Fail> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(required)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10)
}

// ---- Obligations --------------------------------------------------------

export async function listObligationsAction(): Promise<
  { ok: true; obligations: ObligationRow[] } | Fail
> {
  const a = await actor("aml.read")
  if (!a.ok) return a
  return { ok: true, obligations: await listObligations() }
}

export async function seedObligationsAction(): Promise<{ ok: true; created: number } | Fail> {
  const a = await actor("aml.edit")
  if (!a.ok) return a
  const { created } = await seedObligations()
  await audit("seed_obligations", { actorId: a.me.id, target: `${created} created`, ip: await ip() })
  revalidatePath("/admin/compliance/obligations")
  revalidatePath("/admin/compliance")
  return { ok: true, created }
}

async function mutateObligation(
  fn: () => Promise<ObligationRow | void>,
  action: AuditAction,
  target: string,
  me: CmsUser,
): Promise<{ ok: true } | Fail> {
  try {
    await fn()
    await audit(action, { actorId: me.id, target, ip: await ip() })
    revalidatePath("/admin/compliance/obligations")
    revalidatePath("/admin/compliance")
    return { ok: true }
  } catch (e) {
    if (e instanceof ObligationError) return { ok: false, error: e.message }
    throw e
  }
}

export async function createObligationAction(input: unknown): Promise<{ ok: true } | Fail> {
  const a = await actor("aml.edit"); if (!a.ok) return a
  return mutateObligation(() => createObligation(input), "create_obligation", "new obligation", a.me)
}

export async function updateObligationAction(id: string, input: unknown): Promise<{ ok: true } | Fail> {
  const a = await actor("aml.edit"); if (!a.ok) return a
  return mutateObligation(() => updateObligation(id, input), "update_obligation", id, a.me)
}

export async function deleteObligationAction(id: string): Promise<{ ok: true } | Fail> {
  const a = await actor("aml.edit"); if (!a.ok) return a
  return mutateObligation(() => deleteObligation(id), "delete_obligation", id, a.me)
}

export async function completeObligationAction(id: string): Promise<{ ok: true } | Fail> {
  const a = await actor("aml.edit"); if (!a.ok) return a
  return mutateObligation(() => completeObligation(id, todayISO()), "complete_obligation", id, a.me)
}

// ---- Program pillars ----------------------------------------------------

export async function listProgramItemsAction(): Promise<
  { ok: true; items: ProgramItemRow[] } | Fail
> {
  const a = await actor("aml.read")
  if (!a.ok) return a
  return { ok: true, items: await listProgramItems() }
}

export async function seedProgramItemsAction(): Promise<{ ok: true; created: number } | Fail> {
  const a = await actor("aml.edit")
  if (!a.ok) return a
  const { created } = await seedProgramItems()
  await audit("seed_program", { actorId: a.me.id, target: `${created} created`, ip: await ip() })
  revalidatePath("/admin/compliance")
  return { ok: true, created }
}

export async function updateProgramItemAction(
  key: string,
  input: ProgramItemUpdate,
): Promise<{ ok: true } | Fail> {
  const a = await actor("aml.edit")
  if (!a.ok) return a
  try {
    await updateProgramItem(key, input, a.me.email)
    await audit("update_program_item", { actorId: a.me.id, target: key, ip: await ip() })
    revalidatePath("/admin/compliance")
    return { ok: true }
  } catch (e) {
    if (e instanceof ProgramError) return { ok: false, error: e.message }
    throw e
  }
}
