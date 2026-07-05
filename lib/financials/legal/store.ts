// Thin Prisma layer for the legal register. Reached only through the legal.*
// gated actions in actions/cms/legal.ts. Returns serializable rows (ISO dates).
// Domain errors throw LegalError; the action layer maps those to { ok, error }.
import prisma from "@/lib/prisma"
import type {
  LegalEntityRow, LegalEntityProfile, LegalAgreementRow, DeserterRow, OylObligationRow,
  LegalEntityKind, LegalEntityCategory, LegalScope,
  LegalAgreementType, LegalAgreementStatus, DesertionStatus, SwapStatus, OylFunding,
  EntityDossier, DossierEnvelope, DossierFile, DossierOnchainTx, DossierFuel,
} from "./shapes"
import { groupEnvelopeVersions } from "./shapes"
import { loadPayeeProfile } from "@/lib/financials/accounting/store"
import { listEntityFiles, breadcrumb, filesPath, driveSlugFromScope } from "@/lib/files/manager"
import { explorerTxUrl, explorerAddrUrl } from "@/lib/explorers"
import { KIND_LABELS } from "@/lib/esign/types"

export class LegalError extends Error {}

// ---------- mappers --------------------------------------------------

type DeserterModel = {
  id: string; entityId: string; oylRole: string | null; oylTokenPct: number | null
  desertedVest: string; deserterEquityPct: number | null; dieselConverted: number | null
  swapStatus: string; arcaSignedOff: boolean; alecSignedOff: boolean; notes: string | null
}
function mapDeserter(d: DeserterModel): DeserterRow {
  return {
    id: d.id, entityId: d.entityId, oylRole: d.oylRole, oylTokenPct: d.oylTokenPct,
    desertedVest: d.desertedVest as DesertionStatus, deserterEquityPct: d.deserterEquityPct,
    dieselConverted: d.dieselConverted, swapStatus: d.swapStatus as SwapStatus,
    arcaSignedOff: d.arcaSignedOff, alecSignedOff: d.alecSignedOff, notes: d.notes,
  }
}

type ObligationModel = {
  id: string; entityId: string; funding: string; purchaseUsd: number | null
  valuationCap: number | null; dieselOwed: number; dieselClaimable: number
  onchainTxid: string | null; onchainAddress: string | null; fundedAt: Date | null
  vestingNote: string | null; notes: string | null
}
function mapObligation(o: ObligationModel): OylObligationRow {
  return {
    id: o.id, entityId: o.entityId, funding: o.funding as OylFunding, purchaseUsd: o.purchaseUsd,
    valuationCap: o.valuationCap, dieselOwed: o.dieselOwed, dieselClaimable: o.dieselClaimable,
    onchainTxid: o.onchainTxid, onchainAddress: o.onchainAddress,
    fundedAt: o.fundedAt?.toISOString() ?? null, vestingNote: o.vestingNote, notes: o.notes,
  }
}

function mapAgreement(a: {
  id: string; entityId: string; type: string; status: string; title: string
  counterpartyName: string | null; scope: string; signedAt: Date | null; pdfUrl: string | null
  envelopeId: string | null; notes: string | null; createdAt: Date
}): LegalAgreementRow {
  return {
    id: a.id, entityId: a.entityId, type: a.type as LegalAgreementType,
    status: a.status as LegalAgreementStatus, title: a.title, counterpartyName: a.counterpartyName,
    scope: a.scope as LegalScope, signedAt: a.signedAt?.toISOString() ?? null,
    pdfUrl: a.pdfUrl, envelopeId: a.envelopeId, notes: a.notes, createdAt: a.createdAt.toISOString(),
  }
}

