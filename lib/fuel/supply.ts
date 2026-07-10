// Pure FUEL supply-map math (DB-free, unit-testable). Powers the privilege-gated
// FUEL bucket view on the financials/cap-table surface.
//
// Model (confirmed by rwp): FUEL total supply 2,100,000 (8 decimals) maps
//   • 50% = 1,050,000 "cap-table pool" — descended from the cap table at a 2:1
//     equity→token ratio: founders on the INTENDED 70/25/5 split, diluted by the
//     SAFE investors, with team/employee token grants (e.g. Kevin) carved from
//     the same pool.
//   • 50% = 1,050,000 "surplus" — Community allocation drawn first, remainder
//     reserved to the protocol treasury (Subzero Research Inc balance sheet).

import { TOKEN_LIKE, type InstrumentRow, type ShareHoldingRow } from "@/lib/financials/equity/shapes"

export const FUEL_TOTAL = 2_100_000
export const FUEL_POOL = 1_050_000 // cap-table-descended (50%)
export const FUEL_SURPLUS = 1_050_000 // community + treasury (50%)

// Presale FUEL was sold for cash. The balance sheet books the *consideration
// actually received* (cash raised) as a deferred-delivery obligation — it is
// NOT the 2.1M supply marked to the presale price. That mark-to-price figure is
// a notional overhang shown only as a memo, never as a liability.
//
// Confirmed with rwp (2026-07-06): the presale landed in the treasury ops wallet
// 0x35E18d…E9e4. Gross USDT-in there was $1.76M, but that includes $300k of
// internal self-shuffling and ~$1 of spam-airdrop dust across 389 addresses.
// Netting to external inflow leaves 9 real investor deposits ($500k/200k/200k/
// 150k/100k×4/10k) = $1,460,000. Booked as consideration received, NOT
// 2.1M × $17.17.
export const FUEL_PRESALE_PROCEEDS_USD = 1_460_000

// Presale unit price ($/FUEL). Used ONLY for the notional overhang memo
// ((FUEL_TOTAL − issued) × price), never to size the deferred obligation.
export const FUEL_PRESALE_PRICE_USD = 17.17

const round2 = (n: number): number => Math.round(n * 100) / 100

// Founders + team grants are DATA, sourced from the DB by callers (share
// holdings → founder split; token instruments → team grants) and passed in.
export interface FounderShare {
  name: string
  pct: number
}
export interface TeamGrant {
  name: string
  amount: number
}

const norm = (s: string) => s.trim().toLowerCase()

/** Derive the founder FUEL split from share holdings: group holdings by
 *  shareholder (counting ALL holdings, incl. intended/unissued), then pct =
 *  shares / totalFounderShares * 100 (so 7M/2.5M/0.5M → 70/25/5). `nameFor`
 *  lets the caller map a shareholder to its linked LegalEntity name so the
 *  split keys match entity names in the dossier join; defaults to the
 *  shareholder's own name. */
export function foundersFromHoldings(
  holdings: Pick<ShareHoldingRow, "shareholderId" | "shareholderName" | "shares">[],
  nameFor?: (shareholderId: string, shareholderName: string) => string,
): FounderShare[] {
  const byHolder = new Map<string, { name: string; shares: number }>()
  for (const h of holdings) {
    const cur = byHolder.get(h.shareholderId) ??
      { name: nameFor?.(h.shareholderId, h.shareholderName) ?? h.shareholderName, shares: 0 }
    cur.shares += h.shares
    byHolder.set(h.shareholderId, cur)
  }
  const total = [...byHolder.values()].reduce((s, v) => s + v.shares, 0)
  if (total <= 0) return []
  return [...byHolder.values()].map((v) => ({ name: v.name, pct: round2((v.shares / total) * 100) }))
}

/** Derive team token grants from token-type instruments (TOKEN_WARRANT /
 *  TOKEN_SIDE_LETTER / SAFT) carrying a tokenAmount, grouped by investor. */
export function teamGrantsFromInstruments(instruments: InstrumentRow[]): TeamGrant[] {
  const byName = new Map<string, number>()
  for (const i of instruments) {
    if (!TOKEN_LIKE.has(i.type) || !i.tokenAmount) continue
    const name = i.investorEntity || i.investorName
    byName.set(name, (byName.get(name) ?? 0) + i.tokenAmount)
  }
  return [...byName.entries()].map(([name, amount]) => ({ name, amount }))
}

function investorImpliedPct(i: InstrumentRow): number {
  if (i.status !== "OUTSTANDING") return 0
  if (!(i.safeKind === "POST_MONEY" && i.valuationCap && i.valuationCap > 0)) return 0
  return (i.amountUsd / i.valuationCap) * 100
}

export interface EntityFuelShare { amount: number; source: string }

/** The cap-table-descended (modeled, 2:1) FUEL for a single entity by name:
 *  founders on the intended split, SAFE investors pro-rata to their implied %,
 *  team grants fixed. `founders` + `teamGrants` are DB-derived data passed by
 *  the caller. Returns null if the entity isn't in the cap-table pool. Shared by
 *  the entity dossier + the FUEL supply map so both agree. */
