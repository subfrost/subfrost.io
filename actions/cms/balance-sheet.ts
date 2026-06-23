"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import {
  BalanceSheetError,
  buildBalanceSheet, createManualItem, updateManualItem, deleteManualItem,
} from "@/lib/financials/balance-sheet/store"
import type { BalanceSheetView, BalanceSheetSection, ManualItemRow } from "@/lib/financials/balance-sheet/shapes"

const PATH = "/admin/financials/balance-sheet"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(FINANCIALS_PRIVILEGE)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

export type MutResult<T> = { ok: true; value: T } | { ok: false; error: string }
function mapErr(e: unknown): { ok: false; error: string } {
  if (e instanceof BalanceSheetError) return { ok: false, error: e.message }
  throw e
}

export type BalanceSheetResult =
  | { ok: true; view: BalanceSheetView }
  | { ok: false; error: "unauthorized" }

export async function balanceSheetOverviewAction(): Promise<BalanceSheetResult> {
  const g = await gate()
  if (!g.ok) return g
  return { ok: true, view: await buildBalanceSheet() }
}

export async function createBalanceSheetItemAction(input: {
  section: BalanceSheetSection; label: string; amountUsd: number; sortOrder?: number; notes?: string | null
}): Promise<MutResult<ManualItemRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await createManualItem(input)
    await audit("balance_sheet_item_upsert", { actorId: g.me.id, target: `${value.section}:${value.label}`, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function updateBalanceSheetItemAction(id: string, patch: {
  section?: BalanceSheetSection; label?: string; amountUsd?: number; sortOrder?: number; notes?: string | null
}): Promise<MutResult<ManualItemRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await updateManualItem(id, patch)
    await audit("balance_sheet_item_upsert", { actorId: g.me.id, target: `${value.section}:${value.label}`, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function deleteBalanceSheetItemAction(id: string): Promise<MutResult<true>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    await deleteManualItem(id)
    await audit("balance_sheet_item_delete", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(PATH)
    return { ok: true, value: true }
  } catch (e) { return mapErr(e) }
}
