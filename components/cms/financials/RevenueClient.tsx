"use client"

import { useMemo, type ReactNode } from "react"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { Tabs, TabsList, TabsTrigger, TabsContent } from "@/components/ui/tabs"
import {
  denseDailySeries,
  type BtcSource, type RevenueOverview, type RevenueSeries, type RevenueUnit, type PeriodRollups,
  type StripeSubscriptionSummary,
} from "@/lib/financials/revenue"

const usd = (n: number) =>
  n.toLocaleString("en-US", { style: "currency", currency: "USD", maximumFractionDigits: 2 })
const btc = (n: number) => `₿${n.toLocaleString("en-US", { maximumFractionDigits: 8 })}`
const fmt = (unit: RevenueUnit) => (unit === "USD" ? usd : btc)
const mmdd = (d: string) => d.slice(5) // YYYY-MM-DD → MM-DD

const btcConfig: ChartConfig = { amount: { label: "BTC fee revenue", color: "#fb923c" } } // orange-400
const usdConfig: ChartConfig = { amount: { label: "Stripe revenue (USD)", color: "#a78bfa" } } // violet-400

const tabTrigger =
  "text-zinc-400 data-[state=active]:bg-zinc-800 data-[state=active]:text-white"

export function RevenueClient({ overview }: { overview: RevenueOverview }) {
  return (
    <Tabs defaultValue="overview" className="space-y-6">
      <TabsList className="bg-zinc-900/70 border border-zinc-800">
        <TabsTrigger value="overview" className={tabTrigger}>Overview</TabsTrigger>
        <TabsTrigger value="protocol" className={tabTrigger}>Protocol</TabsTrigger>
        <TabsTrigger value="api" className={tabTrigger}>API</TabsTrigger>
      </TabsList>

      <TabsContent value="overview">
        <CombinedOverview overview={overview} />
      </TabsContent>

      <TabsContent value="protocol">
        <RevenueSection
          title="frBTC wrap/unwrap fees"
          subtitle="0.1% of every confirmed wrap + unwrap, accrued in BTC."
          series={overview.btcFee}
          config={btcConfig}
          note={overview.btcFeeNote}
          badge={<BtcSourceBadge source={overview.btcSource} tip={overview.indexerTip} />}
        />
      </TabsContent>

      <TabsContent value="api">
        <RevenueSection
          title="Stripe charges"
          subtitle={
            overview.stripeLive
              ? "Succeeded Stripe charges, live from the Stripe API, in USD."
              : "Succeeded Stripe charges from the local webhook log (live API unreachable), in USD."
          }
          series={overview.stripe}
          config={usdConfig}
          note={overview.stripeNote}
          lead={<SubscriptionCard subs={overview.stripeSubs} live={overview.stripeLive} />}
        />
      </TabsContent>

      <p className="text-[11px] text-zinc-600">
        Generated {new Date(overview.generatedAt).toLocaleString("en-US")}. Windows are
        trailing from now (1d/7d/30d) and calendar year-to-date (UTC).
      </p>
    </Tabs>
  )
}

/** Main tab: headline metrics from both revenue streams side by side, plus a
 *  compact chart for each. Protocol is BTC (frBTC fees), API is USD (Stripe). */
function CombinedOverview({ overview }: { overview: RevenueOverview }) {
  const p = overview.btcFee.rollups
  const s = overview.stripe.rollups
  const mrr = overview.stripeSubs?.mrr ?? null
  return (
    <div className="space-y-6">
      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <Metric label="Protocol · all-time" value={btc(p.all)} accent="#fb923c" />
        <Metric label="Protocol · 30d" value={btc(p.d30)} />
        <Metric label="API · all-time" value={usd(s.all)} accent="#a78bfa" />
        <Metric label="API · MRR" value={mrr != null ? usd(mrr) : "—"} sub={mrr != null ? `≈ ${usd(mrr * 12)} ARR` : undefined} />
      </div>

      <div className="grid gap-4 lg:grid-cols-2">
        <div className="space-y-3 rounded-xl border border-zinc-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">frBTC fees <span className="font-normal text-zinc-500">(BTC)</span></h3>
            <BtcSourceBadge source={overview.btcSource} tip={overview.indexerTip} />
          </div>
          <RevenueChart series={overview.btcFee} config={btcConfig} height={200} />
        </div>
        <div className="space-y-3 rounded-xl border border-zinc-800 p-3">
          <div className="flex items-center justify-between gap-2">
            <h3 className="text-sm font-semibold text-white">Stripe charges <span className="font-normal text-zinc-500">(USD)</span></h3>
            <span className="text-[11px] text-zinc-500">{overview.stripeLive ? "live API" : "webhook log"}</span>
          </div>
          <RevenueChart series={overview.stripe} config={usdConfig} height={200} />
        </div>
      </div>
    </div>
  )
}

