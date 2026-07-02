"use client"

// Pager console: pick a target (one teammate or everyone), type the message,
// send. Urgent (default) publishes at ntfy priority 5 — phones alarm through
// DND and hardware pagers scream until acknowledged.

import { useState } from "react"
import { useRouter } from "next/navigation"
import type { PagerMember } from "@/lib/pager/config"

export interface PageEvent {
  id: string
  time: number
  topic: string
  message: string
  title: string
  urgent: boolean
}

export function PagerConsole({
  roster,
  history,
  disabled,
}: {
  roster: PagerMember[]
  history: PageEvent[]
  disabled: boolean
}) {
  const router = useRouter()
  const [target, setTarget] = useState<string>("all")
  const [message, setMessage] = useState("")
  const [urgent, setUrgent] = useState(true)
  const [sending, setSending] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [sent, setSent] = useState<string | null>(null)

  async function send() {
    if (!message.trim() || sending) return
    setSending(true)
    setError(null)
    setSent(null)
    try {
      const res = await fetch("/api/admin/pager", {
        method: "POST",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ target, message: message.trim(), urgent }),
      })
      const json = await res.json()
      if (!res.ok) throw new Error(json.error ?? `HTTP ${res.status}`)
      setSent(json.topic)
      setMessage("")
      router.refresh()
    } catch (e) {
      setError(e instanceof Error ? e.message : String(e))
    } finally {
      setSending(false)
    }
  }

  const targetName = (topic: string) =>
    topic === "page-all"
      ? "everyone"
      : roster.find((m) => `page-${m.id}` === topic)?.name ?? topic

  return (
    <div className="max-w-2xl space-y-8">
      <div className="space-y-4 rounded-lg border border-white/10 bg-white/5 p-4">
        <div className="flex flex-wrap gap-2">
          <TargetChip label="Everyone" active={target === "all"} onClick={() => setTarget("all")} />
          {roster.map((m) => (
            <TargetChip key={m.id} label={m.name} active={target === m.id} onClick={() => setTarget(m.id)} />
          ))}
        </div>
        <textarea
          value={message}
          onChange={(e) => setMessage(e.target.value)}
          onKeyDown={(e) => {
            if (e.key === "Enter" && (e.metaKey || e.ctrlKey)) send()
          }}
          rows={3}
          maxLength={1024}
          placeholder="What's the emergency?"
          className="w-full rounded border border-white/15 bg-black/30 p-3 text-sm text-white placeholder-white/40 focus:border-white/40 focus:outline-none"
        />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-white/70">
            <input type="checkbox" checked={urgent} onChange={(e) => setUrgent(e.target.checked)} />
            Urgent (alarm through Do&nbsp;Not&nbsp;Disturb)
          </label>
          <button
            onClick={send}
            disabled={disabled || sending || !message.trim()}
            className="rounded bg-red-600 px-5 py-2 text-sm font-semibold text-white hover:bg-red-500 disabled:cursor-not-allowed disabled:opacity-40"
          >
            {sending ? "Paging…" : target === "all" ? "Page everyone" : `Page ${roster.find((m) => m.id === target)?.name ?? target}`}
          </button>
        </div>
        {error && <p className="text-sm text-red-400">{error}</p>}
        {sent && <p className="text-sm text-green-400">Page sent to {targetName(sent)}.</p>}
      </div>

      <div>
        <h2 className="mb-3 text-lg font-semibold text-white">Last 72 hours</h2>
        {history.length === 0 ? (
          <p className="text-sm text-white/50">No pages sent recently.</p>
        ) : (
          <ul className="space-y-2">
            {history.map((e) => (
              <li key={e.id} className="rounded border border-white/10 bg-white/5 p-3 text-sm">
                <div className="flex items-center justify-between text-white/60">
                  <span>
                    {e.urgent && <span className="mr-2 text-red-400">■</span>}
                    {e.title || "Page"} → {targetName(e.topic)}
                  </span>
                  <span>{new Date(e.time * 1000).toLocaleString()}</span>
                </div>
                <p className="mt-1 text-white">{e.message}</p>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  )
}

function TargetChip({ label, active, onClick }: { label: string; active: boolean; onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className={`rounded-full border px-4 py-1.5 text-sm transition-colors ${
        active
          ? "border-red-500 bg-red-600/20 text-white"
          : "border-white/15 text-white/60 hover:border-white/40 hover:text-white"
      }`}
    >
      {label}
    </button>
  )
}
