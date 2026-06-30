"use client"

import { useState } from "react"
import { LineChart, Line, CartesianGrid, XAxis, YAxis, ReferenceLine } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"
import type { XPostTableRow, XCurvePoint, AttributionRow } from "@/lib/marketing/x-series"

type View = "performance" | "attribution"

const int = (v: number | null) => (v === null ? "—" : v.toLocaleString("en-US"))
const pct = (v: number | null) => (v === null ? "—" : `${(v * 100).toFixed(1)}%`)
const delta = (v: number | null) => (v === null ? "—" : `${v >= 0 ? "+" : ""}${v.toLocaleString("en-US")}`)

const curveConfig: ChartConfig = {
  impressions: { label: "Impressions", color: "#38bdf8" },
  likes: { label: "Likes", color: "#34d399" },
  reposts: { label: "Reposts", color: "#fbbf24" },
  replies: { label: "Replies", color: "#f97316" },
  quotes: { label: "Quotes", color: "#a78bfa" },
  bookmarks: { label: "Bookmarks", color: "#60a5fa" },
}
const protocolConfig: ChartConfig = {
  dieselHolders: { label: "DIESEL holders", color: "#38bdf8" },
  btcLocked: { label: "BTC locked", color: "#fbbf24" },
  dieselPrice: { label: "DIESEL price", color: "#34d399" },
}

