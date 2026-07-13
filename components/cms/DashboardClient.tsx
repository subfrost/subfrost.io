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
        <h2 className="mb-5 text-[15px] font-medium text-[color:var(--ed-muted)]">frBTC</h2>
        {!stats ? (
          <SkeletonStats count={4} />
        ) : (
          <div className="grid gap-6 sm:grid-cols-2 xl:grid-cols-4">
            <StatCard icon={<Flame size={15} />} label="frBTC issued" value={fmtBtc(stats.frBtcIssued)} unit="frBTC" />
            <StatCard icon={<Lock size={15} />} label="BTC locked" value={fmtBtc(stats.btcLocked)} unit="BTC" />
            <StatCard icon={<Scale size={15} />} label="Collateralization" value={peg == null ? "—" : `${peg.toFixed(1)}%`}
              sub={peg != null ? (peg >= 99.5 ? "healthy peg" : "under-collateralized") : undefined}
              subClass={peg != null && peg >= 99.5 ? "text-[#0f7a4a]" : "text-[#b36b00]"} />
            <StatCard icon={<ArrowUpFromLine size={15} />} label="Total unwraps" value={fmtBtc(stats.totalUnwrapsBtc)} unit="BTC" />
          </div>
        )}
      </section>

      {/* Network health (mainnet.subfrost.io divergence snapshot) */}
      <section>
        <div className="mb-3 flex items-center justify-between">
          <h2 className="text-[15px] font-medium text-[color:var(--ed-muted)]">Network health · mainnet.subfrost.io</h2>
          {health && !healthLoading && (
            <span className="text-xs text-[color:var(--ed-muted)]">updated {new Date(health.timestamp).toLocaleTimeString()}</span>
          )}
        </div>

        {healthLoading ? (
          <div className="space-y-3">
            <Skeleton className="h-16 rounded-[6px]" />
            <Skeleton className="h-40 rounded-[6px]" />
          </div>
        ) : !health || health.error || !Array.isArray(health.endpoints) ? (
          <div className="border-t border-[#f0c3b7] py-4 text-sm text-[#b8321a]">
            <Activity size={15} className="mb-1 inline" /> Health unavailable{health?.error ? ` — ${health.error}` : ""}.
          </div>
        ) : (
          <HealthPanel health={health} />
        )}
      </section>
    </div>
  )
}

export function HealthPanel({ health }: { health: HealthSnapshot }) {
  const c = health.comparison
  // Defense in depth: the parent guard already requires an endpoints array, but
  // never let this panel be the thing that throws if that ever regresses.
  const endpoints = Array.isArray(health.endpoints) ? health.endpoints : []
  const maxHeight = Math.max(0, ...endpoints.map((e) => e.height ?? 0))
  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3 border-t border-[color:var(--ed-hair)] py-4">
        <span className={`inline-flex items-center gap-2 text-sm font-medium ${health.healthy ? "text-[#0f7a4a]" : "text-[#b8321a]"}`}>
          <span className={`h-2 w-2 rounded-full ${health.healthy ? "bg-[#1ea463]" : "bg-[#ec4521]"}`} />
          {health.healthy ? "Healthy" : "Divergent"}
        </span>
        {c && (
          <>
            <Pill ok={c.reservesMatch} label="reserves" />
            <Pill ok={c.dieselMatch} label="supply" />
            <span className="text-xs text-[color:var(--ed-muted)]">tip {c.height.toLocaleString()}</span>
            {c.divergentEndpoints && c.divergentEndpoints.length > 0 && (
              <span className="text-xs text-[#b36b00]">{c.divergentEndpoints.length} divergent</span>
            )}
          </>
        )}
      </div>

      <div className="overflow-x-auto border-t border-[color:var(--ed-hair)]">
        <table className="w-full min-w-[640px] text-sm">
          <thead className="text-left text-xs text-[color:var(--ed-muted)]">
            <tr>
              <th className="px-4 py-2.5">Indexer</th>
              <th className="px-4 py-2.5">Status</th>
              <th className="px-4 py-2.5 text-right">Height</th>
              <th className="px-4 py-2.5 text-right">Lag</th>
              <th className="px-4 py-2.5 text-right">Latency</th>
            </tr>
          </thead>
          <tbody>
            {endpoints.map((e) => {
              const lag = e.height != null && maxHeight > 0 ? e.height - maxHeight : null
              return (
                <tr key={e.id} className="border-t border-[color:var(--ed-hair)]">
                  <td className="px-4 py-2 text-[color:var(--ed-ink)]">{e.name}{e.kind === "espo" && <span className="ml-1 text-[10px] text-[color:var(--ed-muted)]">espo</span>}</td>
                  <td className="px-4 py-2">
                    <span className={`inline-flex items-center gap-1.5 ${e.status === "ok" ? "text-[#0f7a4a]" : "text-[#b8321a]"}`}>
                      <span className={`h-1.5 w-1.5 rounded-full ${e.status === "ok" ? "bg-[#1ea463]" : "bg-[#ec4521]"}`} />
                      {e.status}
                    </span>
                  </td>
                  <td className="px-4 py-2 text-right tabular-nums text-[color:var(--ed-body)]">{e.height?.toLocaleString() ?? "—"}</td>
                  <td className={`px-4 py-2 text-right tabular-nums ${lag != null && lag < 0 ? "text-[#b36b00]" : "text-[color:var(--ed-muted)]"}`}>{lag != null && lag < 0 ? lag : lag === 0 ? "0" : "—"}</td>
                  <td className="px-4 py-2 text-right tabular-nums text-[color:var(--ed-muted)]">{e.latency?.totalMs != null ? `${e.latency.totalMs}ms` : "—"}</td>
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
    <span className={`inline-flex items-center gap-1.5 text-xs ${ok ? "text-[#0f7a4a]" : "text-[#b8321a]"}`}>
      <span className={`h-1.5 w-1.5 rounded-full ${ok ? "bg-[#1ea463]" : "bg-[#ec4521]"}`} />{label} {ok ? "match" : "diverge"}
    </span>
  )
}

function StatCard({ icon, label, value, unit, sub, subClass }: {
  icon: React.ReactNode; label: string; value: string; unit?: string; sub?: string; subClass?: string
}) {
  return (
    <div className="border-t border-[color:var(--ed-hair)] pt-5">
      <div className="flex items-center gap-1.5 text-[14px] text-[color:var(--ed-muted)]">{icon}{label}</div>
      <div className="mt-3 font-mono text-[24px] font-semibold tabular-nums text-[color:var(--ed-ink)]">
        {value}{unit && <span className="ml-1 text-sm font-normal text-[color:var(--ed-muted)]">{unit}</span>}
      </div>
      {sub && <div className={`mt-1 text-xs ${subClass ?? "text-[color:var(--ed-muted)]"}`}>{sub}</div>}
    </div>
  )
}
