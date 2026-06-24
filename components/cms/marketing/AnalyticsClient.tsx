"use client"

import { useRouter, usePathname } from "next/navigation"
import { Area, AreaChart, CartesianGrid, XAxis, YAxis } from "recharts"
import { ChartContainer, ChartTooltip, ChartTooltipContent, type ChartConfig } from "@/components/ui/chart"
import { RANGE_PRESETS } from "@/lib/analytics/range"
import type { AnalyticsDashboard } from "@/lib/analytics/source"

const fmt = (n: number) => n.toLocaleString("en-US")
const secs = (n: number | null) => (n === null ? "—" : `${Math.round(n)}s`)

const chartConfig: ChartConfig = {
  activeUsers: { label: "Active users", color: "#38bdf8" },
  sessions: { label: "Sessions", color: "#34d399" },
  pageViews: { label: "Pageviews", color: "#a78bfa" },
}

function Chip({ label, value }: { label: string; value: number }) {
  return (
    <div className="rounded-lg border border-zinc-800 bg-zinc-900/60 px-4 py-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="text-xl font-bold text-white">{fmt(value)}</div>
    </div>
  )
}

export function AnalyticsClient({ dashboard }: { dashboard: AnalyticsDashboard }) {
  const router = useRouter()
  const pathname = usePathname()
  const { visitors, topPages, trafficSources, articleEngagement, range } = dashboard

  const pick = (preset: string) => router.push(`${pathname}?range=${preset}`)

  return (
    <div>
      <div className="mb-4 flex items-center justify-between">
        <h1 className="text-2xl font-bold text-white">Site analytics</h1>
        <div className="flex gap-1">
          {RANGE_PRESETS.map((p) => (
            <button key={p} onClick={() => pick(p)}
              className={`rounded-md px-3 py-1.5 text-sm ${range.preset === p ? "bg-sky-600 text-white" : "border border-zinc-700 text-zinc-300 hover:bg-zinc-800"}`}>
              {p}
            </button>
          ))}
        </div>
      </div>

      {!dashboard.configured && (
        <div className="mb-6 rounded-lg border border-amber-500/30 bg-amber-500/10 p-4 text-sm text-amber-300">
          Analytics is not configured. Set <code>GA4_PROPERTY_ID</code> and <code>GA_SERVICE_ACCOUNT_JSON</code> (a service account with Analytics Viewer on property G-0RV3B8BK4B).
        </div>
      )}

      <div className="mb-4 grid grid-cols-3 gap-3">
        <Chip label="Active users" value={visitors.totals.activeUsers} />
        <Chip label="Sessions" value={visitors.totals.sessions} />
        <Chip label="Pageviews" value={visitors.totals.pageViews} />
      </div>

      {visitors.points.length > 0 && (
        <ChartContainer config={chartConfig} className="mb-6 h-[260px] w-full">
          <AreaChart data={visitors.points}>
            <CartesianGrid vertical={false} />
            <XAxis dataKey="date" tickLine={false} axisLine={false} />
            <YAxis tickLine={false} axisLine={false} width={48} />
            <ChartTooltip content={<ChartTooltipContent />} />
            <Area type="monotone" dataKey="activeUsers" stroke="var(--color-activeUsers)" fill="var(--color-activeUsers)" fillOpacity={0.15} />
            <Area type="monotone" dataKey="sessions" stroke="var(--color-sessions)" fill="var(--color-sessions)" fillOpacity={0.1} />
            <Area type="monotone" dataKey="pageViews" stroke="var(--color-pageViews)" fill="var(--color-pageViews)" fillOpacity={0.1} />
          </AreaChart>
        </ChartContainer>
      )}

      <div className="grid gap-6 md:grid-cols-2">
        <section>
          <h2 className="mb-2 font-semibold text-white">Top pages</h2>
          {topPages.length === 0 ? <p className="text-sm text-zinc-500">No data.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500"><tr><th className="py-1">Page</th><th>Views</th></tr></thead>
              <tbody>{topPages.map((p) => (
                <tr key={p.path} className="border-t border-zinc-800 text-zinc-300"><td className="py-1">{p.title ?? p.path}</td><td>{fmt(p.pageViews)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>

        <section>
          <h2 className="mb-2 font-semibold text-white">Traffic sources</h2>
          {trafficSources.length === 0 ? <p className="text-sm text-zinc-500">No data.</p> : (
            <table className="w-full text-sm">
              <thead className="text-left text-zinc-500"><tr><th className="py-1">Channel</th><th>Source</th><th>Sessions</th></tr></thead>
              <tbody>{trafficSources.map((s, i) => (
                <tr key={`${s.channel}-${s.source}-${i}`} className="border-t border-zinc-800 text-zinc-300"><td className="py-1">{s.channel}</td><td>{s.source ?? "—"}</td><td>{fmt(s.sessions)}</td></tr>
              ))}</tbody>
            </table>
          )}
        </section>
      </div>

      <section className="mt-6">
        <h2 className="mb-2 font-semibold text-white">Article engagement</h2>
        {articleEngagement.length === 0 ? <p className="text-sm text-zinc-500">No data.</p> : (
          <table className="w-full text-sm">
            <thead className="text-left text-zinc-500"><tr><th className="py-1">Article</th><th>Views</th><th>Avg engagement</th></tr></thead>
            <tbody>{articleEngagement.map((a) => (
              <tr key={a.slug} className="border-t border-zinc-800 text-zinc-300"><td className="py-1">{a.title ?? a.slug}</td><td>{fmt(a.pageViews)}</td><td>{secs(a.avgEngagementSeconds)}</td></tr>
            ))}</tbody>
          </table>
        )}
      </section>
    </div>
  )
}
