"use client"

import { useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { revokeMySession, revokeMyOtherSessions } from "@/actions/cms/sessions"

export interface SessionView {
  id: string
  ip: string | null
  userAgent: string | null
  tlsFingerprint: string | null
  createdAt: string
  lastSeenAt: string
  current: boolean
}

export function relTime(iso: string): string {
  const d = Date.now() - new Date(iso).getTime()
  const m = Math.floor(d / 60000)
  if (m < 1) return "just now"
  if (m < 60) return `${m}m ago`
  const h = Math.floor(m / 60)
  if (h < 24) return `${h}h ago`
  return `${Math.floor(h / 24)}d ago`
}

export function deviceLabel(ua: string | null): string {
  if (!ua) return "Unknown device"
  const os = /Windows/.test(ua) ? "Windows" : /Mac OS X|Macintosh/.test(ua) ? "macOS" : /iPhone|iPad/.test(ua) ? "iOS" : /Android/.test(ua) ? "Android" : /Linux/.test(ua) ? "Linux" : "Unknown OS"
  const browser = /Edg\//.test(ua) ? "Edge" : /Chrome\//.test(ua) ? "Chrome" : /Firefox\//.test(ua) ? "Firefox" : /Safari\//.test(ua) ? "Safari" : "Browser"
  return `${browser} · ${os}`
}

/** Compact TLS fingerprint badge — JA4 strings are long; show the leading token. */
export function FingerprintBadge({ fp }: { fp: string | null }) {
  if (!fp) return null
  const short = fp.length > 16 ? `${fp.slice(0, 14)}…` : fp
  return (
    <span title={`TLS fingerprint: ${fp}`} className="rounded border border-zinc-700 bg-zinc-800/60 px-1.5 py-0.5 font-mono text-[10px] text-zinc-400">
      {short}
    </span>
  )
}

export function SessionsManager({ sessions }: { sessions: SessionView[] }) {
  const [pending, startTransition] = useTransition()
  const [rows, setRows] = useState(sessions)

  return (
    <div className="space-y-4 rounded-xl border border-zinc-800 bg-zinc-900/40 p-5">
      <div className="flex items-center justify-between">
        <div className="text-sm font-medium text-zinc-200">Active sessions</div>
        {rows.some((s) => !s.current) && (
          <Button size="sm" variant="ghost" disabled={pending}
            onClick={() => startTransition(async () => { const r = await revokeMyOtherSessions(); if (r.ok) setRows((p) => p.filter((s) => s.current)) })}>
            Sign out everywhere else
          </Button>
        )}
      </div>
      <ul className="divide-y divide-zinc-800">
        {rows.map((s) => (
          <li key={s.id} className="flex items-center justify-between py-3">
            <div>
              <div className="flex flex-wrap items-center gap-2 text-sm text-zinc-200">
                {deviceLabel(s.userAgent)}
                {s.current && <span className="rounded bg-emerald-900/50 px-1.5 py-0.5 text-[10px] font-medium text-emerald-300">This device</span>}
                <FingerprintBadge fp={s.tlsFingerprint} />
              </div>
              <div className="text-xs text-zinc-500">{s.ip ?? "unknown IP"} · active {relTime(s.lastSeenAt)}</div>
            </div>
            {!s.current && (
              <Button size="sm" variant="ghost" disabled={pending}
                onClick={() => startTransition(async () => { const r = await revokeMySession(s.id); if (r.ok) setRows((p) => p.filter((x) => x.id !== s.id)) })}>
                Revoke
              </Button>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}
