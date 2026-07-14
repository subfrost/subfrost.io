"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import type { Prisma } from "@prisma/client"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import type { Privilege } from "@/lib/cms/privileges"
import { audit } from "@/lib/cms/audit"
import {
  CodeError,
  listCodes,
  getParentOptions,
  createCode,
  bulkCreateCodes,
  updateCode,
  deleteCode,
  addAddressToCode,
  removeAddressFromCode,
  getCodeTree,
  getAnnotatedCodeTree,
  getCodeRedeemers,
  listRedemptions,
  exportRedemptionsCsv,
  type CreateCodeInput,
  type BulkCreateInput,
  type UpdateCodeInput,
  type AddAddressInput,
  type RemoveAddressInput,
  type ListCodesQuery,
  type ListCodesResult,
  type ListRedemptionsQuery,
  type ListRedemptionsResult,
  type CodeTreeNode,
  type AnnotatedCodeNode,
  type CodeRedeemer,
} from "@/lib/referral/admin"

export type CodeActionResult = { ok: true } | { ok: false; error: string }

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

/** Gate on the given privilege; returns the actor or an error envelope. */
async function actor(
  required: Privilege,
): Promise<{ ok: true; me: CmsUser } | { ok: false; error: string }> {
  const me = await currentUser()
  if (!me) return { ok: false, error: "Not authenticated" }
  if (!me.privileges.includes(required)) return { ok: false, error: "Insufficient privileges" }
  return { ok: true, me }
}

// --- Reads -----------------------------------------------------------------

export async function listCodesAction(
  query: ListCodesQuery,
): Promise<({ ok: true } & ListCodesResult) | { ok: false; error: string }> {
  const a = await actor("referral.read")
  if (!a.ok) return a
  return { ok: true, ...(await listCodes(query)) }
}

export async function getParentOptionsAction(): Promise<
  { ok: true; options: { id: string; code: string }[] } | { ok: false; error: string }
> {
  const a = await actor("referral.read")
  if (!a.ok) return a
  return { ok: true, options: await getParentOptions() }
}

export async function getCodeTreeAction(): Promise<
  { ok: true; tree: CodeTreeNode[] } | { ok: false; error: string }
> {
  const a = await actor("referral.read")
  if (!a.ok) return a
  return { ok: true, tree: await getCodeTree() }
}

export async function getAnnotatedCodeTreeAction(): Promise<
  { ok: true; tree: AnnotatedCodeNode[] } | { ok: false; error: string }
> {
  const a = await actor("referral.read")
  if (!a.ok) return a
  return { ok: true, tree: await getAnnotatedCodeTree() }
}

export async function codeRedeemersAction(
  codeId: string,
): Promise<{ ok: true; redeemers: CodeRedeemer[] } | { ok: false; error: string }> {
  const a = await actor("referral.read")
  if (!a.ok) return a
  return { ok: true, redeemers: await getCodeRedeemers(codeId) }
}

export async function listRedemptionsAction(
  query: ListRedemptionsQuery,
): Promise<({ ok: true } & ListRedemptionsResult) | { ok: false; error: string }> {
  const a = await actor("referral.read")
  if (!a.ok) return a
  return { ok: true, ...(await listRedemptions(query)) }
}

export async function exportRedemptionsCsvAction(): Promise<
  { ok: true; csv: string; filename: string } | { ok: false; error: string }
> {
  const a = await actor("referral.read")
  if (!a.ok) return a
  const csv = await exportRedemptionsCsv()
  return { ok: true, csv, filename: `redemptions-${new Date().toISOString().slice(0, 10)}.csv` }
}

// --- Writes ----------------------------------------------------------------

/** Wrap a domain write: map CodeError to an envelope, let anything else throw. */
async function run(op: () => Promise<void>): Promise<CodeActionResult> {
  try {
    await op()
    return { ok: true }
  } catch (e) {
    if (e instanceof CodeError) return { ok: false, error: e.message }
    throw e
  }
}

export async function createCodeAction(input: CreateCodeInput): Promise<CodeActionResult> {
  const a = await actor("referral.edit")
  if (!a.ok) return a
  return run(async () => {
    const created = await createCode(input)
    await audit("create_code", { actorId: a.me.id, target: created.code, ip: await ip() })
    revalidatePath("/admin/codes")
  })
}

export async function bulkCreateCodesAction(
  input: BulkCreateInput,
): Promise<{ ok: true; count: number; codes: string[] } | { ok: false; error: string }> {
  const a = await actor("referral.edit")
  if (!a.ok) return a
  try {
    const res = await bulkCreateCodes(input)
    await audit("create_code", {
      actorId: a.me.id,
      target: `bulk:${normalizePrefixForAudit(input.prefix)} ×${res.count}`,
      ip: await ip(),
    })
    revalidatePath("/admin/codes")
    return { ok: true, ...res }
  } catch (e) {
    if (e instanceof CodeError) return { ok: false, error: e.message }
    throw e
  }
}

const normalizePrefixForAudit = (p: string) => (p ?? "").trim().toUpperCase()

export async function updateCodeAction(
  id: string,
  input: UpdateCodeInput,
): Promise<CodeActionResult> {
  const a = await actor("referral.edit")
  if (!a.ok) return a
  return run(async () => {
    const updated = await updateCode(id, input)
    await audit("update_code", {
      actorId: a.me.id,
      target: updated.code,
      details: input as Prisma.InputJsonValue,
      ip: await ip(),
    })
    revalidatePath("/admin/codes")
  })
}

export async function addAddressToCodeAction(input: AddAddressInput): Promise<CodeActionResult> {
  const a = await actor("referral.edit")
  if (!a.ok) return a
  return run(async () => {
    const { code } = await addAddressToCode(input)
    await audit("update_code", {
      actorId: a.me.id,
      target: code,
      details: { addAddress: input.taprootAddress } as Prisma.InputJsonValue,
      ip: await ip(),
    })
    revalidatePath("/admin/codes")
  })
}

export async function removeAddressFromCodeAction(
  input: RemoveAddressInput,
): Promise<{ ok: true; addressDeleted: boolean } | { ok: false; error: string }> {
  const a = await actor("referral.edit")
  if (!a.ok) return a
  try {
    const { code, addressDeleted } = await removeAddressFromCode(input)
    await audit("update_code", {
      actorId: a.me.id,
      target: code,
      details: {
        removeAddress: input.taprootAddress,
        addressDeleted,
      } as Prisma.InputJsonValue,
      ip: await ip(),
    })
    revalidatePath("/admin/codes")
    return { ok: true, addressDeleted }
  } catch (e) {
    if (e instanceof CodeError) return { ok: false, error: e.message }
    throw e
  }
}

/** Convenience for the inline activate/deactivate toggle. */
export async function toggleCodeAction(id: string, isActive: boolean): Promise<CodeActionResult> {
  return updateCodeAction(id, { isActive })
}

export async function deleteCodeAction(id: string): Promise<CodeActionResult> {
  const a = await actor("referral.edit")
  if (!a.ok) return a
  return run(async () => {
    const { code } = await deleteCode(id)
    await audit("delete_code", { actorId: a.me.id, target: code, ip: await ip() })
    revalidatePath("/admin/codes")
  })
}
