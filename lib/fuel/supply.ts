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

export const FUEL_TOTAL = 2_100_000
export const FUEL_POOL = 1_050_000 // cap-table-descended (50%)
export const FUEL_SURPLUS = 1_050_000 // community + treasury (50%)

const round2 = (n: number): number => Math.round(n * 100) / 100

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
  investorEquityPct: number // fully-diluted SAFE investor equity %
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
  const investorFuel = round2((equityMapped * i.investorEquityPct) / 100)
  const founderFuelTotal = round2(equityMapped - investorFuel)

  const items: FuelItem[] = []
  for (const f of i.founderSplit) {
    const amount = round2((founderFuelTotal * f.pct) / 100)
    items.push({ key: `f:${f.name}`, label: f.name, amount, pctSupply: supplyPct(amount),
      color: C.founder, sub: `founder · ${f.pct}%`, href: "/admin/financials/cap-table" })
  }
  items.push({ key: "investors", label: "SAFE investors", amount: investorFuel, pctSupply: supplyPct(investorFuel),
    color: C.investor, sub: `${i.investorEquityPct.toFixed(2)}% diluted`, href: "/admin/entities?category=FUNDED_INVESTOR" })
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
