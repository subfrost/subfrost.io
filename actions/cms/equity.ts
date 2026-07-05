"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import prisma from "@/lib/prisma"
import { FINANCIALS_PRIVILEGE } from "@/lib/financials/privilege"
import {
  EquityError,
  listShareClasses, createShareClass, updateShareClass, deleteShareClass, seedCommonStock,
  listShareholders, createShareholder, updateShareholder, deleteShareholder,
  listHoldings, createHolding, deleteHolding,
  listInstruments, createInstrument, updateInstrument, deleteInstrument,
  type InstrumentInput,
} from "@/lib/financials/equity/store"
import type {
  ShareClassRow, ShareholderRow, ShareHoldingRow, InstrumentRow,
  ShareClassType, HolderType,
} from "@/lib/financials/equity/shapes"

const CAP_PATH = "/admin/financials/cap-table"
const SAFE_PATH = "/admin/financials/safes"

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
  if (e instanceof EquityError) return { ok: false, error: e.message }
  throw e
}

// ---------- overview -------------------------------------------------

export interface EquityOverview {
  classes: ShareClassRow[]
  shareholders: ShareholderRow[]
  holdings: ShareHoldingRow[]
  instruments: InstrumentRow[]
}
export type EquityOverviewResult =
  | { ok: true; overview: EquityOverview }
  | { ok: false; error: "unauthorized" }

export async function equityOverviewAction(): Promise<EquityOverviewResult> {
  const g = await gate()
  if (!g.ok) return g
  const [classes, shareholders, holdings, instruments] = await Promise.all([
    listShareClasses(), listShareholders(), listHoldings(), listInstruments(),
  ])
  return { ok: true, overview: { classes, shareholders, holdings, instruments } }
}

// ---------- share classes --------------------------------------------

export async function seedCommonStockAction(): Promise<MutResult<ShareClassRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await seedCommonStock()
    await audit("equity_class_upsert", { actorId: g.me.id, target: value.name, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function createShareClassAction(input: {
  name: string; type: ShareClassType; authorizedShares: number; parValue?: number | null; notes?: string | null
}): Promise<MutResult<ShareClassRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await createShareClass(input)
    await audit("equity_class_upsert", { actorId: g.me.id, target: value.name, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function updateShareClassAction(id: string, patch: {
  name?: string; type?: ShareClassType; authorizedShares?: number; parValue?: number | null; notes?: string | null
}): Promise<MutResult<ShareClassRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await updateShareClass(id, patch)
    await audit("equity_class_upsert", { actorId: g.me.id, target: value.name, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function deleteShareClassAction(id: string): Promise<MutResult<true>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    await deleteShareClass(id)
    await audit("equity_class_delete", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value: true }
  } catch (e) { return mapErr(e) }
}

// ---------- shareholders ---------------------------------------------

export async function createShareholderAction(input: {
  name: string; type: HolderType; email?: string | null; userId?: string | null; payeeId?: string | null; notes?: string | null
}): Promise<MutResult<ShareholderRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await createShareholder(input)
    await audit("equity_shareholder_upsert", { actorId: g.me.id, target: value.name, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function updateShareholderAction(id: string, patch: {
  name?: string; type?: HolderType; email?: string | null; userId?: string | null; payeeId?: string | null; notes?: string | null
}): Promise<MutResult<ShareholderRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await updateShareholder(id, patch)
    await audit("equity_shareholder_upsert", { actorId: g.me.id, target: value.name, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function deleteShareholderAction(id: string): Promise<MutResult<true>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    await deleteShareholder(id)
    await audit("equity_shareholder_delete", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value: true }
  } catch (e) { return mapErr(e) }
}

// ---------- holdings -------------------------------------------------

export async function createHoldingAction(input: {
  shareholderId: string; shareClassId: string; shares: number; issuedAt: string; certificateNo?: string | null; notes?: string | null
}): Promise<MutResult<ShareHoldingRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await createHolding(input)
    await audit("equity_holding_create", { actorId: g.me.id, target: `${value.shareholderName}:${value.shares}`, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function deleteHoldingAction(id: string): Promise<MutResult<true>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    await deleteHolding(id)
    await audit("equity_holding_delete", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(CAP_PATH)
    return { ok: true, value: true }
  } catch (e) { return mapErr(e) }
}

// ---------- instruments (SAFEs / token agreements) -------------------

export async function createInstrumentAction(input: InstrumentInput): Promise<MutResult<InstrumentRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await createInstrument(input)
    await audit("equity_instrument_create", { actorId: g.me.id, target: `${value.type}:${value.investorName}`, ip: await ip() })
    revalidatePath(SAFE_PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function updateInstrumentAction(id: string, patch: Partial<InstrumentInput>): Promise<MutResult<InstrumentRow>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await updateInstrument(id, patch)
    await audit("equity_instrument_update", { actorId: g.me.id, target: `${value.type}:${value.investorName}`, ip: await ip() })
    revalidatePath(SAFE_PATH)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function deleteInstrumentAction(id: string): Promise<MutResult<true>> {
  const g = await gate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    await deleteInstrument(id)
    await audit("equity_instrument_delete", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(SAFE_PATH)
    return { ok: true, value: true }
  } catch (e) { return mapErr(e) }
}

// ---------- FUEL supply-map context (financials-gated) ---------------

export type FuelAllocatedTotalResult =
  | { ok: true; total: number }
  | { ok: false; error: "unauthorized" }

/** Sum of all on-chain FUEL allocations — feeds the community/treasury split of
 *  the FUEL supply map. Gated on financials.view (the map exposes cap-table
 *  ownership), NOT the broader fuel.read. */
export async function fuelAllocatedTotalAction(): Promise<FuelAllocatedTotalResult> {
  const g = await gate(); if (!g.ok) return g
  const agg = await prisma.fuelAllocation.aggregate({ _sum: { amount: true } })
  return { ok: true, total: agg._sum.amount ?? 0 }
}

// ---------- linkable envelopes (for attaching a signed doc) ----------

export type LinkableEnvelope = { id: string; subject: string; status: string }
export type LinkableEnvelopesResult =
  | { ok: true; envelopes: LinkableEnvelope[] }
  | { ok: false; error: "unauthorized" }

export async function listLinkableEnvelopesAction(): Promise<LinkableEnvelopesResult> {
  const g = await gate(); if (!g.ok) return g
  const rows = await prisma.envelope.findMany({
    orderBy: { createdAt: "desc" },
    take: 200,
    select: { id: true, subject: true, status: true },
  })
  return { ok: true, envelopes: rows }
}