export function XAnalyticsClient(props: {
  posts: XPostTableRow[]
  curves: Record<string, XCurvePoint[]>
  attribution: AttributionRow[]
  protocolSeries: SeriesPoint[]
  configured: boolean
}) {
  const { posts, curves, attribution, protocolSeries, configured } = props
  const [view, setView] = useState<View>("performance")

  return (
    <div>
      <h1 className="mb-2 text-2xl font-bold text-white">X analytics</h1>

      {!configured && (
        <p className="mb-4 rounded-lg border border-amber-700/50 bg-amber-900/20 p-3 text-sm text-amber-300">
          X API não configurada — defina o secret <code>X_BEARER_TOKEN</code> (ESO) para ligar a ingestão.
        </p>
      )}

      <div className="mb-4 flex gap-1">
        {(["performance", "attribution"] as View[]).map((v) => (
          <button
            key={v}
            onClick={() => setView(v)}
            className={`rounded-md px-3 py-1.5 text-sm ${view === v ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}
          >
            {v === "performance" ? "Performance" : "Atribuição"}
          </button>
        ))}
      </div>

      {posts.length === 0 ? (
        <p className="rounded-lg border border-zinc-800 bg-zinc-900/60 p-4 text-sm text-zinc-400">
          Nenhum post capturado ainda — a ingestão diária roda quando o <code>X_BEARER_TOKEN</code> estiver populado.
        </p>
      ) : view === "performance" ? (
        <PerformanceView posts={posts} curves={curves} />
      ) : (
        <AttributionView attribution={attribution} protocolSeries={protocolSeries} />
      )}
    </div>
  )
}

function PerformanceView({ posts, curves }: { posts: XPostTableRow[]; curves: Record<string, XCurvePoint[]> }) {
  const [open, setOpen] = useState<string | null>(null)
  const totalImpressions = posts.reduce((s, p) => s + (p.metrics.impressions ?? 0), 0)
  const top = posts.reduce<XPostTableRow | null>((best, p) => (!best || (p.metrics.impressions ?? 0) > (best.metrics.impressions ?? 0) ? p : best), null)
  const rates = posts.map((p) => p.engagementRate).filter((v): v is number => v !== null)
  const avgRate = rates.length ? rates.reduce((a, b) => a + b, 0) / rates.length : null

  return (
    <div>
      <div className="mb-4 grid grid-cols-3 gap-3">
        <Hero label="Impressões (total)" value={int(totalImpressions)} />
        <Hero label="Top post" value={top ? int(top.metrics.impressions) : "—"} />
        <Hero label="Engajamento médio" value={pct(avgRate)} hint="(likes+reposts+replies+quotes+bookmarks)/impressions" />
      </div>

      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1">Post</th><th>Data</th><th>Impr.</th><th>Likes</th><th>Reposts</th><th>Replies</th><th>Quotes</th><th>Bkmk</th><th>Eng.</th>
          </tr>
        </thead>
        <tbody>
          {posts.map((p) => (
            <tr key={p.tweetId} className="cursor-pointer border-t border-zinc-800 text-zinc-300 hover:bg-zinc-800/40" onClick={() => setOpen(open === p.tweetId ? null : p.tweetId)}>
              <td className="max-w-[280px] truncate py-1">
                <a href={p.url} target="_blank" rel="noreferrer" className="text-sky-400 hover:underline" onClick={(e) => e.stopPropagation()}>↗</a>{" "}
                {p.text}
              </td>
              <td>{p.postedAt.slice(0, 10)}</td>
              <td>{int(p.metrics.impressions)}</td><td>{int(p.metrics.likes)}</td><td>{int(p.metrics.reposts)}</td>
              <td>{int(p.metrics.replies)}</td><td>{int(p.metrics.quotes)}</td><td>{int(p.metrics.bookmarks)}</td>
              <td>{pct(p.engagementRate)}</td>
            </tr>
          ))}
        </tbody>
      </table>

      {open && curves[open] && (
        <div className="mt-4 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3">
          <div className="mb-2 text-xs text-zinc-500">Curva diária — {open}</div>
          <ChartContainer config={curveConfig} className="h-[240px] w-full">
            <LineChart data={curves[open]}>
              <CartesianGrid vertical={false} />
              <XAxis dataKey="date" tickLine={false} axisLine={false} />
              <YAxis tickLine={false} axisLine={false} width={56} />
              <ChartTooltip content={<ChartTooltipContent />} />
              {(["impressions", "likes", "reposts"] as const).map((k) => (
                <Line key={k} type="monotone" dataKey={k} stroke={`var(--color-${k})`} dot={false} strokeWidth={2} />
              ))}
            </LineChart>
          </ChartContainer>
        </div>
      )}
    </div>
  )
}

function AttributionView({ attribution, protocolSeries }: { attribution: AttributionRow[]; protocolSeries: SeriesPoint[] }) {
  const [metric, setMetric] = useState<keyof typeof protocolConfig>("dieselHolders")
  return (
    <div>
      <p className="mb-3 rounded-lg border border-zinc-800 bg-zinc-900/60 p-3 text-xs text-zinc-400">
        ⚠️ Exploratório — <span className="text-zinc-200">sinal, não prova</span>. Vários posts/dia + ruído de mercado tornam atribuição causal impossível.
      </p>

      <div className="mb-2 flex flex-wrap gap-1">
        {(Object.keys(protocolConfig) as (keyof typeof protocolConfig)[]).map((m) => (
          <button key={m} onClick={() => setMetric(m)} className={`rounded-md px-3 py-1.5 text-sm ${metric === m ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
            {protocolConfig[m].label}
          </button>
        ))}
      </div>

      {protocolSeries.length > 0 && (
        <ChartContainer config={protocolConfig} className="mb-6 h-[280px] w-full">
          <LineChart data={protocolSeries}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={64} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Line type="monotone" dataKey={metric} stroke={`var(--color-${metric})`} dot={false} strokeWidth={2} />
            {attribution.map((a) => (
              <ReferenceLine key={a.tweetId} x={a.postedAt.slice(0, 10)} stroke="#71717a" strokeDasharray="3 3" />
            ))}
          </LineChart>
        </ChartContainer>
      )}

      <table className="w-full text-sm">
        <thead className="text-left text-zinc-500">
          <tr>
            <th className="py-1">Post</th><th>Data</th><th>Eng.</th>
            <th>Δhold 1d</th><th>3d</th><th>7d</th><th>ΔBTC 1d</th><th>3d</th><th>7d</th>
          </tr>
        </thead>
        <tbody>
          {attribution.map((a) => (
            <tr key={a.tweetId} className="border-t border-zinc-800 text-zinc-300">
              <td className="max-w-[240px] truncate py-1">{a.text}</td>
              <td>{a.postedAt.slice(0, 10)}</td><td>{pct(a.engagementRate)}</td>
              <td>{delta(a.holders.d1)}</td><td>{delta(a.holders.d3)}</td><td>{delta(a.holders.d7)}</td>
              <td>{delta(a.btcLocked.d1)}</td><td>{delta(a.btcLocked.d3)}</td><td>{delta(a.btcLocked.d7)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}

function Hero({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs text-zinc-500" title={hint}>{label}</div>
      <div className="mt-1 text-2xl font-bold text-white">{value}</div>
    </div>
  )
}
