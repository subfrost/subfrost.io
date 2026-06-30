"use client"

import { useState } from "react"
import { LineChart, Line, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"

type Delta = { deltaAbs: number | null; deltaPct: number | null }
type Deltas = { dieselHolders: Delta; dieselPrice: Delta; btcLocked: Delta }

const chartConfig: ChartConfig = {
  dieselHolders: { label: "DIESEL holders", color: "#38bdf8" },
  dieselPrice: { label: "DIESEL price", color: "#34d399" },
  btcLocked: { label: "BTC locked", color: "#fbbf24" },
  firePrice: { label: "FIRE price", color: "#f97316" },
  dieselMarketcap: { label: "DIESEL market cap", color: "#a78bfa" },
  btcUsd: { label: "BTC/USD", color: "#60a5fa" },
}
const METRICS = Object.keys(chartConfig) as (keyof typeof chartConfig)[]

const int = (n: number | null) => (n == null ? "—" : Math.round(n).toLocaleString("en-US"))
const usd = (n: number | null) => (n == null ? "—" : `$${n.toLocaleString("en-US", { maximumFractionDigits: 2 })}`)
const btc = (n: number | null) => (n == null ? "—" : n.toFixed(2))
const pct = (d: Delta) => (d.deltaPct == null ? "—" : `${d.deltaPct >= 0 ? "+" : ""}${d.deltaPct.toFixed(1)}%`)
const tone = (d: Delta) => (d.deltaPct == null ? "text-zinc-500" : d.deltaPct >= 0 ? "text-emerald-400" : "text-red-400")

function Hero({ label, value, delta, metric, series }: { label: string; value: string; delta: Delta; metric: keyof typeof chartConfig; series: SeriesPoint[] }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 flex items-baseline justify-between gap-2">
        <span className="text-2xl font-bold text-white">{value}</span>
        <span className={`text-sm ${tone(delta)}`}>{pct(delta)}</span>
      </div>
      <LineChart width={180} height={36} data={series} className="mt-2">
        <Line type="monotone" dataKey={metric} stroke={chartConfig[metric].color} dot={false} strokeWidth={2} isAnimationActive={false} />
      </LineChart>
    </div>
  )
}

export function ProtocolAnalyticsClient({ series, deltas }: { series: SeriesPoint[]; deltas: Deltas }) {
  const [metric, setMetric] = useState<keyof typeof chartConfig>("dieselHolders")
  const last = series[series.length - 1]

  if (!last) {
    return (
      <div>
        <h1 className="mb-4 text-2xl font-bold text-white">Protocol analytics</h1>
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          No snapshots yet — the first daily capture runs at 00:05 UTC.
        </p>
      </div>
    )
  }

  return (
    <div>
      <h1 className="mb-4 text-2xl font-bold text-white">Protocol analytics</h1>

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Hero label="DIESEL holders" value={int(last.dieselHolders)} delta={deltas.dieselHolders} metric="dieselHolders" series={series} />
        <Hero label="DIESEL price" value={usd(last.dieselPrice)} delta={deltas.dieselPrice} metric="dieselPrice" series={series} />
        <Hero label="BTC locked" value={btc(last.btcLocked)} delta={deltas.btcLocked} metric="btcLocked" series={series} />
      </div>

      <div className="mb-2 flex flex-wrap gap-1">
        {METRICS.map((m) => (
          <button key={m} onClick={() => setMetric(m)}
            className={`rounded-md px-3 py-1.5 text-sm ${metric === m ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
            {chartConfig[m].label}
          </button>
        ))}
      </div>

      <ChartContainer config={chartConfig} className="mb-6 h-[280px] w-full">
        <LineChart data={series}>
          <CartesianGrid vertical={false} />
          <XAxis dataKey="date" tickLine={false} axisLine={false} />
          <YAxis tickLine={false} axisLine={false} width={64} />
          <ChartTooltip content={<ChartTooltipContent />} />
          <Line type="monotone" dataKey={metric} stroke={`var(--color-${metric})`} dot={false} strokeWidth={2} />
        </LineChart>
      </ChartContainer>

      <div className="mb-6 flex flex-wrap gap-x-6 gap-y-2 border-t border-zinc-800 pt-3 text-sm text-zinc-400">
        <div>FIRE price <span className="font-medium text-white">{usd(last.firePrice)}</span></div>
        <div>frBTC supply <span className="font-medium text-white">{int(last.frbtcSupply)}</span></div>
        <div>DIESEL market cap <span className="font-medium text-white">{usd(last.dieselMarketcap)}</span></div>
        <div>BTC/USD <span className="font-medium text-white">{usd(last.btcUsd)}</span></div>
        <div>BTC/DIESEL <span className="font-medium text-white">{last.btcDiesel ?? "—"}</span></div>
        <div>BTC/FIRE <span className="font-medium text-white">{last.btcFire ?? "—"}</span></div>
      </div>

      <section>
        <h2 className="mb-2 font-semibold text-white">History</h2>
        <table className="w-full text-sm">
          <thead className="text-left text-zinc-500"><tr><th className="py-1">Date</th><th>Holders</th><th>DIESEL $</th><th>BTC locked</th><th>Market cap</th></tr></thead>
          <tbody>
            {[...series].reverse().map((p) => (
              <tr key={p.date} className="border-t border-zinc-800 text-zinc-300">
                <td className="py-1">{p.date}</td><td>{int(p.dieselHolders)}</td><td>{usd(p.dieselPrice)}</td><td>{btc(p.btcLocked)}</td><td>{usd(p.dieselMarketcap)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </section>
    </div>
  )
}
