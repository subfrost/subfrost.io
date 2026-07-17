"use client"

import { useMemo } from "react"
import { Cell, Pie, PieChart } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { InstrumentRow } from "@/lib/financials/equity/shapes"

// SAFE round buckets — derived from each instrument's note (data-driven, not a
// hardcoded name list). Magnus is checked first because Magnus notes also
// mention "Z DAO" (they novate the voided Z DAO deals).
type BucketKey = "magnus" | "maelstrom" | "zdao" | "standard"
const BUCKET: Record<BucketKey, { label: string; color: string }> = {
  magnus: { label: "Magnus Capital", color: "#a78bfa" }, // violet-400
  maelstrom: { label: "Maelstrom / Arthur", color: "#fbbf24" }, // amber-400
  zdao: { label: "Z DAO standalone", color: "#34d399" }, // emerald-400
  standard: { label: "Standard SAFE", color: "#a1a1aa" }, // zinc-400
}
const FOUNDER_COLOR = "#38bdf8" // sky-400

function bucketOf(notes: string | null, name: string): BucketKey {
  const n = (notes ?? "").toLowerCase()
  if (n.includes("magnus")) return "magnus"
  if (n.includes("headline asia") || n.includes("maelstrom") || name.toLowerCase().includes("maelstrom")) return "maelstrom"
  if (n.includes("z dao")) return "zdao"
  return "standard"
}

const pct4 = (n: number) => `${n.toFixed(4)}%`

/** Fully-diluted ownership visuals for the cap table: a founder-vs-investors
 *  headline, a SAFE-allocation donut by round bucket, and a descending
 *  per-investor dilution bar. Purely presentational — reads OUTSTANDING
 *  post-money SAFEs (implied % = purchase ÷ post-money cap) from `instruments`. */
export function CapTableCharts({ instruments, founderName }: { instruments: InstrumentRow[]; founderName: string }) {
  const model = useMemo(() => {
    const byInvestor = new Map<string, { name: string; pct: number; bucket: BucketKey }>()
    for (const i of instruments) {
      if (i.status !== "OUTSTANDING") continue
      if (!(i.safeKind === "POST_MONEY" && i.valuationCap && i.valuationCap > 0)) continue
      const pct = (i.amountUsd / i.valuationCap) * 100
      const bucket = bucketOf(i.notes, i.investorName)
      const cur = byInvestor.get(i.investorName) ?? { name: i.investorName, pct: 0, bucket }
      cur.pct += pct
      byInvestor.set(i.investorName, cur)
    }
    const investors = [...byInvestor.values()].sort((a, b) => b.pct - a.pct)
    const investorTotalPct = investors.reduce((s, v) => s + v.pct, 0)
    const founderPct = Math.max(0, 100 - investorTotalPct)

    const bucketMap = new Map<BucketKey, number>()
    for (const v of investors) bucketMap.set(v.bucket, (bucketMap.get(v.bucket) ?? 0) + v.pct)
    const buckets = [...bucketMap.entries()]
      .map(([key, pct]) => ({ key, label: BUCKET[key].label, color: BUCKET[key].color, pct }))
      .sort((a, b) => b.pct - a.pct)

    return { investors, investorTotalPct, founderPct, buckets }
  }, [instruments])

  if (model.investors.length === 0) return null
  const maxInvestor = model.investors[0]?.pct || 1

  const donutConfig: ChartConfig = Object.fromEntries(
    model.buckets.map((b) => [b.key, { label: b.label, color: b.color }]),
  )
  const donutData = model.buckets.map((b) => ({ name: b.label, key: b.key, value: b.pct, fill: b.color }))

  return (
    <div className="space-y-5">
      {/* Founder vs investors headline */}
      <div className="grid grid-cols-2 gap-3">
        <div className="rounded-lg border border-sky-900/50 bg-sky-950/20 p-3">
          <div className="text-xs text-zinc-500">{founderName} · fully diluted</div>
          <div className="mt-1 text-2xl font-semibold text-sky-300 tabular-nums">{model.founderPct.toFixed(2)}%</div>
        </div>
        <div className="rounded-lg border border-zinc-800 p-3">
          <div className="text-xs text-zinc-500">SAFE investors ({model.investors.length}) · on conversion</div>
          <div className="mt-1 text-2xl font-semibold text-zinc-200 tabular-nums">{model.investorTotalPct.toFixed(2)}%</div>
        </div>
      </div>
      {/* 100% stacked bar */}
      <div className="flex h-3 overflow-hidden rounded-full bg-zinc-800">
        <div style={{ width: `${model.founderPct}%`, background: FOUNDER_COLOR }} title={`${founderName} ${model.founderPct.toFixed(2)}%`} />
        {model.buckets.map((b) => (
          <div key={b.key} style={{ width: `${b.pct}%`, background: b.color }} title={`${b.label} ${pct4(b.pct)}`} />
        ))}
      </div>

      <div className="grid gap-5 md:grid-cols-2">
        {/* Donut: investor allocation by round bucket */}
        <div className="rounded-lg border border-zinc-800 p-3">
          <div className="mb-1 text-xs font-medium text-zinc-400">Investor allocation by round</div>
          <ChartContainer config={donutConfig} className="mx-auto h-[200px] w-full">
            <PieChart>
              <ChartTooltip content={<ChartTooltipContent nameKey="name" formatter={(v) => pct4(Number(v))} />} />
              <Pie data={donutData} dataKey="value" nameKey="name" innerRadius={50} outerRadius={82} paddingAngle={2} strokeWidth={0}>
                {donutData.map((d) => <Cell key={d.key} fill={d.fill} />)}
              </Pie>
            </PieChart>
          </ChartContainer>
          <div className="mt-1 space-y-1">
            {model.buckets.map((b) => (
              <div key={b.key} className="flex items-center gap-2 text-xs">
                <span className="h-2.5 w-2.5 shrink-0 rounded-sm" style={{ background: b.color }} />
                <span className="flex-1 text-zinc-300">{b.label}</span>
                <span className="tabular-nums text-zinc-500">{pct4(b.pct)}</span>
              </div>
            ))}
          </div>
        </div>

        {/* Descending per-investor dilution */}
        <div className="rounded-lg border border-zinc-800 p-3">
          <div className="mb-2 text-xs font-medium text-zinc-400">Dilution by investor (of company)</div>
          <div className="space-y-1.5">
            {model.investors.map((v) => (
              <div key={v.name} className="flex items-center gap-2 text-xs">
                <span className="w-36 shrink-0 truncate text-zinc-300" title={v.name}>{v.name}</span>
                <div className="h-2.5 flex-1 overflow-hidden rounded bg-zinc-800">
                  <div className="h-full rounded" style={{ width: `${(v.pct / maxInvestor) * 100}%`, background: BUCKET[v.bucket].color }} />
                </div>
                <span className="w-16 shrink-0 text-right tabular-nums text-zinc-400">{pct4(v.pct)}</span>
              </div>
            ))}
          </div>
        </div>
      </div>
    </div>
  )
}
