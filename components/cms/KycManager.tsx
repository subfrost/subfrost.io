"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listIntakesAction, recordDispositionAction, rescreenOfacAction } from "@/actions/cms/kyc"
import type { KycIntakeRow, KycDecision } from "@/lib/kyc/admin"

const RISK_CLS: Record<string, string> = {
  LOW: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  MEDIUM: "bg-amber-950/50 text-amber-300 border-amber-800/50",
  HIGH: "bg-red-950/50 text-red-300 border-red-800/50",
}
const STATUS_CLS: Record<string, string> = {
  PENDING: "bg-zinc-800 text-zinc-300 border-zinc-700",
  IN_REVIEW: "bg-blue-950/50 text-blue-300 border-blue-800/50",
  APPROVED: "bg-emerald-950/50 text-emerald-300 border-emerald-800/50",
  REJECTED: "bg-red-950/50 text-red-300 border-red-800/50",
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function KycManager() {
  const [rows, setRows] = useState<KycIntakeRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [notesById, setNotesById] = useState<Record<string, string>>({})
  const [notice, setNotice] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await listIntakesAction()
    if (res.ok) {
      setRows(res.intakes)
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const disposition = (id: string, decision: KycDecision) =>
    startTransition(async () => {
      const res = await recordDispositionAction(id, decision, notesById[id]?.trim() || null)
      if (res.ok) {
        setNotesById((p) => ({ ...p, [id]: "" }))
        fetchRows()
      } else {
        setError(res.error)
      }
    })

  const visible = search
    ? rows.filter(
        (r) =>
          r.customerName.toLowerCase().includes(search.toLowerCase()) ||
          r.customerEmail.toLowerCase().includes(search.toLowerCase()),
      )
    : rows

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by name or email…"
          className="max-w-md flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
        />
        <span className="text-xs text-zinc-500">{visible.length} intake(s)</span>
        <Button
          variant="ghost"
          size="sm"
          disabled={pending}
          onClick={() =>
            startTransition(async () => {
              setNotice(null)
              const res = await rescreenOfacAction()
              if (res.ok) {
                setNotice(`Rescreened ${res.screened} intakes — no live provider yet`)
              } else {
                setError(res.error)
              }
            })
          }
        >
          Run OFAC rescreen
        </Button>
      </div>

      {notice && (
        <div className="rounded-lg bg-zinc-800/60 p-3 text-sm text-zinc-300">
          {notice}
          <button type="button" onClick={() => setNotice(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {error && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      {loading ? (
        <div className="text-zinc-500">Loading…</div>
      ) : visible.length === 0 ? (
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center text-zinc-500">
          {search ? "No matching intakes." : "No intakes in the queue yet."}
        </div>
      ) : (
        <ul className="space-y-3">
          {visible.map((r) => (
            <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="flex flex-col gap-3 sm:flex-row sm:items-start sm:justify-between">
                <div className="min-w-0">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-medium text-white">{r.customerName}</span>
                    <Badge label={r.riskScore} cls={RISK_CLS[r.riskScore] ?? STATUS_CLS.PENDING} />
                    <Badge label={r.status} cls={STATUS_CLS[r.status] ?? STATUS_CLS.PENDING} />
                  </div>
                  <div className="mt-1 truncate text-sm text-zinc-400">{r.customerEmail}</div>
                  <div className="mt-1 text-xs text-zinc-500">
                    {r.provider} · submitted {new Date(r.submittedAt).toLocaleDateString()}
                    {r.dispositions.length > 0 && ` · ${r.dispositions.length} prior decision(s)`}
                  </div>
                </div>
              </div>

              <div className="mt-3 flex flex-col gap-2 sm:flex-row sm:items-center">
                <Input
                  value={notesById[r.id] ?? ""}
                  onChange={(e) => setNotesById((p) => ({ ...p, [r.id]: e.target.value }))}
                  placeholder="Disposition note (optional)…"
                  className="flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
                />
                <div className="flex flex-wrap gap-2">
                  <Button size="sm" disabled={pending} onClick={() => disposition(r.id, "APPROVE")}>Approve</Button>
                  <Button size="sm" variant="ghost" disabled={pending} onClick={() => disposition(r.id, "REVIEW")}>Review</Button>
                  <Button size="sm" variant="ghost" disabled={pending} className="text-red-400 hover:text-red-300" onClick={() => disposition(r.id, "REJECT")}>Reject</Button>
                </div>
              </div>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
