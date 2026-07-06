// Thin Prisma layer for the equity register (cap table + SAFEs/token
// agreements). Reached only through the gated actions in actions/cms/equity.ts.
// Returns serializable rows (ISO dates). Domain errors throw EquityError; the
// action layer maps those to { ok:false, error }.
import prisma from "@/lib/prisma"
import type {
  ShareClassRow, ShareholderRow, ShareHoldingRow, InstrumentRow,
  ShareClassType, HolderType, InstrumentType, InstrumentStatus, SafeKind,
} from "./shapes"

export class EquityError extends Error {}

// ---------- mappers --------------------------------------------------

function mapClass(r: {
  id: string; name: string; type: string; authorizedShares: number; parValue: number | null
  notes: string | null; createdAt: Date
}): ShareClassRow {
  return {
    id: r.id, name: r.name, type: r.type as ShareClassType, authorizedShares: r.authorizedShares,
    parValue: r.parValue, notes: r.notes, createdAt: r.createdAt.toISOString(),
  }
}

function mapHolder(r: {
  id: string; name: string; type: string; email: string | null; userId: string | null
  payeeId: string | null; notes: string | null; createdAt: Date
}): ShareholderRow {
  return {
    id: r.id, name: r.name, type: r.type as HolderType, email: r.email, userId: r.userId,
    payeeId: r.payeeId, notes: r.notes, createdAt: r.createdAt.toISOString(),
  }
}

function mapHolding(r: {
  id: string; shareholderId: string; shareClassId: string; shares: number; issuedAt: Date
  issued: boolean; certificateNo: string | null; notes: string | null
  shareholder?: { name: string } | null; shareClass?: { name: string } | null
}): ShareHoldingRow {
  return {
    id: r.id, shareholderId: r.shareholderId, shareholderName: r.shareholder?.name ?? "",
    shareClassId: r.shareClassId, shareClassName: r.shareClass?.name ?? "",
    shares: r.shares, issuedAt: r.issuedAt.toISOString(), issued: r.issued,
    certificateNo: r.certificateNo, notes: r.notes,
  }
}

function mapInstrument(r: {
  id: string; type: string; status: string; investorName: string; investorEntity: string | null
  investorEmail: string | null; shareholderId: string | null; amountUsd: number; signedAt: Date
  safeKind: string | null; valuationCap: number | null; discountRate: number | null; mfn: boolean
  proRata: boolean; interestRate: number | null; maturityDate: Date | null; tokenPct: number | null
  tokenAmount: number | null; pdfUrl: string | null; envelopeId: string | null; notes: string | null
  createdAt: Date; shareholder?: { name: string } | null
}): InstrumentRow {
  return {
    id: r.id, type: r.type as InstrumentType, status: r.status as InstrumentStatus,
    investorName: r.investorName, investorEntity: r.investorEntity, investorEmail: r.investorEmail,
    shareholderId: r.shareholderId, shareholderName: r.shareholder?.name ?? null,
    amountUsd: r.amountUsd, signedAt: r.signedAt.toISOString(),
    safeKind: (r.safeKind as SafeKind | null) ?? null, valuationCap: r.valuationCap,
    discountRate: r.discountRate, mfn: r.mfn, proRata: r.proRata, interestRate: r.interestRate,
    maturityDate: r.maturityDate?.toISOString() ?? null, tokenPct: r.tokenPct,
    tokenAmount: r.tokenAmount, pdfUrl: r.pdfUrl, envelopeId: r.envelopeId, notes: r.notes,
    createdAt: r.createdAt.toISOString(),
  }
}

// ---------- share classes --------------------------------------------

export async function listShareClasses(): Promise<ShareClassRow[]> {
  const rows = await prisma.shareClass.findMany({ orderBy: { createdAt: "asc" } })
  return rows.map(mapClass)
}

export async function createShareClass(input: {
  name: string; type: ShareClassType; authorizedShares: number; parValue?: number | null; notes?: string | null
}): Promise<ShareClassRow> {
  const name = input.name.trim()
  if (!name) throw new EquityError("Share class name is required")
  if (!Number.isFinite(input.authorizedShares) || input.authorizedShares < 0) {
    throw new EquityError("Authorized shares must be a non-negative number")
  }
  const row = await prisma.shareClass.create({
    data: {
      name, type: input.type, authorizedShares: Math.round(input.authorizedShares),
      parValue: input.parValue ?? null, notes: input.notes?.trim() || null,
    },
  })
  return mapClass(row)
}

export async function updateShareClass(id: string, patch: {
  name?: string; type?: ShareClassType; authorizedShares?: number; parValue?: number | null; notes?: string | null
}): Promise<ShareClassRow> {
  const existing = await prisma.shareClass.findUnique({ where: { id } })
  if (!existing) throw new EquityError("Share class not found")
  const data: Record<string, unknown> = {}
  if ("name" in patch) { const n = (patch.name ?? "").trim(); if (!n) throw new EquityError("Name required"); data.name = n }
  if ("type" in patch) data.type = patch.type
  if ("authorizedShares" in patch && patch.authorizedShares != null) data.authorizedShares = Math.round(patch.authorizedShares)
  if ("parValue" in patch) data.parValue = patch.parValue ?? null
  if ("notes" in patch) data.notes = patch.notes?.trim() || null
  const row = await prisma.shareClass.update({ where: { id }, data })
  return mapClass(row)
}

