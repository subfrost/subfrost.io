// Pure types + cap-table / SAFE math for the equity register. DB-free and
// serializable (ISO dates), so every function here is unit-tested without
// Prisma. Powers /admin/financials/cap-table + /admin/financials/safes and
// feeds the balance sheet's equity + convertible-instrument lines.

export type ShareClassType = "COMMON" | "PREFERRED"
export type HolderType = "PERSON" | "ENTITY"
export type InstrumentType =
  | "SAFE"
  | "TOKEN_WARRANT"
  | "TOKEN_SIDE_LETTER"
  | "SAFT"
  | "CONVERTIBLE_NOTE"
  | "OTHER"
export type InstrumentStatus = "OUTSTANDING" | "CONVERTED" | "CANCELLED"
export type SafeKind = "POST_MONEY" | "PRE_MONEY"

export const INSTRUMENT_TYPES: InstrumentType[] = [
  "SAFE", "TOKEN_WARRANT", "TOKEN_SIDE_LETTER", "SAFT", "CONVERTIBLE_NOTE", "OTHER",
]
export const INSTRUMENT_TYPE_LABELS: Record<InstrumentType, string> = {
  SAFE: "SAFE",
  TOKEN_WARRANT: "Token warrant",
  TOKEN_SIDE_LETTER: "Token side letter",
  SAFT: "SAFT",
  CONVERTIBLE_NOTE: "Convertible note",
  OTHER: "Other",
}
// Instrument types that carry SAFE-style conversion terms (cap/discount).
export const SAFE_LIKE: ReadonlySet<InstrumentType> = new Set(["SAFE", "CONVERTIBLE_NOTE"])
// Instrument types that represent token (not equity) rights.
export const TOKEN_LIKE: ReadonlySet<InstrumentType> = new Set(["TOKEN_WARRANT", "TOKEN_SIDE_LETTER", "SAFT"])

export const round2 = (n: number): number => Math.round(n * 100) / 100
export const pct2 = (n: number): number => Math.round(n * 10000) / 100 // → percentage with 2dp

export interface ShareClassRow {
  id: string
  name: string
  type: ShareClassType
  authorizedShares: number
  parValue: number | null
  notes: string | null
  createdAt: string
}

export interface ShareholderRow {
  id: string
  name: string
  type: HolderType
  email: string | null
  userId: string | null
  payeeId: string | null
  notes: string | null
  createdAt: string
}

export interface ShareHoldingRow {
  id: string
  shareholderId: string
  shareholderName: string
  shareClassId: string
  shareClassName: string
  shares: number
  issuedAt: string
  // false = intended/unissued allocation (e.g. the founder split FUEL derives
  // from). As-issued cap-table views exclude these; FUEL-split math includes them.
  issued: boolean
  certificateNo: string | null
  notes: string | null
}

export interface InstrumentRow {
  id: string
  type: InstrumentType
  status: InstrumentStatus
  investorName: string
  investorEntity: string | null
  investorEmail: string | null
  shareholderId: string | null
  shareholderName: string | null
  amountUsd: number
  signedAt: string
  safeKind: SafeKind | null
  valuationCap: number | null
  discountRate: number | null
  mfn: boolean
  proRata: boolean
  interestRate: number | null
  maturityDate: string | null
  tokenPct: number | null
  tokenAmount: number | null
  pdfUrl: string | null
  envelopeId: string | null
  notes: string | null
  createdAt: string
}

// ---------- Cap table ------------------------------------------------

export interface CapTableHolder {
  shareholderId: string
  name: string
  type: HolderType
  shares: number
  ownershipPct: number // issued basis, 0..100
}

export interface CapTableClassLine {
  shareClassId: string
  name: string
  type: ShareClassType
  authorizedShares: number
  issuedShares: number
}

export interface CapTableSummary {
  issuedShares: number
  authorizedShares: number
  byHolder: CapTableHolder[]
  byClass: CapTableClassLine[]
}

