"use client"

import { useEffect, useState } from "react"
import { Flame, Lock, ArrowUpFromLine, Scale, Activity } from "lucide-react"
import { Skeleton, SkeletonStats } from "@/components/cms/Skeleton"

interface FrbtcStats {
  frBtcIssued: number | null
  btcLocked: number | null
  totalUnwrapsBtc: number | null
}

interface HealthEndpoint {
  id: string
  name: string
  status: "ok" | "error" | "timeout"
  height: number | null
  latency?: { totalMs?: number } | null
  error?: string | null
  kind?: string
}
interface HealthComparison {
  height: number
  reservesMatch: boolean
  dieselMatch: boolean
  divergentEndpoints?: string[]
}
interface HealthSnapshot {
  timestamp: string
  endpoints: HealthEndpoint[]
  comparison: HealthComparison | null
  healthy: boolean
  error?: string
}

const HEALTH_POLL_MS = 180_000 // 3 min, matching the server-side cache TTL
const fmtBtc = (n: number | null) => (n == null ? "—" : n.toLocaleString("en-US", { maximumFractionDigits: 4 }))

async function getJson<T>(url: string): Promise<T | null> {
  try {
    const r = await fetch(url, { cache: "no-store" })
    return (await r.json()) as T
  } catch {
    return null
  }
}

export function DashboardClient() {
  const [stats, setStats] = useState<FrbtcStats | null>(null)
  const [health, setHealth] = useState<HealthSnapshot | null>(null)
  const [healthLoading, setHealthLoading] = useState(true)

  useEffect(() => {
    Promise.all([
      getJson<{ frBtcIssued: number }>("/api/frbtc-issued"),
      getJson<{ btcLocked: number }>("/api/alkanes-btc-locked"),
      getJson<{ totalUnwrapsBtc: number | null }>("/api/alkanes-total-unwraps"),
    ]).then(([issued, locked, unwraps]) => {
      setStats({
        frBtcIssued: issued?.frBtcIssued ?? null,
        btcLocked: locked?.btcLocked ?? null,
        totalUnwrapsBtc: unwraps?.totalUnwrapsBtc ?? null,
      })
    })
  }, [])

  useEffect(() => {
    let alive = true
    const load = async () => {
      const h = await getJson<HealthSnapshot>("/api/network-health")
      if (alive) { setHealth(h); setHealthLoading(false) }
    }
    load()
    const id = setInterval(load, HEALTH_POLL_MS)
    return () => { alive = false; clearInterval(id) }
  }, [])

  const peg =
    stats?.btcLocked != null && stats?.frBtcIssued != null && stats.frBtcIssued > 0
      ? (stats.btcLocked / stats.frBtcIssued) * 100
      : null

  return (
    <div className="space-y-8">
      {/* frBTC high-level stats */}
      <section>
        <h2 className="mb-3 text-sm font-semibold uppercase tracking-wide text-zinc-500">frBTC</h2>
        {!stats ? (
          <SkeletonStats count={4} />
        ) : (
          <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
            <StatCard icon={<Flame size={15} className="text-orange-400/80" />} label="frBTC issued" value={fmtBtc(stats.frBtcIssued)} unit="frBTC" accent />
            <StatCard icon={<Lock size={15} className="text-sky-400/80" />} label="BTC locked" value={fmtBtc(stats.btcLocked)} unit="BTC" />
            <StatCard icon={<Scale size={15} className="text-emerald-400/80" />} label="Collateralization" value={peg == null ? "—" : `${peg.toFixed(1)}%`}
              sub={peg != null ? (peg >= 99.5 ? "healthy peg" : "under-collateralized") : undefined}
              subClass={peg != null && peg >= 99.5 ? "text-emerald-400" : "text-amber-400"} />
            <StatCard icon={<ArrowUpFromLine size={15} className="text-zinc-400" />} label="Total unwraps" value={fmtBtc(stats.totalUnwrapsBtc)} unit="BTC" />
          </div>
        )}
      </section>

      {/* Network health (mainnet.subfrost.io divergence snapshot) */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-sm font-semibold uppercase tracking-wide text-zinc-500">Network health · mainnet.subfrost.io</h2>
          {health && !healthLoading && (
            <span className="text-xs text-zinc-600">updated {new Date(health.timestamp).toLocaleTimeString()}</span>
          )}
        </div>

        {healthLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-xl" />
            <Skeleton className="h-40 rounded-xl" />
          </div>
        ) : !health || health.error ? (
          <div className="rounded-xl border border-red-900/50 bg-red-950/20 p-4 text-sm text-red-300">
            <Activity size={15} className="mb-1 inline" /> Health unavailable{health?.error ? ` — ${health.error}` : ""}.
          </div>
        ) : (
          <HealthPanel health={health} />
        )}
      </section>
    </div>
  )
}