// Resolve loose-ref link names (userId/payeeId/shareholderId) for a batch of
// entities in three small `in` queries, then attach by id.
async function resolveLinks(entities: { userId: string | null; payeeId: string | null; shareholderId: string | null }[]) {
  const userIds = [...new Set(entities.map((e) => e.userId).filter((x): x is string => !!x))]
  const payeeIds = [...new Set(entities.map((e) => e.payeeId).filter((x): x is string => !!x))]
  const shIds = [...new Set(entities.map((e) => e.shareholderId).filter((x): x is string => !!x))]
  const [users, payees, shareholders] = await Promise.all([
    userIds.length ? prisma.user.findMany({ where: { id: { in: userIds } }, select: { id: true, name: true, email: true } }) : [],
    payeeIds.length ? prisma.payee.findMany({ where: { id: { in: payeeIds } }, select: { id: true, name: true } }) : [],
    shIds.length ? prisma.shareholder.findMany({ where: { id: { in: shIds } }, select: { id: true, name: true } }) : [],
  ])
  return {
    user: new Map(users.map((u) => [u.id, u.name ?? u.email])),
    payee: new Map(payees.map((p) => [p.id, p.name])),
    shareholder: new Map(shareholders.map((s) => [s.id, s.name])),
  }
}

type EntityModel = {
  id: string; name: string; kind: string; category: string; scope: string; email: string | null
  userId: string | null; payeeId: string | null; shareholderId: string | null; notes: string | null
  tags?: string[]; addresses?: string[]
  createdAt: Date
  deserter?: DeserterModel | null
  obligation?: ObligationModel | null
  _count?: { agreements: number }
}
function mapEntity(
  e: EntityModel,
  links: { user: Map<string, string>; payee: Map<string, string>; shareholder: Map<string, string> },
): LegalEntityRow {
  return {
    id: e.id, name: e.name, kind: e.kind as LegalEntityKind, category: e.category as LegalEntityCategory,
    scope: e.scope as LegalScope, email: e.email, userId: e.userId, payeeId: e.payeeId,
    shareholderId: e.shareholderId, notes: e.notes,
    tags: e.tags ?? [], addresses: e.addresses ?? [],
    createdAt: e.createdAt.toISOString(),
    userName: e.userId ? links.user.get(e.userId) ?? null : null,
    payeeName: e.payeeId ? links.payee.get(e.payeeId) ?? null : null,
    shareholderName: e.shareholderId ? links.shareholder.get(e.shareholderId) ?? null : null,
    agreementCount: e._count?.agreements ?? 0,
    deserter: e.deserter ? mapDeserter(e.deserter) : null,
    obligation: e.obligation ? mapObligation(e.obligation) : null,
  }
}

const ENTITY_INCLUDE = { deserter: true, obligation: true, _count: { select: { agreements: true } } } as const

// ---------- entities -------------------------------------------------

export async function listEntities(filter?: { category?: LegalEntityCategory; scope?: LegalScope }): Promise<LegalEntityRow[]> {
  const rows = await prisma.legalEntity.findMany({
    where: { category: filter?.category, scope: filter?.scope },
    orderBy: [{ category: "asc" }, { name: "asc" }],
    include: ENTITY_INCLUDE,
  })
  const links = await resolveLinks(rows)
  return rows.map((r) => mapEntity(r, links))
}

export async function loadEntityProfile(id: string): Promise<LegalEntityProfile | null> {
  const entity = await prisma.legalEntity.findUnique({ where: { id }, include: ENTITY_INCLUDE })
  if (!entity) return null
  const links = await resolveLinks([entity])
  const agreements = await prisma.legalAgreement.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" } })
  return { entity: mapEntity(entity, links), agreements: agreements.map(mapAgreement) }
}