export async function deleteShareClass(id: string): Promise<void> {
  const holdings = await prisma.shareHolding.count({ where: { shareClassId: id } })
  if (holdings > 0) throw new EquityError("Cannot delete a class with holdings — remove holdings first")
  await prisma.shareClass.delete({ where: { id } })
}

/** Seeds the founder Common Stock class (10,000,000 authorized) when none
 *  exists yet. Idempotent: returns the existing common class if present. */
export async function seedCommonStock(): Promise<ShareClassRow> {
  const existing = await prisma.shareClass.findFirst({ where: { type: "COMMON" } })
  if (existing) return mapClass(existing)
  const row = await prisma.shareClass.create({
    data: { name: "Common Stock", type: "COMMON", authorizedShares: 10_000_000, parValue: 0.0001 },
  })
  return mapClass(row)
}

// ---------- shareholders ---------------------------------------------

export async function listShareholders(): Promise<ShareholderRow[]> {
  const rows = await prisma.shareholder.findMany({ orderBy: { name: "asc" } })
  return rows.map(mapHolder)
}

export async function createShareholder(input: {
  name: string; type: HolderType; email?: string | null; userId?: string | null; payeeId?: string | null; notes?: string | null
}): Promise<ShareholderRow> {
  const name = input.name.trim()
  if (!name) throw new EquityError("Shareholder name is required")
  const row = await prisma.shareholder.create({
    data: {
      name, type: input.type, email: input.email?.trim() || null,
      userId: input.userId || null, payeeId: input.payeeId || null, notes: input.notes?.trim() || null,
    },
  })
  return mapHolder(row)
}

export async function updateShareholder(id: string, patch: {
  name?: string; type?: HolderType; email?: string | null; userId?: string | null; payeeId?: string | null; notes?: string | null
}): Promise<ShareholderRow> {
  const existing = await prisma.shareholder.findUnique({ where: { id } })
  if (!existing) throw new EquityError("Shareholder not found")
  const data: Record<string, unknown> = {}
  if ("name" in patch) { const n = (patch.name ?? "").trim(); if (!n) throw new EquityError("Name required"); data.name = n }
  if ("type" in patch) data.type = patch.type
  if ("email" in patch) data.email = patch.email?.trim() || null
  if ("userId" in patch) data.userId = patch.userId || null
  if ("payeeId" in patch) data.payeeId = patch.payeeId || null
  if ("notes" in patch) data.notes = patch.notes?.trim() || null
  const row = await prisma.shareholder.update({ where: { id }, data })
  return mapHolder(row)
}

export async function deleteShareholder(id: string): Promise<void> {
  await prisma.shareholder.delete({ where: { id } }) // holdings cascade
}

// ---------- holdings -------------------------------------------------

export async function listHoldings(): Promise<ShareHoldingRow[]> {
  const rows = await prisma.shareHolding.findMany({
    orderBy: { shares: "desc" },
    include: { shareholder: { select: { name: true } }, shareClass: { select: { name: true } } },
  })
  return rows.map(mapHolding)
}

export async function createHolding(input: {
  shareholderId: string; shareClassId: string; shares: number; issuedAt: string; certificateNo?: string | null; notes?: string | null
}): Promise<ShareHoldingRow> {
  if (!Number.isFinite(input.shares) || input.shares <= 0) throw new EquityError("Shares must be a positive number")
  const sh = await prisma.shareholder.findUnique({ where: { id: input.shareholderId } })
  if (!sh) throw new EquityError("Shareholder not found")
  const cls = await prisma.shareClass.findUnique({ where: { id: input.shareClassId } })
  if (!cls) throw new EquityError("Share class not found")
  const row = await prisma.shareHolding.create({
    data: {
      shareholderId: input.shareholderId, shareClassId: input.shareClassId,
      shares: Math.round(input.shares), issuedAt: new Date(input.issuedAt),
      certificateNo: input.certificateNo?.trim() || null, notes: input.notes?.trim() || null,
    },
    include: { shareholder: { select: { name: true } }, shareClass: { select: { name: true } } },
  })
  return mapHolding(row)
}

export async function deleteHolding(id: string): Promise<void> {
  await prisma.shareHolding.delete({ where: { id } })
}

// ---------- instruments (SAFEs / token agreements) -------------------

export interface InstrumentInput {
  type: InstrumentType
  status?: InstrumentStatus
  investorName: string
  investorEntity?: string | null
  investorEmail?: string | null
  shareholderId?: string | null
  amountUsd: number
  signedAt: string
  safeKind?: SafeKind | null
  valuationCap?: number | null
  discountRate?: number | null
  mfn?: boolean
  proRata?: boolean
  interestRate?: number | null
  maturityDate?: string | null
  tokenPct?: number | null
  tokenAmount?: number | null
  pdfUrl?: string | null
  envelopeId?: string | null
  notes?: string | null
}

