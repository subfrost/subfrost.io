// Pure types + math for the legal register (entities, agreements, OYL deserters,
// funded-investor obligations). DB-free and serializable (ISO dates), so every
// function here is unit-testable without Prisma. Powers /admin/legal, the
// "Deserter SAFEs" subtab of /admin/financials/safes, and the entity profile.

export type LegalEntityKind = "PERSON" | "ORG"
export type LegalEntityCategory =
  | "FUNDED_INVESTOR"
  | "DESERTER"
  | "VOID_NONFUNDER"
  | "COUNTERPARTY"
  | "EMPLOYEE"
export type LegalScope = "SUBFROST" | "OYL"
export type LegalAgreementType =
  | "SAFE"
  | "TOKEN_RIGHTS"
  | "ADVISOR"
  | "CONTRACTOR"
  | "NDA"
  | "INTEGRATION"
  | "IP_ASSIGNMENT"
  | "RELEASE"
  | "BOARD_CONSENT"
  | "OTHER"
export type LegalAgreementStatus = "DRAFT" | "SENT" | "SIGNED" | "VOID"
export type DesertionStatus = "RETAINED" | "DESERTED" | "UNDECIDED"
export type SwapStatus =
  | "NOT_STARTED"
  | "PROPOSED"
  | "ARCA_SIGNED"
  | "ALEC_SIGNED"
  | "FULLY_SIGNED"
  | "CONVERTED"
export type OylFunding = "FUNDED" | "UNFUNDED_VOID"