function HealthPanel({ health }: { health: HealthSnapshot }) {
  const c = health.comparison
  const maxHeight = Math.max(0, ...health.endpoints.map((e) => e.height ?? 0))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
        <span className={`inline-flex items-center gap-2 rounded-full px-3 py-1 text-sm font-semibold ${health.healthy ? "bg-emerald-900/40 text-emerald-300" : "bg-red-900/40 text-red-300"}`}>
          <span className={`h-2 w-2 rounded-full ${health.healthy ? "bg-emerald-400" : "bg-red-400"}`} />
          {health.healthy ? "Healthy" : "Divergent"}
        </span>
        {c && (
          <>
            <Pill ok={c.reservesMatch} label="reserves" />
            <Pill ok={c.dieselMatch} label="supply" />
            <span className="text-xs text-zinc-500">tip {c.height.toLocaleString()}</span>
            {c.divergentEndpoints && c.divergentEndpoints.length > 0 && (
              <span className="text-xs text-amber-400">{c.divergentEndpoints.length} divergent</span>
            )}
          </>
        )}
      </div>

      <div className="overflow-x-auto rounded-xl border border-zinc-800">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
            <tr>
              <th className="px-4 py-2.5">Indexer</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Height</th>
              <th className="px-4 py-2.5 text-right">Lag</th>
              <th className="px-4 py-2.5 text-right">Latency</th>
            </tr>
          </thead>
          <tbody>
            {health.endpoints.map((e) => {
              const lag = e.height != null && maxHeight > 0 ? e.height - maxHeight : null
              return (
                <tr key={e.id} className="border-t border-zinc-800">
                  <td className="px-4 py-2 text-zinc-200">{e.name}{e.kind === "espo" && <span className="ml-1 text-[10px] text-zinc-600">espo</span>}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1.5 ${e.status === "ok" ? "text-emerald-300" : "text-red-300"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${e.status === "ok" ? "bg-emerald-400" : "bg-red-400"}`} />
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-300">{e.height?.toLocaleString() ?? "—"}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${lag != null && lag < 0 ? "text-amber-400" : "text-zinc-600"}`}>{lag != null && lag < 0 ? lag : lag === 0 ? "0" : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-zinc-500">{e.latency?.totalMs != null ? `${e.latency.totalMs}ms` : "—"}</td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </div>
  )
}

function Pill({ ok, label }: { ok: boolean; label: string }) {
  return (
    <span className={`inline-flex items-center gap-1.5 rounded px-2 py-0.5 text-xs ${ok ? "bg-emerald-900/30 text-emerald-300" : "bg-red-900/30 text-red-300"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-emerald-400" : "bg-red-400"}`} />{label} {ok ? "match" : "diverge"}
    </span>
  )
}

function StatCard({ icon, label, value, unit, sub, subClass, accent }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; sub?: string; subClass?: string; accent?: boolean
}) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
      <div className="flex items-center gap-1.5 text-xs uppercase tracking-wide text-zinc-500">{icon}{label}</div>
      <div className={`mt-1 text-xl font-semibold tabular-nums ${accent ? "text-sky-300" : "text-white"}`}>
        {value}{unit && <span className="ml-1 text-xs font-normal text-zinc-500">{unit}</span>}
      </div>
      {sub && <div className={`mt-0.5 text-xs ${subClass ?? "text-zinc-500"}`}>{sub}</div>}
    </div>
  )
}