function Metric({ label, value, sub, accent }: { label: string; value: string; sub?: string; accent?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 p-3">
      <div className="flex items-center gap-1.5 text-xs text-zinc-500">
        {accent ? <span className="h-2 w-2 rounded-full" style={{ backgroundColor: accent }} /> : null}
        {label}
      </div>
      <div className="mt-1 break-words text-xl font-semibold text-white">{value}</div>
      {sub ? <div className="mt-0.5 text-[11px] text-zinc-500">{sub}</div> : null}
    </div>
  )
}

/** The area chart for a revenue series — shared by the overview + detail tabs. */
function RevenueChart({ series, config, height = 240 }: { series: RevenueSeries; config: ChartConfig; height?: number }) {
  const f = fmt(series.unit)
  const chartData = useMemo(() => denseDailySeries(series.daily, series.unit === "USD" ? 2 : 8), [series])
  if (chartData.length === 0) {
    return (
      <div className="flex items-center justify-center text-sm text-zinc-600" style={{ height }}>
        No revenue in range yet.
      </div>
    )
  }
  return (
    <ChartContainer config={config} className="w-full" style={{ height }}>
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
          content={<ChartTooltipContent labelFormatter={(l) => String(l)} formatter={(value) => f(Number(value))} />}
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
  )
}

function RevenueSection({
  title, subtitle, series, config, note, lead, badge,
}: {
  title: string
  subtitle: string
  series: RevenueSeries
  config: ChartConfig
  note?: string
  lead?: ReactNode
  badge?: ReactNode
}) {
  const f = fmt(series.unit)
  const recent = useMemo(() => [...series.daily].reverse().slice(0, 14), [series.daily])

  return (
    <section className="space-y-4">
      <div className="flex flex-wrap items-start justify-between gap-2">
        <div>
          <h2 className="text-lg font-semibold text-white">{title}</h2>
          <p className="text-xs text-zinc-500">{subtitle}</p>
        </div>
        {badge}
      </div>

      {lead}

      <RollupCards rollups={series.rollups} unit={series.unit} />

      <div className="rounded-xl border border-zinc-800 p-3">
        <RevenueChart series={series} config={config} />
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

/** Small source/freshness badge on the BTC fee card: on-chain indexer (with the
 *  last synced block) vs. the ledger-table fallback. Mirrors the Stripe live/
 *  fallback signalling. */
function BtcSourceBadge({ source, tip }: { source: BtcSource; tip: number | null }) {
  if (source === "indexer") {
    return (
      <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-emerald-900/60 bg-emerald-950/30 px-2.5 py-1 text-[11px] font-medium text-emerald-300">
        <span className="h-1.5 w-1.5 rounded-full bg-emerald-400" />
        on-chain indexer{tip != null ? ` @ block ${tip.toLocaleString("en-US")}` : ""}
      </span>
    )
  }
  return (
    <span className="inline-flex items-center gap-1.5 whitespace-nowrap rounded-full border border-zinc-800 bg-zinc-900/50 px-2.5 py-1 text-[11px] font-medium text-zinc-400">
      <span className="h-1.5 w-1.5 rounded-full bg-zinc-500" />
      from ledger tables
    </span>
  )
}

function SubscriptionCard({ subs, live }: { subs: StripeSubscriptionSummary | null; live: boolean }) {
  if (!subs) {
    return (
      <div className="rounded-lg border border-zinc-800 bg-zinc-900/30 p-4 text-sm text-zinc-500">
        Active subscriptions unavailable — {live ? "no billing subscriptions found." : "live Stripe API unreachable."}
      </div>
    )
  }
  return (
    <div className="flex flex-wrap items-baseline gap-x-6 gap-y-1 rounded-lg border border-emerald-900/50 bg-emerald-950/20 p-4">
      <div>
        <div className="text-xs text-zinc-500">Active subscriptions</div>
        <div className="mt-0.5 text-2xl font-semibold text-white">{subs.activeCount}</div>
      </div>
      <div>
        <div className="text-xs text-zinc-500">MRR (monthly recurring)</div>
        <div className="mt-0.5 text-2xl font-semibold text-emerald-300">{usd(subs.mrr)}</div>
      </div>
      <div className="ml-auto self-center text-[11px] text-zinc-500">
        ≈ {usd(subs.mrr * 12)} ARR
      </div>
    </div>
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
