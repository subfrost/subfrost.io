"use client"

import { useMemo } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import {
  denseDailySeries,
  type RevenueOverview, type RevenueSeries, type RevenueUnit, type PeriodRollups,
} from "@/lib/financials/revenue"

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
const btc = (n: number) => `₿${n.toLocaleString("en-US", { maximumFractionDigits: 8 })}`
const fmt = (unit: RevenueUnit) => (unit === "USD" ? usd : btc)
const mmdd = (d: string) => d.slice(5) // YYYY-MM-DD → MM-DD

const btcConfig: ChartConfig = { amount: { label: "BTC fee revenue", color: "#fb923c" } } // orange-400
const usdConfig: ChartConfig = { amount: { label: "Stripe revenue (USD)", color: "#a78bfa" } } // violet-400

export function RevenueClient({ overview }: { overview: RevenueOverview }) {
  return (
    <div className="space-y-8">
      <RevenueSection
        title="BTC wrap/unwrap fees"
        subtitle="0.3% of every confirmed wrap + unwrap, accrued in BTC."
        series={overview.btcFee}
        config={btcConfig}
        note={overview.btcFeeNote}
      />
      <RevenueSection
        title="Stripe charges"
        subtitle="Succeeded Stripe charges synced locally, in USD."
        series={overview.stripe}
        config={usdConfig}
      />
      <p className="text-[11px] text-zinc-600">
        Generated {new Date(overview.generatedAt).toLocaleString("en-US")}. Windows are
        trailing from now (1d/7d/30d) and calendar year-to-date (UTC).
      </p>
    </div>
  )
}

function RevenueSection({
  title, subtitle, series, config, note,
}: {
  title: string
  subtitle: string
  series: RevenueSeries
  config: ChartConfig
  note?: string
}) {
  const f = fmt(series.unit)
  const chartData = useMemo(() => denseDailySeries(series.daily, series.unit === "USD" ? 2 : 8), [series])
  const recent = useMemo(() => [...series.daily].reverse().slice(0, 14), [series.daily])

  return (
    <section className="space-y-4">
      <div>
        <h2 className="text-lg font-semibold text-white">{title}</h2>
        <p className="text-xs text-zinc-500">{subtitle}</p>
      </div>

      <RollupCards rollups={series.rollups} unit={series.unit} />

      <div className="rounded-xl border border-zinc-800 p-3">
        {chartData.length === 0 ? (
          <div className="flex h-[240px] items-center justify-center text-sm text-zinc-600">
            No revenue in range yet.
          </div>
        ) : (
          <ChartContainer config={config} className="h-[240px] w-full">
            <AreaChart data={chartData} margin={{ left: 4, right: 8, top: 8 }}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} tickFormatter={mmdd} minTickGap={24} />
              <YAxis
                tickLine={false}
                axisLine={false}
                width={64}
                tickFormatter={(v) => (series.unit === "USD" ? `$${Number(v).toLocaleString("en-US")}` : `₿${Number(v).toFixed(4)}`)}
              />
              <ChartTooltip
                content={
                  <ChartTooltipContent
                    labelFormatter={(l) => String(l)}
                    formatter={(value) => f(Number(value))}
                  />
                }
              />
              <Area
                dataKey="amount"
                type="monotone"
                stroke="var(--color-amount)"
                fill="var(--color-amount)"
                fillOpacity={0.18}
                strokeWidth={2}
              />
            </AreaChart>
          </ChartContainer>
        )}
      </div>

      {note ? <p className="text-[11px] leading-relaxed text-zinc-500">{note}</p> : null}

      {recent.length > 0 && (
        <div className="overflow-x-auto rounded-xl border border-zinc-800">
          <table className="w-full min-w-[360px] text-sm rtable">
            <thead className="bg-zinc-900/60 text-left text-xs text-zinc-500">
              <tr>
                <th className="px-3 py-2">Day (UTC)</th>
                <th className="px-3 py-2 text-right">Revenue ({series.unit})</th>
              </tr>
            </thead>
            <tbody>
              {recent.map((p) => (
                <tr key={p.date} className="border-t border-zinc-900">
                  <td data-label="Day (UTC)" className="px-3 py-2 font-mono text-zinc-300">{p.date}</td>
                  <td data-label="Revenue" className="px-3 py-2 text-right text-zinc-200">{f(p.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </section>
  )
}

function RollupCards({ rollups, unit }: { rollups: PeriodRollups; unit: RevenueUnit }) {
  const f = fmt(unit)
  const cards: { label: string; value: number }[] = [
    { label: "1d", value: rollups.d1 },
    { label: "7d", value: rollups.d7 },
    { label: "30d", value: rollups.d30 },
    { label: "YTD", value: rollups.ytd },
  ]
  return (
    <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
      {cards.map((c) => (
        <div key={c.label} className="rounded-lg border border-zinc-800 p-3">
          <div className="text-xs text-zinc-500">{c.label}</div>
          <div className="mt-1 break-words text-lg font-semibold text-white">{f(c.value)}</div>
        </div>
      ))}
      <div className="col-span-2 rounded-lg border border-zinc-800 bg-zinc-900/30 p-3 sm:col-span-4">
        <div className="text-xs text-zinc-500">All-time</div>
        <div className="mt-1 break-words text-lg font-semibold text-white">{f(rollups.all)}</div>
      </div>
    </div>
  )
}
