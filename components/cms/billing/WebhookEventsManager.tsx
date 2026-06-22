"use client"

import { useCallback, useEffect, useState } from "react"
import { listWebhookEventsAction } from "@/actions/cms/billing"
import { centsToUsd } from "@/lib/stripe/format"
import type { WebhookEventRow } from "@/lib/stripe/shapes"
import { SkeletonTable } from "@/components/cms/Skeleton"

const STATUSES = ["received", "processed", "ignored", "failed"] as const

function statusClass(status: string): string {
  if (status === "processed") return "border-green-700/50 bg-green-950/40 text-green-400"
  if (status === "failed") return "border-red-700/50 bg-red-950/40 text-red-400"
  if (status === "ignored") return "border-zinc-700/50 bg-zinc-900/40 text-zinc-400"
  return "border-amber-700/50 bg-amber-950/40 text-amber-400"
}

function stripeUrl(id: string, live: boolean): string {
  // Convenience deep-link to the event in the dashboard; not load-bearing.
  return `https://dashboard.stripe.com/${live ? "" : "test/"}events/${id}`
}

export function WebhookEventsManager() {
  const [events, setEvents] = useState<WebhookEventRow[]>([])
  const [live, setLive] = useState(false)
  const [failedOnly, setFailedOnly] = useState(false)
  const [typeFilter, setTypeFilter] = useState("")
  const [expanded, setExpanded] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [banner, setBanner] = useState<string | null>(null)

  const fetchEvents = useCallback(async () => {
    setLoading(true)
    const res = await listWebhookEventsAction()
    if (res.ok) {
      setEvents(res.events)
      setLive(res.live)
      setBanner(null)
    } else {
      setBanner(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchEvents()
  }, [fetchEvents])

  const counts = STATUSES.map((s) => [s, events.filter((e) => e.status === s).length] as const)
  let rows = failedOnly ? events.filter((e) => e.status === "failed") : events
  if (typeFilter) rows = rows.filter((e) => e.type.includes(typeFilter))

  if (loading) return <SkeletonTable />

  return (
    <div className="space-y-6">
      {banner && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {banner}
          <button type="button" onClick={() => setBanner(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {events.length === 0 && (
        <div className="rounded-lg bg-zinc-900/60 p-3 text-sm text-zinc-400">
          No webhook events yet — the Stripe endpoint isn&apos;t connected.
        </div>
      )}

      {/* Status breakdown */}
      <section className="flex flex-wrap gap-2">
        {counts.map(([s, n]) => (
          <span key={s} className={`rounded-md border px-2 py-0.5 text-xs ${s === "failed" ? "border-red-700/50 text-red-300" : "border-zinc-800 text-zinc-400"}`}>
            {s}: {n}
          </span>
        ))}
      </section>

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <input
          type="text"
          value={typeFilter}
          onChange={(e) => setTypeFilter(e.target.value)}
          placeholder="filter by type…"
          className="rounded-md border border-zinc-800 bg-zinc-900/40 px-2.5 py-1 text-xs text-zinc-200"
        />
        <label className="ml-2 flex items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={failedOnly} onChange={(e) => setFailedOnly(e.target.checked)} />
          Failed only
        </label>
      </div>

      {/* List */}
      <section>
        <h2 className="mb-3 text-lg font-semibold text-white">
          Events <span className="text-sm font-normal text-zinc-500">({rows.length})</span>
        </h2>
        {rows.length === 0 ? (
          <p className="text-sm text-zinc-500">No events match.</p>
        ) : (
          <ul className="space-y-3">
            {rows.map((e) => (
              <li key={e.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
                <button type="button" onClick={() => setExpanded(expanded === e.id ? null : e.id)} className="w-full text-left">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    <span className="font-semibold text-white">{e.type}</span>
                    <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${statusClass(e.status)}`}>{e.status}</span>
                  </div>
                  <div className="flex flex-wrap gap-4 text-sm text-zinc-400">
                    <span>{e.objectType ?? "—"} · {e.objectId ?? "—"}</span>
                    {e.amount != null && <span>{centsToUsd(e.amount)}</span>}
                  </div>
                  <div className="mt-1 text-xs text-zinc-500">{new Date(e.receivedAt).toLocaleString()}</div>
                </button>

                {expanded === e.id && (
                  <div className="mt-3 space-y-1 border-t border-zinc-800 pt-3 text-xs text-zinc-400">
                    <div>Object: <span className="break-all text-zinc-300">{e.objectType ?? "—"} / {e.objectId ?? "—"}</span> · status: {e.objectStatus ?? "—"}</div>
                    {e.reason && <div>Reason: {e.reason}</div>}
                    {e.error && <div className="text-red-400">Error: {e.error}</div>}
                    <div>Stripe created: {new Date(e.stripeCreated).toLocaleString()}</div>
                    <a href={stripeUrl(e.id, live)} target="_blank" rel="noopener noreferrer" className="inline-block underline hover:text-zinc-200">
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