export const LEGAL_ENTITY_CATEGORIES: LegalEntityCategory[] = [
  "FUNDED_INVESTOR", "DESERTER", "VOID_NONFUNDER", "COUNTERPARTY", "EMPLOYEE",
]
export const LEGAL_ENTITY_CATEGORY_LABELS: Record<LegalEntityCategory, string> = {
  FUNDED_INVESTOR: "Funded investor",
  DESERTER: "Deserter",
  VOID_NONFUNDER: "Void (unfunded)",
  COUNTERPARTY: "Counterparty",
  EMPLOYEE: "Employee",
}
export const LEGAL_AGREEMENT_TYPES: LegalAgreementType[] = [
  "SAFE", "TOKEN_RIGHTS", "ADVISOR", "CONTRACTOR", "NDA", "INTEGRATION",
  "IP_ASSIGNMENT", "RELEASE", "BOARD_CONSENT", "OTHER",
]
export const LEGAL_AGREEMENT_TYPE_LABELS: Record<LegalAgreementType, string> = {
  SAFE: "SAFE",
  TOKEN_RIGHTS: "Token rights",
  ADVISOR: "Advisor",
  CONTRACTOR: "Contractor",
  NDA: "NDA",
  INTEGRATION: "Integration",
  IP_ASSIGNMENT: "IP assignment",
  RELEASE: "Release",
  BOARD_CONSENT: "Board consent",
  OTHER: "Other",
}
export const SWAP_STATUS_LABELS: Record<SwapStatus, string> = {
  NOT_STARTED: "Not started",
  PROPOSED: "Proposed",
  ARCA_SIGNED: "Arca signed",
  ALEC_SIGNED: "Alec signed",
  FULLY_SIGNED: "Fully signed",
  CONVERTED: "Converted → DIESEL",
}
export const DESERTION_STATUS_LABELS: Record<DesertionStatus, string> = {
  RETAINED: "Retained vest",
  DESERTED: "Deserted vest",
  UNDECIDED: "Undecided",
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

// ---------- DIESEL conversion ---------------------------------------
//
// Canonical OYL token-rights formula (from the corrected obligations doc):
//   DIESEL = (purchase ÷ post-money cap) × 0.5 conversion × 440,000 premine.
// Used to derive a funded investor's owed DIESEL from their SAFE, and offered as
// a default when an operator records a deserter's equity-swap conversion.
export const DIESEL_PREMINE = 440_000
export const DIESEL_CONVERSION_FACTOR = 0.5

export function dieselFromSafe(purchaseUsd: number, valuationCap: number): number {
  if (!Number.isFinite(purchaseUsd) || !Number.isFinite(valuationCap) || valuationCap <= 0) return 0
  return round2((purchaseUsd / valuationCap) * DIESEL_CONVERSION_FACTOR * DIESEL_PREMINE)
}

// ---------- rows -----------------------------------------------------

export interface LegalAgreementRow {
  id: string
  entityId: string
  type: LegalAgreementType
  status: LegalAgreementStatus
  title: string
  counterpartyName: string | null
  scope: LegalScope
  signedAt: string | null
  pdfUrl: string | null
  envelopeId: string | null
  notes: string | null
  createdAt: string
}

export interface DeserterRow {
  id: string
  entityId: string
  oylRole: string | null
  oylTokenPct: number | null
  desertedVest: DesertionStatus
  deserterEquityPct: number | null
  dieselConverted: number | null
  swapStatus: SwapStatus
  arcaSignedOff: boolean
  alecSignedOff: boolean
  notes: string | null
}

export interface OylObligationRow {
  id: string
  entityId: string
  funding: OylFunding
  purchaseUsd: number | null
  valuationCap: number | null
  dieselOwed: number
  dieselClaimable: number
  onchainTxid: string | null
  onchainAddress: string | null
  fundedAt: string | null
  vestingNote: string | null
  notes: string | null
}

export interface LegalEntityRow {
  id: string
  name: string
  kind: LegalEntityKind
  category: LegalEntityCategory
  scope: LegalScope
  email: string | null
  userId: string | null
  payeeId: string | null
  shareholderId: string | null
  notes: string | null
  createdAt: string
  // resolved link names (read-side joins), null when unlinked
  userName: string | null
  payeeName: string | null
  shareholderName: string | null
  agreementCount: number
  // satellites (present only for the relevant category)
  deserter: DeserterRow | null
  obligation: OylObligationRow | null
}

export interface LegalEntityProfile {
  entity: LegalEntityRow
  agreements: LegalAgreementRow[]
}

// ---------- summaries ------------------------------------------------

export interface DeserterSummary {
  count: number
  retained: number
  deserted: number
  undecided: number
  totalEquityPct: number
  totalDieselConverted: number
  fullySigned: number
  converted: number
}

export function summarizeDeserters(rows: DeserterRow[]): DeserterSummary {
  return {
    count: rows.length,
    retained: rows.filter((d) => d.desertedVest === "RETAINED").length,
    deserted: rows.filter((d) => d.desertedVest === "DESERTED").length,
    undecided: rows.filter((d) => d.desertedVest === "UNDECIDED").length,
    totalEquityPct: round2(rows.reduce((s, d) => s + (d.deserterEquityPct ?? 0), 0)),
    totalDieselConverted: round2(rows.reduce((s, d) => s + (d.dieselConverted ?? 0), 0)),
    fullySigned: rows.filter((d) => d.swapStatus === "FULLY_SIGNED" || d.swapStatus === "CONVERTED").length,
    converted: rows.filter((d) => d.swapStatus === "CONVERTED").length,
  }
}

export interface ObligationSummary {
  count: number
  funded: number
  void: number
  totalDieselOwed: number
  totalDieselClaimable: number
  reconciled: number // funded obligations with an on-chain txid recorded
}

export function summarizeObligations(rows: OylObligationRow[]): ObligationSummary {
  const funded = rows.filter((o) => o.funding === "FUNDED")
  return {
    count: rows.length,
    funded: funded.length,
    void: rows.filter((o) => o.funding === "UNFUNDED_VOID").length,
    totalDieselOwed: round2(funded.reduce((s, o) => s + o.dieselOwed, 0)),
    totalDieselClaimable: round2(funded.reduce((s, o) => s + o.dieselClaimable, 0)),
    reconciled: funded.filter((o) => !!o.onchainTxid).length,
  }
}

/** Did Arca + Alec both sign off? Derives the swap-eligible flag for a deserter:
 *  RETAINED + both sign-offs → ready to convert. */
export function swapEligible(d: DeserterRow): boolean {
  return d.desertedVest === "RETAINED" && d.arcaSignedOff && d.alecSignedOff
}