// Unified dossier: one LegalEntity + everything linked to it. Aggregates the
// linked Payee's invoices/payments, e-sign envelopes (as version chains) +
// signed files, on-chain settlement (BTC DIESEL payments + ETH OYL obligation),
// and FUEL allocations matched against the entity's addresses. Everything
// degrades gracefully when links/addresses are absent.
export async function loadEntityDossier(id: string): Promise<EntityDossier | null> {
  const entity = await prisma.legalEntity.findUnique({ where: { id }, include: ENTITY_INCLUDE })
  if (!entity) return null
  const links = await resolveLinks([entity])
  const row = mapEntity(entity, links)
  const addresses = row.addresses

  const [agreementRows, envelopeRows, fileLinks, payee] = await Promise.all([
    prisma.legalAgreement.findMany({ where: { entityId: id }, orderBy: { createdAt: "desc" } }),
    prisma.envelope.findMany({
      where: { entityId: id },
      orderBy: { createdAt: "desc" },
      select: {
        id: true, subject: true, kind: true, status: true, version: true,
        agreementKey: true, createdAt: true, completedAt: true,
      },
    }),
    listEntityFiles(id),
    row.payeeId ? loadPayeeProfile(row.payeeId) : Promise.resolve(null),
  ])

  const envelopes: DossierEnvelope[] = envelopeRows.map((e) => ({
    id: e.id, subject: e.subject, kind: e.kind, status: e.status,
    version: e.version ?? 1, agreementKey: e.agreementKey ?? null,
    createdAt: e.createdAt.toISOString(), completedAt: e.completedAt?.toISOString() ?? null,
    href: `/admin/documents/${e.id}`,
  }))
  const docGroups = groupEnvelopeVersions(envelopes).map((g) => ({
    ...g,
    label: g.label || (KIND_LABELS as Record<string, string>)[g.versions[0].kind] || g.versions[0].kind,
  }))

  // All files linked to the entity (any role), each with a deep-link into the
  // file navigator. Ordered so party docs (SIGNATORY/COUNTERPARTY) come first.
  const ROLE_ORDER: Record<string, number> = { SIGNATORY: 0, COUNTERPARTY: 1, SUBJECT: 2, MENTIONED: 3 }
  const signedFiles: DossierFile[] = await Promise.all(
    [...fileLinks]
      .sort((a, b) => (ROLE_ORDER[a.role] ?? 9) - (ROLE_ORDER[b.role] ?? 9))
      .map(async (l) => {
        const crumbs = await breadcrumb(l.file.folderId)
        const filePath = filesPath(driveSlugFromScope(l.file.scope), [...crumbs.map((c) => c.slug), l.file.slug])
        return {
          linkId: l.id, fileId: l.file.id, name: l.file.name,
          role: l.role, scope: l.file.scope, annotation: l.annotation, filePath,
        }
      }),
  )

  // ---- on-chain settlement ----
  const onchain: DossierOnchainTx[] = []
  const ob = row.obligation
  if (ob?.onchainTxid) {
    const txid = ob.onchainTxid
    onchain.push({
      source: "OYL_OBLIGATION", chain: "ethereum", txid,
      address: ob.onchainAddress, amount: ob.dieselOwed || null, unit: "DIESEL",
      date: ob.fundedAt, txUrl: explorerTxUrl("ethereum", txid),
      addrUrl: ob.onchainAddress ? explorerAddrUrl("ethereum", ob.onchainAddress) : null,
    })
  }
  // DIESEL payments (BTC): those settling the linked payee's invoices, plus any
  // whose recipient matches one of the entity's addresses (deduped by id).
  const btcPayments = new Map<string, { txid: string; recipientAddress: string; amountDiesel: number; paidAt: string }>()
  for (const p of payee?.payments ?? []) {
    btcPayments.set(p.id, { txid: p.txid, recipientAddress: p.recipientAddress, amountDiesel: p.amountDiesel, paidAt: p.paidAt })
  }
  if (addresses.length) {
    const addrPays = await prisma.dieselPayment.findMany({ where: { recipientAddress: { in: addresses } } })
    for (const p of addrPays) {
      btcPayments.set(p.id, {
        txid: p.txid, recipientAddress: p.recipientAddress, amountDiesel: p.amountDiesel,
        paidAt: p.paidAt.toISOString(),
      })
    }
  }
  for (const p of btcPayments.values()) {
    onchain.push({
      source: "DIESEL_PAYMENT", chain: "bitcoin", txid: p.txid,
      address: p.recipientAddress, amount: p.amountDiesel, unit: "DIESEL",
      date: p.paidAt, txUrl: explorerTxUrl("bitcoin", p.txid),
      addrUrl: p.recipientAddress ? explorerAddrUrl("bitcoin", p.recipientAddress) : null,
    })
  }

  // ---- FUEL (address join) ----
  let fuel: DossierFuel[] = []
  if (addresses.length) {
    const allocs = await prisma.fuelAllocation.findMany({ where: { address: { in: addresses } } })
    fuel = allocs.map((a) => ({
      address: a.address, amount: a.amount, note: a.note,
      addrUrl: explorerAddrUrl("bitcoin", a.address),
    }))
  }
  const fuelTotal = fuel.reduce((s, f) => s + f.amount, 0)

  return {
    entity: row, tags: row.tags, addresses,
    agreements: agreementRows.map(mapAgreement),
    payee, docGroups, signedFiles, onchain, fuel, fuelTotal,
  }
}