export function capTableFuelForEntity(
  entityName: string,
  instruments: InstrumentRow[],
  founders: FounderShare[],
  teamGrants: TeamGrant[],
): EntityFuelShare | null {
  const name = norm(entityName)
  const team = teamGrants.find((g) => norm(g.name) === name)
  if (team) return { amount: team.amount, source: "Team token grant" }

  const teamTotal = teamGrants.reduce((s, g) => s + g.amount, 0)
  const equityMapped = Math.max(0, FUEL_POOL - teamTotal)
  const totalInvestorPct = instruments.reduce((s, i) => s + investorImpliedPct(i), 0)
  const investorFuel = round2((equityMapped * totalInvestorPct) / 100)
  const founderFuelTotal = round2(equityMapped - investorFuel)

  const f = founders.find((x) => norm(x.name) === name)
  if (f) return { amount: round2((founderFuelTotal * f.pct) / 100), source: `Founder · ${round2(f.pct)}%` }

  const myPct = instruments
    .filter((i) => i.investorEntity && norm(i.investorEntity) === name)
    .reduce((s, i) => s + investorImpliedPct(i), 0)
  if (myPct > 0 && totalInvestorPct > 0) {
    return { amount: round2(investorFuel * (myPct / totalInvestorPct)), source: "SAFE investor" }
  }
  return null
}

export interface FuelItem {
  key: string
  label: string
  amount: number
  pctSupply: number // % of the 2,100,000 total
  color: string
  sub?: string
  role?: string // "Founder" | "SAFE" | "Team grant" (pool items only)
  equityPct?: number // equity ownership %: founder split % or SAFE implied % (team grants: n/a)
  href?: string
}

export interface FuelSupplyMap {
  total: number
  pool: { total: number; items: FuelItem[] }
  community: number
  treasury: number
  top: FuelItem[] // three top-level buckets: pool / community / treasury
}

export interface FuelSupplyInput {
  founderSplit: FounderShare[] // intended split among founders (sums ~100)
  investors: { name: string; pct: number }[] // per-investor fully-diluted SAFE implied %
  teamGrants: TeamGrant[] // fixed token grants inside the pool
  communityAllocated: number // FUEL allocated on-chain so far (fills the surplus first)
}

const C = {
  founder: "#38bdf8", // sky-400
  investor: "#a78bfa", // violet-400
  team: "#34d399", // emerald-400
  community: "#fbbf24", // amber-400
  treasury: "#71717a", // zinc-500
}

const supplyPct = (amount: number): number => round2((amount / FUEL_TOTAL) * 100)

/** Build the FUEL supply map: itemized cap-table pool + community/treasury split
 *  of the surplus, all against the 2,100,000 total. Amounts within the pool are
 *  MODELED from the cap table (2:1), not on-chain allocations. */
export function buildFuelSupplyMap(i: FuelSupplyInput): FuelSupplyMap {
  const teamTotal = i.teamGrants.reduce((s, g) => s + g.amount, 0)
  const equityMapped = Math.max(0, FUEL_POOL - teamTotal)
  const investorEquityPct = i.investors.reduce((s, v) => s + v.pct, 0)
  const investorFuel = round2((equityMapped * investorEquityPct) / 100)
  const founderFuelTotal = round2(equityMapped - investorFuel)

  const items: FuelItem[] = []
  for (const f of i.founderSplit) {
    const amount = round2((founderFuelTotal * f.pct) / 100)
    items.push({ key: `f:${f.name}`, label: f.name, amount, pctSupply: supplyPct(amount),
      color: C.founder, sub: `founder · ${f.pct}%`, role: "Founder", equityPct: f.pct, href: "/admin/financials/cap-table" })
  }
  // one line per SAFE investor (pro-rata to their implied %), so each shows up
  for (const inv of i.investors) {
    const amount = round2((equityMapped * inv.pct) / 100)
    items.push({ key: `i:${inv.name}`, label: inv.name, amount, pctSupply: supplyPct(amount),
      color: C.investor, sub: `SAFE · ${inv.pct.toFixed(3)}%`, role: "SAFE", equityPct: inv.pct, href: `/admin/entities?q=${encodeURIComponent(inv.name)}` })
  }
  for (const g of i.teamGrants) {
    items.push({ key: `t:${g.name}`, label: g.name, amount: g.amount, pctSupply: supplyPct(g.amount),
      color: C.team, sub: "team grant", role: "Team grant", href: "/admin/entities?category=EMPLOYEE" })
  }
  items.sort((a, b) => b.amount - a.amount)

  const community = round2(Math.min(i.communityAllocated, FUEL_SURPLUS))
  const treasury = round2(FUEL_SURPLUS - community)

  const top: FuelItem[] = [
    { key: "pool", label: "Cap-table pool", amount: FUEL_POOL, pctSupply: 50, color: C.founder,
      sub: "founders + SAFEs + team", href: "/admin/financials/cap-table" },
    { key: "community", label: "Community", amount: community, pctSupply: supplyPct(community), color: C.community,
      sub: "referral communities", href: "/admin/communities" },
    { key: "treasury", label: "Treasury reserve", amount: treasury, pctSupply: supplyPct(treasury), color: C.treasury,
      sub: "Subzero Research Inc balance sheet" },
  ]

  return { total: FUEL_TOTAL, pool: { total: FUEL_POOL, items }, community, treasury, top }
}
