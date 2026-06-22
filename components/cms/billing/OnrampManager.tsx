"use client"

import { useCallback, useEffect, useState } from "react"
import { listOnrampSessionsAction } from "@/actions/cms/billing"
import { centsToUsd } from "@/lib/stripe/format"
import {
  ONRAMP_STATUSES,
  type OnrampMetrics,
  type OnrampPeriod,
  type OnrampSession,
  type OnrampStatus,
} from "@/lib/stripe/shapes"
import { SkeletonTable } from "@/components/cms/Skeleton"

const PERIODS: OnrampPeriod[] = ["7d", "30d", "all"]
const STATUS_LABEL: Record<OnrampStatus, string> = {
  initialized: "Initialized",
  requires_payment: "Awaiting payment",
  fulfillment_processing: "Processing",
  fulfillment_complete: "Complete",
  rejected: "Rejected",
  expired: "Expired",
}

function badgeClass(status: OnrampStatus): string {
  if (status === "fulfillment_complete") return "border-green-700/50 bg-green-950/40 text-green-400"
  if (status === "rejected" || status === "expired") return "border-red-700/50 bg-red-950/40 text-red-400"
  return "border-amber-700/50 bg-amber-950/40 text-amber-400"
}

const fmtCrypto = (n: number | null, ccy: string): string => (n == null ? `— ${ccy}` : `${n} ${ccy}`)
const short = (w: string): string => (w.length > 16 ? `${w.slice(0, 8)}…${w.slice(-6)}` : w)

function stripeUrl(id: string, live: boolean): string {
  // Convenience deep-link; exact path confirmed against the dashboard, falls back to home.
  return `https://dashboard.stripe.com/${live ? "" : "test/"}crypto/onramp-sessions/${id}`
}

export function OnrampManager() {
  const [sessions, setSessions] = useState<OnrampSession[]>([])
  const [metrics, setMetrics] = useState<OnrampMetrics | null>(null)
  const [live, setLive] = useState(false)
  const [period, setPeriod] = useState<OnrampPeriod>("30d")
  const [rejectedOnly, setRejectedOnly] = useState(false)
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)

  const fetchSessions = useCallback(async () => {
    setLoading(true)
    const res = await listOnrampSessionsAction(period)
    if (res.ok) {
      setSessions(res.sessions)
      setMetrics(res.metrics)
      setLive(res.live)
      setBanner(null)
    } else {
      setBanner(res.error)
    }
    setLoading(false)
  }, [period])

  useEffect(() => {
    fetchSessions()
  }, [fetchSessions])

  const rows = rejectedOnly ? sessions.filter((s) => s.status === "rejected") : sessions

  if (loading) return <SkeletonTable />

  return (
    <div className="space-y-6">
      {banner && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {banner}
          <button type="button" onClick={() => setBanner(null)} className="ml-2 underline">
            dismiss
          </button>
        </div>
      )}

      {live && sessions.length === 0 && (
        <div className="rounded-lg bg-zinc-900/60 p-3 text-sm text-zinc-400">
          On-ramp isn&apos;t enabled on this Stripe account yet — nothing to show.
        </div>
      )}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <div className="flex gap-1">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              onClick={() => setPeriod(p)}
              className={`rounded-md border px-2.5 py-1 text-xs ${period === p ? "border-zinc-500 bg-zinc-800 text-white" : "border-zinc-800 text-zinc-400"}`}
            >
              {p}
            </button>
          ))}
        </div>
        <label className="ml-2 flex items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={rejectedOnly} onChange={(e) => setRejectedOnly(e.target.checked)} />
          Rejected only
        </label>
      </div>

      {/* Metrics */}
      {metrics && (
        <section className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
          <Metric label="Sessions" value={String(metrics.total)} />
          <Metric label="Completed" value={String(metrics.completed)} />
          <Metric label="Conversion" value={`${(metrics.conversionRate * 100).toFixed(1)}%`} />
          <Metric label="Fiat volume" value={centsToUsd(metrics.fiatVolume)} />
          <Metric label="Fees" value={centsToUsd(metrics.totalFees)} />
        </section>
      )}

      {/* Status breakdown */}
      {metrics && (
        <section className="flex flex-wrap gap-2">
          {ONRAMP_STATUSES.map((st) => (
            <span
              key={st}
              className={`rounded-md border px-2 py-0.5 text-xs ${st === "rejected" ? "border-red-700/50 text-red-300" : "border-zinc-800 text-zinc-400"}`}
            >
              {STATUS_LABEL[st]}: {metrics.byStatus[st]}
            </span>
          ))}
        </section>
      )}

      {/* List */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">
          Sessions <span className="text-sm font-normal text-zinc-500">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No sessions in this window.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((s) => (
              <li key={s.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <button
                  type="button"
                  onClick={() => setExpanded(expanded === s.id ? null : s.id)}
                  className="w-full text-left"
                >
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{s.id}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${badgeClass(s.status)}`}>
                      {STATUS_LABEL[s.status]}
                    </span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                    <span>{centsToUsd(s.sourceAmount)} → {fmtCrypto(s.destAmount, s.destCurrency)}</span>
                    <span>{s.destNetwork} · {short(s.walletAddress)}</span>
                    <span>Fee: {centsToUsd((s.transactionFee ?? 0) + (s.networkFee ?? 0))}</span>
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{new Date(s.createdAt).toLocaleString()}</div>
                </button>

                {expanded === s.id && (
                  <div className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
                    <div>Stripe fee: {s.transactionFee == null ? "—" : centsToUsd(s.transactionFee)} · Network fee: {s.networkFee == null ? "—" : centsToUsd(s.networkFee)}</div>
                    <div>Wallet: <span className="break-all text-zinc-300">{s.walletAddress}</span></div>
                    {s.rejectionReason && <div className="text-red-400">Rejection: {s.rejectionReason}</div>}
                    <a
                      href={stripeUrl(s.id, live)}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-block underline hover:text-zinc-200"
                    >
                      View in Stripe ↗
                    </a>
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  )
}

function Metric({ label, value }: { label: string; value: string }) {
  return (
    <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-3">
      <div className="text-xs text-zinc-500">{label}</div>
      <div className="mt-1 text-lg font-semibold text-white">{value}</div>
    </div>
  )
}