export interface EntityInput {
  name: string
  kind: LegalEntityKind
  category: LegalEntityCategory
  scope: LegalScope
  email?: string | null
  userId?: string | null
  payeeId?: string | null
  shareholderId?: string | null
  notes?: string | null
  tags?: string[]
  addresses?: string[]
}

/** Trim + dedupe + drop empties from a tag/address list. */
function cleanList(xs: string[] | undefined): string[] {
  if (!xs) return []
  return [...new Set(xs.map((s) => s.trim()).filter(Boolean))]
}

async function reload(id: string): Promise<LegalEntityRow> {
  const row = await prisma.legalEntity.findUniqueOrThrow({ where: { id }, include: ENTITY_INCLUDE })
  const links = await resolveLinks([row])
  return mapEntity(row, links)
}

export async function createEntity(input: EntityInput): Promise<LegalEntityRow> {
  const name = input.name.trim()
  if (!name) throw new LegalError("Entity name is required")
  const row = await prisma.legalEntity.create({
    data: {
      name, kind: input.kind, category: input.category, scope: input.scope,
      email: input.email?.trim() || null, userId: input.userId || null,
      payeeId: input.payeeId || null, shareholderId: input.shareholderId || null,
      notes: input.notes?.trim() || null,
      tags: cleanList(input.tags), addresses: cleanList(input.addresses),
    },
  })
  return reload(row.id)
}

export async function updateEntity(id: string, patch: Partial<EntityInput>): Promise<LegalEntityRow> {
  const existing = await prisma.legalEntity.findUnique({ where: { id } })
  if (!existing) throw new LegalError("Entity not found")
  const data: Record<string, unknown> = {}
  if ("name" in patch) { const n = (patch.name ?? "").trim(); if (!n) throw new LegalError("Name required"); data.name = n }
  if ("kind" in patch) data.kind = patch.kind
  if ("category" in patch) data.category = patch.category
  if ("scope" in patch) data.scope = patch.scope
  if ("email" in patch) data.email = patch.email?.trim() || null
  if ("userId" in patch) data.userId = patch.userId || null
  if ("payeeId" in patch) data.payeeId = patch.payeeId || null
  if ("shareholderId" in patch) data.shareholderId = patch.shareholderId || null
  if ("notes" in patch) data.notes = patch.notes?.trim() || null
  if ("tags" in patch) data.tags = cleanList(patch.tags)
  if ("addresses" in patch) data.addresses = cleanList(patch.addresses)
  await prisma.legalEntity.update({ where: { id }, data })
  return reload(id)
}

export async function deleteEntity(id: string): Promise<void> {
  await prisma.legalEntity.delete({ where: { id } }) // agreements + satellites cascade
}

// ---------- agreements -----------------------------------------------

export interface AgreementInput {
  entityId: string
  type: LegalAgreementType
  status: LegalAgreementStatus
  title: string
  counterpartyName?: string | null
  scope: LegalScope
  signedAt?: string | null
  pdfUrl?: string | null
  envelopeId?: string | null
  notes?: string | null
}

export async function createAgreement(input: AgreementInput): Promise<LegalAgreementRow> {
  const title = input.title.trim()
  if (!title) throw new LegalError("Agreement title is required")
  const entity = await prisma.legalEntity.findUnique({ where: { id: input.entityId } })
  if (!entity) throw new LegalError("Entity not found")
  const row = await prisma.legalAgreement.create({
    data: {
      entityId: input.entityId, type: input.type, status: input.status, title,
      counterpartyName: input.counterpartyName?.trim() || null, scope: input.scope,
      signedAt: input.signedAt ? new Date(input.signedAt) : null,
      pdfUrl: input.pdfUrl?.trim() || null, envelopeId: input.envelopeId || null,
      notes: input.notes?.trim() || null,
    },
  })
  return mapAgreement(row)
}

