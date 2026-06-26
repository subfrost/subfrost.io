"use server"

import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import { LEGAL_VIEW, LEGAL_EDIT, hasLegalAndFinancials } from "@/lib/financials/legal/privilege"
import {
  LegalError,
  listEntities, loadEntityProfile, createEntity, updateEntity, deleteEntity,
  createAgreement, updateAgreement, deleteAgreement,
  upsertDeserter, upsertObligation,
  listLinkableUsers, listLinkableShareholders, listLinkablePayees,
  type EntityInput, type AgreementInput, type DeserterInput, type ObligationInput,
} from "@/lib/financials/legal/store"
import { listInvoices, listPayments } from "@/lib/financials/accounting/store"
import type {
  LegalEntityRow, LegalEntityProfile, LegalAgreementRow, DeserterRow, OylObligationRow,
  LegalEntityCategory, LegalScope,
} from "@/lib/financials/legal/shapes"
import type { InvoiceRow, PaymentRow } from "@/lib/financials/accounting/shapes"

const LEGAL_PATH = "/admin/legal"
const SAFES_PATH = "/admin/financials/safes"

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function viewGate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(LEGAL_VIEW)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}
async function editGate(): Promise<{ ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(LEGAL_EDIT)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

export type MutResult<T> = { ok: true; value: T } | { ok: false; error: string }
function mapErr(e: unknown): { ok: false; error: string } {
  if (e instanceof LegalError) return { ok: false, error: e.message }
  throw e
}
function revalidate() {
  revalidatePath(LEGAL_PATH)
  revalidatePath(SAFES_PATH)
}

// ---------- reads ----------------------------------------------------

export type EntitiesResult = { ok: true; entities: LegalEntityRow[] } | { ok: false; error: "unauthorized" }

export async function legalEntitiesAction(filter?: { category?: LegalEntityCategory; scope?: LegalScope }): Promise<EntitiesResult> {
  const g = await viewGate()
  if (!g.ok) return g
  return { ok: true, entities: await listEntities(filter) }
}

export type DeserterListResult =
  | { ok: true; entities: LegalEntityRow[]; canEdit: boolean }
  | { ok: false; error: "unauthorized" }

/** The "Deserter SAFEs" subtab feed — DESERTER entities with their satellite.
 *  Reports canEdit so the subtab can show inline editors only to legal.edit. */
export async function deserterListAction(): Promise<DeserterListResult> {
  const g = await viewGate()
  if (!g.ok) return g
  return { ok: true, entities: await listEntities({ category: "DESERTER" }), canEdit: g.me.privileges.includes(LEGAL_EDIT) }
}

export type ProfileResult =
  | { ok: true; profile: LegalEntityProfile }
  | { ok: false; error: "unauthorized" | "not_found" }

export async function entityProfileAction(id: string): Promise<ProfileResult> {
  const g = await viewGate()
  if (!g.ok) return { ok: false, error: "unauthorized" }
  const profile = await loadEntityProfile(id)
  if (!profile) return { ok: false, error: "not_found" }
  return { ok: true, profile }
}

export type LinkablesResult =
  | { ok: true; users: { id: string; name: string | null; email: string }[]; shareholders: { id: string; name: string }[]; payees: { id: string; name: string }[] }
  | { ok: false; error: "unauthorized" }

export async function legalLinkablesAction(): Promise<LinkablesResult> {
  const g = await viewGate()
  if (!g.ok) return g
  const [users, shareholders, payees] = await Promise.all([
    listLinkableUsers(), listLinkableShareholders(), listLinkablePayees(),
  ])
  return { ok: true, users, shareholders, payees }
}

// ---------- entity writes --------------------------------------------

export async function createEntityAction(input: EntityInput): Promise<MutResult<LegalEntityRow>> {
  const g = await editGate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await createEntity(input)
    await audit("legal_entity_create", { actorId: g.me.id, target: `${value.category}:${value.name}`, ip: await ip() })
    revalidate()
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function updateEntityAction(id: string, patch: Partial<EntityInput>): Promise<MutResult<LegalEntityRow>> {
  const g = await editGate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await updateEntity(id, patch)
    await audit("legal_entity_update", { actorId: g.me.id, target: value.name, ip: await ip() })
    revalidate(); revalidatePath(`/admin/legal/entities/${id}`)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function deleteEntityAction(id: string): Promise<MutResult<true>> {
  const g = await editGate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    await deleteEntity(id)
    await audit("legal_entity_delete", { actorId: g.me.id, target: id, ip: await ip() })
    revalidate()
    return { ok: true, value: true }
  } catch (e) { return mapErr(e) }
}

// ---------- agreement writes -----------------------------------------

export async function createAgreementAction(input: AgreementInput): Promise<MutResult<LegalAgreementRow>> {
  const g = await editGate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await createAgreement(input)
    await audit("legal_agreement_create", { actorId: g.me.id, target: `${value.type}:${value.title}`, ip: await ip() })
    revalidate(); revalidatePath(`/admin/legal/entities/${input.entityId}`)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function updateAgreementAction(id: string, patch: Partial<AgreementInput>): Promise<MutResult<LegalAgreementRow>> {
  const g = await editGate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await updateAgreement(id, patch)
    await audit("legal_agreement_update", { actorId: g.me.id, target: value.title, ip: await ip() })
    revalidate(); revalidatePath(`/admin/legal/entities/${value.entityId}`)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function deleteAgreementAction(id: string): Promise<MutResult<true>> {
  const g = await editGate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    await deleteAgreement(id)
    await audit("legal_agreement_delete", { actorId: g.me.id, target: id, ip: await ip() })
    revalidate()
    return { ok: true, value: true }
  } catch (e) { return mapErr(e) }
}

// ---------- deserter / obligation satellites -------------------------

export async function upsertDeserterAction(entityId: string, input: DeserterInput): Promise<MutResult<DeserterRow>> {
  const g = await editGate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await upsertDeserter(entityId, input)
    // a sign-off change is the consequential one — log it distinctly
    const action = "arcaSignedOff" in input || "alecSignedOff" in input || "swapStatus" in input
      ? "legal_deserter_swap_signoff" : "legal_deserter_upsert"
    await audit(action, { actorId: g.me.id, target: entityId, details: { swapStatus: value.swapStatus, arca: value.arcaSignedOff, alec: value.alecSignedOff }, ip: await ip() })
    revalidate(); revalidatePath(`/admin/legal/entities/${entityId}`)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

export async function upsertObligationAction(entityId: string, input: ObligationInput): Promise<MutResult<OylObligationRow>> {
  const g = await editGate(); if (!g.ok) return { ok: false, error: "unauthorized" }
  try {
    const value = await upsertObligation(entityId, input)
    await audit("legal_obligation_upsert", { actorId: g.me.id, target: entityId, ip: await ip() })
    revalidate(); revalidatePath(`/admin/legal/entities/${entityId}`)
    return { ok: true, value }
  } catch (e) { return mapErr(e) }
}

// ---------- reconciliation (legal AND financials) --------------------
//
// The one surface flex gated on BOTH ladders: the list of invoices matched to
// actual on-chain DIESEL payments. Neither legal nor financials alone unlocks it.

export type ReconciliationResult =
  | { ok: true; invoices: InvoiceRow[]; payments: PaymentRow[] }
  | { ok: false; error: "unauthorized" }

export async function reconciliationAction(): Promise<ReconciliationResult> {
  const me = await currentUser()
  if (!me || !hasLegalAndFinancials(me)) return { ok: false, error: "unauthorized" }
  const [invoices, payments] = await Promise.all([listInvoices(), listPayments()])
  await audit("legal_reconciliation_view", { actorId: me.id, ip: await ip() })
  return { ok: true, invoices, payments }
}
