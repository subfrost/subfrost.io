"use client"

import { useCallback, useEffect, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { listMtlAction, seedMtlAction, updateMtlAction } from "@/actions/cms/mtl"
import { MTL_STATUSES, MTL_STATUS_LABELS, MTL_STATUS_CLS as STATUS_CLS } from "@/lib/mtl/schema"
import type { MtlRow } from "@/lib/mtl/admin"
import { SkeletonTable } from "@/components/cms/Skeleton"
import { MtlStatusSummary } from "@/components/cms/MtlStatusSummary"

interface RowState {
  status: string
  nextFilingDue: string
  portalUrl: string
  notes: string
}

function toRowState(r: MtlRow): RowState {
  return {
    status: r.status,
    nextFilingDue: r.nextFilingDue ?? "",
    portalUrl: r.portalUrl ?? "",
    notes: r.notes ?? "",
  }
}

function Badge({ label, cls }: { label: string; cls: string }) {
  return <span className={`rounded-md border px-2 py-0.5 text-xs font-medium ${cls}`}>{label}</span>
}

export function MtlManager({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<MtlRow[]>([])
  const [draftById, setDraftById] = useState<Record<string, RowState>>({})
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [search, setSearch] = useState("")
  const [pending, startTransition] = useTransition()

  const fetchRows = useCallback(async () => {
    setLoading(true)
    const res = await listMtlAction()
    if (res.ok) {
      setRows(res.entries)
      setDraftById(Object.fromEntries(res.entries.map((r) => [r.state, toRowState(r)])))
      setError(null)
    } else {
      setError(res.error)
    }
    setLoading(false)
  }, [])

  useEffect(() => {
    fetchRows()
  }, [fetchRows])

  const handleSeed = () =>
    startTransition(async () => {
      const res = await seedMtlAction()
      if (res.ok) {
        setError(null)
        fetchRows()
      } else {
        setError(res.error)
      }
    })

  const handleSave = (state: string) =>
    startTransition(async () => {
      const draft = draftById[state]
      if (!draft) return
      const res = await updateMtlAction(state, {
        status: draft.status,
        nextFilingDue: draft.nextFilingDue || undefined,
        portalUrl: draft.portalUrl || undefined,
        notes: draft.notes || undefined,
      })
      if (res.ok) {
        setError(null)
        fetchRows()
      } else {
        setError(res.error)
      }
    })

  const setField = (state: string, field: keyof RowState, value: string) =>
    setDraftById((prev) => ({
      ...prev,
      [state]: { ...prev[state], [field]: value },
    }))

  const visible = search
    ? rows.filter(
        (r) =>
          r.state.toLowerCase().includes(search.toLowerCase()) ||
          r.name.toLowerCase().includes(search.toLowerCase()),
      )
    : rows

  if (loading) return <SkeletonTable />

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {error && (
          <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
            {error}
            <button type="button" onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
          </div>
        )}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="mb-4 text-zinc-400">No jurisdictions seeded yet.</p>
          {canEdit && (
            <Button onClick={handleSeed} disabled={pending}>
              Seed 51 jurisdictions
            </Button>
          )}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      <MtlStatusSummary entries={rows} />
      <div className="flex flex-wrap items-center gap-3">
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Search by state code or name…"
          className="max-w-md flex-1 border-zinc-700 bg-zinc-900 text-zinc-100"
        />
        <span className="text-xs text-zinc-500">{visible.length} jurisdiction(s)</span>
      </div>

      {error && (
        <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
          {error}
          <button type="button" onClick={() => setError(null)} className="ml-2 underline">dismiss</button>
        </div>
      )}

      <ul className="space-y-3">
        {visible.map((r) => {
          const draft = draftById[r.state] ?? toRowState(r)
          const statusLabel = MTL_STATUS_LABELS[draft.status as keyof typeof MTL_STATUS_LABELS] ?? draft.status
          return (
            <li key={r.state} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              <div className="mb-3 flex flex-wrap items-center gap-2">
                <span className="font-mono text-sm font-semibold text-white">{r.state}</span>
                <span className="text-sm text-zinc-300">{r.name}</span>
                <Badge label={statusLabel} cls={STATUS_CLS[draft.status as keyof typeof STATUS_CLS] ?? "bg-zinc-800 text-zinc-400 border-zinc-700"} />
              </div>

              {canEdit ? (
                <>
                  <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Status</label>
                      <select
                        value={draft.status}
                        onChange={(e) => setField(r.state, "status", e.target.value)}
                        className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
                      >
                        {MTL_STATUSES.map((s) => (
                          <option key={s} value={s}>{MTL_STATUS_LABELS[s]}</option>
                        ))}
                      </select>
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Next filing due</label>
                      <Input
                        value={draft.nextFilingDue}
                        onChange={(e) => setField(r.state, "nextFilingDue", e.target.value)}
                        placeholder="e.g. 2025-12-31"
                        className="border-zinc-700 bg-zinc-900 text-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Portal URL</label>
                      <Input
                        value={draft.portalUrl}
                        onChange={(e) => setField(r.state, "portalUrl", e.target.value)}
                        placeholder="https://…"
                        className="border-zinc-700 bg-zinc-900 text-zinc-100"
                      />
                    </div>

                    <div>
                      <label className="mb-1 block text-xs text-zinc-500">Notes</label>
                      <Input
                        value={draft.notes}
                        onChange={(e) => setField(r.state, "notes", e.target.value)}
                        placeholder="Internal notes…"
                        className="border-zinc-700 bg-zinc-900 text-zinc-100"
                      />
                    </div>
                  </div>

                  <div className="mt-3 flex justify-end">
                    <Button size="sm" disabled={pending} onClick={() => handleSave(r.state)}>
                      Save
                    </Button>
                  </div>
                </>
              ) : (
                <div className="grid grid-cols-1 gap-1 text-sm sm:grid-cols-2">
                  {draft.nextFilingDue && (
                    <div className="text-zinc-400">
                      <span className="text-zinc-500">Next due: </span>{draft.nextFilingDue}
                    </div>
                  )}
                  {draft.portalUrl && (
                    <div className="truncate text-zinc-400">
                      <span className="text-zinc-500">Portal: </span>
                      <a href={draft.portalUrl} target="_blank" rel="noreferrer" className="underline">{draft.portalUrl}</a>
                    </div>
                  )}
                  {draft.notes && (
                    <div className="text-zinc-400 sm:col-span-2">
                      <span className="text-zinc-500">Notes: </span>{draft.notes}
                    </div>
                  )}
                </div>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}
