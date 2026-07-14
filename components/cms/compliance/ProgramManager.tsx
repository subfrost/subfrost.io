"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SkeletonTable } from "@/components/cms/Skeleton"
import {
  listProgramItemsAction,
  seedProgramItemsAction,
  updateProgramItemAction,
} from "@/actions/cms/compliance"
import type { ProgramItemRow } from "@/lib/compliance/program-store"
import { PILLAR_STATUSES, type PillarStatus } from "@/lib/compliance/program"

const BADGE: Record<PillarStatus, { label: string; cls: string }> = {
  OK: { label: "In place", cls: "bg-emerald-500/10 text-emerald-400 border-emerald-500/30" },
  PARTIAL: { label: "Partial", cls: "bg-amber-500/10 text-amber-400 border-amber-500/30" },
  GAP: { label: "Gap", cls: "bg-red-500/10 text-red-400 border-red-500/30" },
}

interface Draft {
  status: PillarStatus
  detail: string
  action: string
}

export function ProgramManager({ canEdit }: { canEdit: boolean }) {
  const [items, setItems] = useState<ProgramItemRow[]>([])
  const [drafts, setDrafts] = useState<Record<string, Draft>>({})
  const [editing, setEditing] = useState<string | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()

  const fetchItems = useCallback(async () => {
    const res = await listProgramItemsAction()
    if (res.ok) {
      setItems(res.items)
      setDrafts(Object.fromEntries(res.items.map((i) => [i.key, { status: i.status, detail: i.detail, action: i.action ?? "" }])))
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => { fetchItems() }, [fetchItems])

  const handleSeed = () =>
    startTransition(async () => {
      const res = await seedProgramItemsAction()
      if (res.ok) { setError(null); fetchItems() } else setError(res.error)
    })

  const handleSave = (key: string) =>
    startTransition(async () => {
      const d = drafts[key]
      if (!d) return
      const res = await updateProgramItemAction(key, { status: d.status, detail: d.detail, action: d.action || null })
      if (res.ok) { setError(null); setEditing(null); fetchItems() } else setError(res.error)
    })

  const setField = (key: string, field: keyof Draft, value: string) =>
    setDrafts((p) => ({ ...p, [key]: { ...p[key], [field]: value } }))

  if (loading) return <SkeletonTable />

  if (items.length === 0) {
    return (
      <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-6 text-center">
        <p className="mb-1 text-sm text-zinc-400">The BSA program register is empty.</p>
        <p className="mb-4 text-xs text-zinc-500">Seed the five pillars a registered MSB must maintain, then edit each as it changes.</p>
        {error && <p className="mb-3 text-sm text-red-300">{error}</p>}
        {canEdit && <Button onClick={handleSeed} disabled={pending}>Seed program pillars</Button>}
      </div>
    )
  }

  return (
    <div className="space-y-3">
      {error && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}
      <div className="grid gap-3 sm:grid-cols-2">
        {items.map((p) => {
          const d = drafts[p.key] ?? { status: p.status, detail: p.detail, action: p.action ?? "" }
          const isEditing = editing === p.key
          return (
            <div key={p.key} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="mb-2 flex items-start justify-between gap-3">
                <h3 className="text-sm font-semibold text-white">{p.title}</h3>
                <span className={`shrink-0 rounded-full border px-2 py-0.5 text-[11px] font-medium ${BADGE[d.status].cls}`}>
                  {BADGE[d.status].label}
                </span>
              </div>

              {isEditing ? (
                <div className="space-y-2">
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Status</label>
                    <select
                      value={d.status}
                      onChange={(e) => setField(p.key, "status", e.target.value)}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    >
                      {PILLAR_STATUSES.map((s) => <option key={s} value={s}>{BADGE[s].label}</option>)}
                    </select>
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Detail</label>
                    <textarea
                      value={d.detail}
                      onChange={(e) => setField(p.key, "detail", e.target.value)}
                      rows={3}
                      className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                    />
                  </div>
                  <div>
                    <label className="mb-1 block text-xs text-zinc-500">Next step (optional)</label>
                    <Input
                      value={d.action}
                      onChange={(e) => setField(p.key, "action", e.target.value)}
                      placeholder="What closes this gap…"
                      className="border-zinc-700 bg-zinc-900 text-zinc-100"
                    />
                  </div>
                  <div className="flex justify-end gap-2">
                    <Button size="sm" variant="ghost" onClick={() => { setEditing(null); fetchItems() }}>Cancel</Button>
                    <Button size="sm" disabled={pending} onClick={() => handleSave(p.key)}>Save</Button>
                  </div>
                </div>
              ) : (
                <>
                  <p className="text-xs leading-relaxed text-zinc-400">{p.detail}</p>
                  {p.action && <p className="mt-2 text-xs text-amber-400/90">Next: {p.action}</p>}
                  <div className="mt-3 flex items-center justify-between">
                    <span className="text-[10px] text-zinc-600">
                      {p.updatedBy ? `Updated by ${p.updatedBy}` : "Not yet edited"}
                    </span>
                    {canEdit && (
                      <button type="button" onClick={() => setEditing(p.key)} className="text-xs text-sky-400 hover:text-sky-300">
                        Edit
                      </button>
                    )}
                  </div>
                </>
              )}
            </div>
          )
        })}
      </div>
    </div>
  )
}