export async function updateAgreement(id: string, patch: Partial<AgreementInput>): Promise<LegalAgreementRow> {
  const existing = await prisma.legalAgreement.findUnique({ where: { id } })
  if (!existing) throw new LegalError("Agreement not found")
  const data: Record<string, unknown> = {}
  if ("type" in patch) data.type = patch.type
  if ("status" in patch) data.status = patch.status
  if ("title" in patch) { const t = (patch.title ?? "").trim(); if (!t) throw new LegalError("Title required"); data.title = t }
  if ("counterpartyName" in patch) data.counterpartyName = patch.counterpartyName?.trim() || null
  if ("scope" in patch) data.scope = patch.scope
  if ("signedAt" in patch) data.signedAt = patch.signedAt ? new Date(patch.signedAt) : null
  if ("pdfUrl" in patch) data.pdfUrl = patch.pdfUrl?.trim() || null
  if ("envelopeId" in patch) data.envelopeId = patch.envelopeId || null
  if ("notes" in patch) data.notes = patch.notes?.trim() || null
  const row = await prisma.legalAgreement.update({ where: { id }, data })
  return mapAgreement(row)
}

export async function deleteAgreement(id: string): Promise<void> {
  await prisma.legalAgreement.delete({ where: { id } })
}

// ---------- deserter satellite ---------------------------------------

export interface DeserterInput {
  oylRole?: string | null
  oylTokenPct?: number | null
  desertedVest?: DesertionStatus
  deserterEquityPct?: number | null
  dieselConverted?: number | null
  swapStatus?: SwapStatus
  arcaSignedOff?: boolean
  alecSignedOff?: boolean
  notes?: string | null
}

export async function upsertDeserter(entityId: string, input: DeserterInput): Promise<DeserterRow> {
  const entity = await prisma.legalEntity.findUnique({ where: { id: entityId } })
  if (!entity) throw new LegalError("Entity not found")
  const data = {
    oylRole: input.oylRole?.trim() || null,
    oylTokenPct: input.oylTokenPct ?? null,
    desertedVest: input.desertedVest ?? "UNDECIDED",
    deserterEquityPct: input.deserterEquityPct ?? null,
    dieselConverted: input.dieselConverted ?? null,
    swapStatus: input.swapStatus ?? "NOT_STARTED",
    arcaSignedOff: input.arcaSignedOff ?? false,
    alecSignedOff: input.alecSignedOff ?? false,
    notes: input.notes?.trim() || null,
  }
  const row = await prisma.deserter.upsert({
    where: { entityId }, create: { entityId, ...data }, update: data,
  })
  return mapDeserter(row)
}

// ---------- obligation satellite -------------------------------------

export interface ObligationInput {
  funding?: OylFunding
  purchaseUsd?: number | null
  valuationCap?: number | null
  dieselOwed?: number
  dieselClaimable?: number
  onchainTxid?: string | null
  onchainAddress?: string | null
  fundedAt?: string | null
  vestingNote?: string | null
  notes?: string | null
}

export async function upsertObligation(entityId: string, input: ObligationInput): Promise<OylObligationRow> {
  const entity = await prisma.legalEntity.findUnique({ where: { id: entityId } })
  if (!entity) throw new LegalError("Entity not found")
  const data = {
    funding: input.funding ?? "FUNDED",
    purchaseUsd: input.purchaseUsd ?? null,
    valuationCap: input.valuationCap ?? null,
    dieselOwed: input.dieselOwed ?? 0,
    dieselClaimable: input.dieselClaimable ?? 0,
    onchainTxid: input.onchainTxid?.trim() || null,
    onchainAddress: input.onchainAddress?.trim() || null,
    fundedAt: input.fundedAt ? new Date(input.fundedAt) : null,
    vestingNote: input.vestingNote?.trim() || null,
    notes: input.notes?.trim() || null,
  }
  const row = await prisma.oylObligation.upsert({
    where: { entityId }, create: { entityId, ...data }, update: data,
  })
  return mapObligation(row)
}

// ---------- linkable identity pickers --------------------------------

export async function listLinkableUsers(): Promise<{ id: string; name: string | null; email: string }[]> {
  return prisma.user.findMany({ where: { active: true }, orderBy: { email: "asc" }, select: { id: true, name: true, email: true } })
}
export async function listLinkableShareholders(): Promise<{ id: string; name: string }[]> {
  return prisma.shareholder.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
}
export async function listLinkablePayees(): Promise<{ id: string; name: string }[]> {
  return prisma.payee.findMany({ orderBy: { name: "asc" }, select: { id: true, name: true } })
}