const INCLUDE_SH = { shareholder: { select: { name: true } } }

export async function listInstruments(): Promise<InstrumentRow[]> {
  const rows = await prisma.instrument.findMany({ orderBy: { signedAt: "desc" }, include: INCLUDE_SH })
  return rows.map(mapInstrument)
}

export async function createInstrument(input: InstrumentInput): Promise<InstrumentRow> {
  const investorName = input.investorName.trim()
  if (!investorName) throw new EquityError("Investor name is required")
  if (!Number.isFinite(input.amountUsd) || input.amountUsd < 0) throw new EquityError("Amount must be a non-negative number")
  if (input.discountRate != null && (input.discountRate < 0 || input.discountRate >= 1)) {
    throw new EquityError("Discount rate must be a fraction in [0, 1) — e.g. 0.20 for 20%")
  }
  if (input.shareholderId) {
    const sh = await prisma.shareholder.findUnique({ where: { id: input.shareholderId } })
    if (!sh) throw new EquityError("Shareholder not found")
  }
  const row = await prisma.instrument.create({
    data: {
      type: input.type, status: input.status ?? "OUTSTANDING", investorName,
      investorEntity: input.investorEntity?.trim() || null, investorEmail: input.investorEmail?.trim() || null,
      shareholderId: input.shareholderId || null, amountUsd: input.amountUsd, signedAt: new Date(input.signedAt),
      safeKind: input.safeKind ?? null, valuationCap: input.valuationCap ?? null, discountRate: input.discountRate ?? null,
      mfn: input.mfn ?? false, proRata: input.proRata ?? false, interestRate: input.interestRate ?? null,
      maturityDate: input.maturityDate ? new Date(input.maturityDate) : null,
      tokenPct: input.tokenPct ?? null, tokenAmount: input.tokenAmount ?? null,
      pdfUrl: input.pdfUrl?.trim() || null, envelopeId: input.envelopeId || null, notes: input.notes?.trim() || null,
    },
    include: INCLUDE_SH,
  })
  return mapInstrument(row)
}

export async function updateInstrument(id: string, patch: Partial<InstrumentInput>): Promise<InstrumentRow> {
  const existing = await prisma.instrument.findUnique({ where: { id } })
  if (!existing) throw new EquityError("Instrument not found")
  const data: Record<string, unknown> = {}
  if ("type" in patch) data.type = patch.type
  if ("status" in patch) data.status = patch.status
  if ("investorName" in patch) { const n = (patch.investorName ?? "").trim(); if (!n) throw new EquityError("Investor name required"); data.investorName = n }
  if ("investorEntity" in patch) data.investorEntity = patch.investorEntity?.trim() || null
  if ("investorEmail" in patch) data.investorEmail = patch.investorEmail?.trim() || null
  if ("shareholderId" in patch) {
    if (patch.shareholderId) {
      const sh = await prisma.shareholder.findUnique({ where: { id: patch.shareholderId } })
      if (!sh) throw new EquityError("Shareholder not found")
    }
    data.shareholderId = patch.shareholderId || null
  }
  if ("amountUsd" in patch && patch.amountUsd != null) data.amountUsd = patch.amountUsd
  if ("signedAt" in patch && patch.signedAt) data.signedAt = new Date(patch.signedAt)
  if ("safeKind" in patch) data.safeKind = patch.safeKind ?? null
  if ("valuationCap" in patch) data.valuationCap = patch.valuationCap ?? null
  if ("discountRate" in patch) {
    if (patch.discountRate != null && (patch.discountRate < 0 || patch.discountRate >= 1)) {
      throw new EquityError("Discount rate must be a fraction in [0, 1)")
    }
    data.discountRate = patch.discountRate ?? null
  }
  if ("mfn" in patch) data.mfn = patch.mfn ?? false
  if ("proRata" in patch) data.proRata = patch.proRata ?? false
  if ("interestRate" in patch) data.interestRate = patch.interestRate ?? null
  if ("maturityDate" in patch) data.maturityDate = patch.maturityDate ? new Date(patch.maturityDate) : null
  if ("tokenPct" in patch) data.tokenPct = patch.tokenPct ?? null
  if ("tokenAmount" in patch) data.tokenAmount = patch.tokenAmount ?? null
  if ("pdfUrl" in patch) data.pdfUrl = patch.pdfUrl?.trim() || null
  if ("envelopeId" in patch) data.envelopeId = patch.envelopeId || null
  if ("notes" in patch) data.notes = patch.notes?.trim() || null
  const row = await prisma.instrument.update({ where: { id }, data, include: INCLUDE_SH })
  return mapInstrument(row)
}

export async function deleteInstrument(id: string): Promise<void> {
  await prisma.instrument.delete({ where: { id } })
}