export function summarizeCapTable(
  classes: ShareClassRow[],
  holdings: ShareHoldingRow[],
): CapTableSummary {
  // As-issued basis: only actually-issued holdings. Intended (issued=false)
  // allocations — e.g. the founder split FUEL derives from — are excluded so
  // they don't distort the 100%-issued ownership view.
  const issued = holdings.filter((h) => h.issued !== false)
  const issuedShares = issued.reduce((s, h) => s + h.shares, 0)
  const authorizedShares = classes.reduce((s, c) => s + c.authorizedShares, 0)

  const byHolderMap = new Map<string, CapTableHolder>()
  for (const h of issued) {
    const cur = byHolderMap.get(h.shareholderId) ?? {
      shareholderId: h.shareholderId,
      name: h.shareholderName,
      type: "ENTITY" as HolderType,
      shares: 0,
      ownershipPct: 0,
    }
    cur.shares += h.shares
    byHolderMap.set(h.shareholderId, cur)
  }
  const byHolder = [...byHolderMap.values()]
    .map((h) => ({ ...h, ownershipPct: issuedShares === 0 ? 0 : pct2(h.shares / issuedShares) }))
    .sort((a, b) => b.shares - a.shares)

  const issuedByClass = new Map<string, number>()
  for (const h of issued) {
    issuedByClass.set(h.shareClassId, (issuedByClass.get(h.shareClassId) ?? 0) + h.shares)
  }
  const byClass = classes
    .map((c) => ({
      shareClassId: c.id,
      name: c.name,
      type: c.type,
      authorizedShares: c.authorizedShares,
      issuedShares: issuedByClass.get(c.id) ?? 0,
    }))
    .sort((a, b) => b.issuedShares - a.issuedShares)

  return { issuedShares, authorizedShares, byHolder, byClass }
}

// ---------- Instruments (SAFEs / token agreements) -------------------

export interface InstrumentTypeTotal {
  type: InstrumentType
  count: number
  amountUsd: number
}

export interface SafeOwnershipLine {
  instrumentId: string
  investorName: string
  amountUsd: number
  valuationCap: number | null
  discountRate: number | null
  // Implied ownership at the SAFE's own post-money cap (amount / cap). Only
  // meaningful for post-money SAFEs with a cap; null otherwise. This is the
  // headline 409A-relevant figure operators care about.
  impliedPostMoneyPct: number | null
}

export interface InstrumentSummary {
  totalOutstandingUsd: number // all OUTSTANDING instruments
  totalSafeRaisedUsd: number // OUTSTANDING SAFE-like only
  totalTokenPct: number // sum of token agreement % (OUTSTANDING)
  byType: InstrumentTypeTotal[]
  safeOwnership: SafeOwnershipLine[]
  impliedSafeOwnershipPct: number // sum of post-money SAFE implied ownership
}

export function summarizeInstruments(instruments: InstrumentRow[]): InstrumentSummary {
  const outstanding = instruments.filter((i) => i.status === "OUTSTANDING")
  const totalOutstandingUsd = round2(outstanding.reduce((s, i) => s + i.amountUsd, 0))
  const totalSafeRaisedUsd = round2(
    outstanding.filter((i) => SAFE_LIKE.has(i.type)).reduce((s, i) => s + i.amountUsd, 0),
  )
  const totalTokenPct = round2(
    outstanding.filter((i) => TOKEN_LIKE.has(i.type)).reduce((s, i) => s + (i.tokenPct ?? 0), 0),
  )

  const byTypeMap = new Map<InstrumentType, InstrumentTypeTotal>()
  for (const i of outstanding) {
    const cur = byTypeMap.get(i.type) ?? { type: i.type, count: 0, amountUsd: 0 }
    cur.count += 1
    cur.amountUsd = round2(cur.amountUsd + i.amountUsd)
    byTypeMap.set(i.type, cur)
  }
  const byType = [...byTypeMap.values()].sort((a, b) => b.amountUsd - a.amountUsd)

  const safeOwnership: SafeOwnershipLine[] = outstanding
    .filter((i) => SAFE_LIKE.has(i.type))
    .map((i) => ({
      instrumentId: i.id,
      investorName: i.investorName,
      amountUsd: i.amountUsd,
      valuationCap: i.valuationCap,
      discountRate: i.discountRate,
      impliedPostMoneyPct:
        i.safeKind === "POST_MONEY" && i.valuationCap && i.valuationCap > 0
          ? pct2(i.amountUsd / i.valuationCap)
          : null,
    }))
  const impliedSafeOwnershipPct = round2(
    safeOwnership.reduce((s, l) => s + (l.impliedPostMoneyPct ?? 0), 0),
  )

  return {
    totalOutstandingUsd,
    totalSafeRaisedUsd,
    totalTokenPct,
    byType,
    safeOwnership,
    impliedSafeOwnershipPct,
  }
}
