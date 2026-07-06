"use client"

import { useMemo } from "react"
import Link from "next/link"
import { buildFuelSupplyMap, FUEL_TOTAL, FOUNDER_FUEL_SPLIT, TEAM_FUEL_GRANTS, type FuelItem } from "@/lib/fuel/supply"
import type { InstrumentRow } from "@/lib/financials/equity/shapes"

const fmt = (n: number) => n.toLocaleString("en-US", { maximumFractionDigits: 0 })

/** Privilege-gated FUEL supply map: the 2,100,000 supply split into the
 *  cap-table pool (itemized, modeled 2:1 from the cap table) and the surplus
 *  (community + treasury). Reads OUTSTANDING post-money SAFEs for the diluted
 *  investor share; `communityAllocated` is the on-chain allocated total. */
export function FuelSupplyMap({ instruments, communityAllocated }: { instruments: InstrumentRow[]; communityAllocated: number }) {
  const map = useMemo(() => {
    // per-investor implied % (grouped by entity), so each SAFE investor is its own line
    const byInvestor = new Map<string, number>()
    for (const i of instruments) {
      if (i.status !== "OUTSTANDING" || !(i.safeKind === "POST_MONEY" && i.valuationCap && i.valuationCap > 0)) continue
      const name = i.investorEntity || i.investorName
      byInvestor.set(name, (byInvestor.get(name) ?? 0) + (i.amountUsd / i.valuationCap) * 100)
    }
    const investors = [...byInvestor.entries()].map(([name, pct]) => ({ name, pct }))
    return buildFuelSupplyMap({ founderSplit: FOUNDER_FUEL_SPLIT, investors, teamGrants: TEAM_FUEL_GRANTS, communityAllocated })
  }, [instruments, communityAllocated])

  const maxItem = map.pool.items[0]?.amount || 1

  return (
    <div className="space-y-5">
      <p className="text-xs text-zinc-500">
        Total supply <span className="font-medium text-zinc-300 tabular-nums">{fmt(FUEL_TOTAL)} FUEL</span> ·
        cap-table pool amounts are modeled from the cap table at a 2:1 equity→token ratio.
      </p>

      {/* Top-level supply bar: pool / community / treasury */}
      <div className="flex h-4 overflow-hidden rounded-full bg-zinc-800">
        {map.top.map((b) => (
          <div key={b.key} style={{ width: `${b.pctSupply}%`, background: b.color }} title={`${b.label}: ${fmt(b.amount)} (${b.pctSupply}%)`} />
        ))}
      </div>
      <div className="grid grid-cols-3 gap-3">
        {map.top.map((b) => <BucketCard key={b.key} item={b} />)}
      </div>

      {/* Cap-table pool itemized, descending */}
      <div className="rounded-lg border border-zinc-800 p-3">
        <div className="mb-2 flex items-baseline justify-between">
          <span className="text-xs font-medium text-zinc-400">Cap-table pool · itemized</span>
          <span className="text-xs text-zinc-500 tabular-nums">{fmt(map.pool.total)} FUEL (50%)</span>
        </div>
        <div className="space-y-1.5">
          {map.pool.items.map((v) => {
            const row = (
              <div className="flex items-center gap-2 text-xs">
                <span className="w-40 shrink-0 truncate text-zinc-300" title={v.label}>{v.label}
                  {v.sub && <span className="text-zinc-600"> · {v.sub}</span>}
                </span>
                <div className="h-2.5 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div className="h-full rounded" style={{ width: `${(v.amount / maxItem) * 100}%`, background: v.color }} />
                </div>
                <span className="w-24 shrink-0 text-right tabular-nums text-zinc-400">{fmt(v.amount)}</span>
                <span className="hidden w-14 shrink-0 text-right tabular-nums text-zinc-600 sm:block">{v.pctSupply}%</span>
              </div>
            )
            return v.href
              ? <Link key={v.key} href={v.href} className="block rounded px-1 py-0.5 hover:bg-zinc-800/50">{row}</Link>
              : <div key={v.key} className="px-1 py-0.5">{row}</div>
          })}
        </div>
      </div>
    </div>
  )
}

function BucketCard({ item }: { item: FuelItem }) {
  const inner = (
    <>
      <div className="flex items-center gap-2">
        <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: item.color }} />
        <span className="text-xs font-medium text-zinc-300">{item.label}</span>
      </div>
      <div className="mt-1 text-lg font-semibold text-white tabular-nums">{fmt(item.amount)}</div>
      <div className="text-xs text-zinc-500">{item.pctSupply}% · {item.sub}</div>
    </>
  )
  return item.href
    ? <Link href={item.href} className="block rounded-lg border border-zinc-800 p-3 transition-colors hover:border-zinc-700 hover:bg-zinc-800/40">{inner}</Link>
    : <div className="rounded-lg border border-zinc-800 p-3">{inner}</div>
}
