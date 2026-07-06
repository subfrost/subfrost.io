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

import type { InstrumentRow } from "@/lib/financials/equity/shapes"

export const FUEL_TOTAL = 2_100_000
export const FUEL_POOL = 1_050_000 // cap-table-descended (50%)
export const FUEL_SURPLUS = 1_050_000 // community + treasury (50%)

const round2 = (n: number): number => Math.round(n * 100) / 100

// Intended founder split (FUEL basis — equity is as-issued 100% Raymond, but
// FUEL honors the intended 70/25/5). Team token grants carved from the pool.
export const FOUNDER_FUEL_SPLIT = [
  { name: "Raymond Wesley Pulver IV", pct: 70 },
  { name: "Gabriel Lee", pct: 25 },
  { name: "Sean Pulver", pct: 5 },
]
export const TEAM_FUEL_GRANTS = [{ name: "Kevin Yao", amount: 31_500 }]

const norm = (s: string) => s.trim().toLowerCase()
function investorImpliedPct(i: InstrumentRow): number {
  if (i.status !== "OUTSTANDING") return 0
  if (!(i.safeKind === "POST_MONEY" && i.valuationCap && i.valuationCap > 0)) return 0
  return (i.amountUsd / i.valuationCap) * 100
}

export interface EntityFuelShare { amount: number; source: string }

/** The cap-table-descended (modeled, 2:1) FUEL for a single entity by name:
 *  founders on the intended split, SAFE investors pro-rata to their implied %,
 *  team grants fixed. Returns null if the entity isn't in the cap-table pool.
 *  Shared by the entity dossier + the FUEL supply map so both agree. */
export function capTableFuelForEntity(entityName: string, instruments: InstrumentRow[]): EntityFuelShare | null {
  const name = norm(entityName)
  const team = TEAM_FUEL_GRANTS.find((g) => norm(g.name) === name)
  if (team) return { amount: team.amount, source: "Team token grant" }

  const teamTotal = TEAM_FUEL_GRANTS.reduce((s, g) => s + g.amount, 0)
  const equityMapped = Math.max(0, FUEL_POOL - teamTotal)
  const totalInvestorPct = instruments.reduce((s, i) => s + investorImpliedPct(i), 0)
  const investorFuel = round2((equityMapped * totalInvestorPct) / 100)
  const founderFuelTotal = round2(equityMapped - investorFuel)

  const f = FOUNDER_FUEL_SPLIT.find((x) => norm(x.name) === name)
  if (f) return { amount: round2((founderFuelTotal * f.pct) / 100), source: `Founder · ${f.pct}%` }

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
  founderSplit: { name: string; pct: number }[] // intended split among founders (sums ~100)
  investors: { name: string; pct: number }[] // per-investor fully-diluted SAFE implied %
  teamGrants: { name: string; amount: number }[] // fixed token grants inside the pool
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
      color: C.founder, sub: `founder · ${f.pct}%`, href: "/admin/financials/cap-table" })
  }
  // one line per SAFE investor (pro-rata to their implied %), so each shows up
  for (const inv of i.investors) {
    const amount = round2((equityMapped * inv.pct) / 100)
    items.push({ key: `i:${inv.name}`, label: inv.name, amount, pctSupply: supplyPct(amount),
      color: C.investor, sub: `SAFE · ${inv.pct.toFixed(3)}%`, href: `/admin/entities?q=${encodeURIComponent(inv.name)}` })
  }
  for (const g of i.teamGrants) {
    items.push({ key: `t:${g.name}`, label: g.name, amount: g.amount, pctSupply: supplyPct(g.amount),
      color: C.team, sub: "team grant", href: "/admin/entities?category=EMPLOYEE" })
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
