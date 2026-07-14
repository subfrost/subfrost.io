"use client"

import { useCallback, useEffect, useMemo, useState, useTransition } from "react"
import { Button } from "@/components/ui/button"
import { Input } from "@/components/ui/input"
import { SkeletonTable } from "@/components/cms/Skeleton"
import {
  listObligationsAction,
  seedObligationsAction,
  createObligationAction,
  updateObligationAction,
  deleteObligationAction,
  completeObligationAction,
} from "@/actions/cms/compliance"
import type { ObligationRow } from "@/lib/compliance/obligations"
import {
  OBLIGATION_CATEGORIES, CATEGORY_LABELS, CATEGORY_CLS,
  OBLIGATION_CADENCES, CADENCE_LABELS,
  OBLIGATION_STATUSES, STATUS_LABELS, STATUS_CLS,
  dueState, daysUntil,
  type ObligationCategory, type ObligationCadence, type ObligationStatus, type DueState,
} from "@/lib/compliance/obligations-schema"

interface Draft {
  title: string
  category: ObligationCategory
  authority: string
  description: string
  cadence: ObligationCadence
  dueDate: string
  status: ObligationStatus
  owner: string
  docUrl: string
  notes: string
}

function toDraft(r: ObligationRow): Draft {
  return {
    title: r.title, category: r.category, authority: r.authority ?? "",
    description: r.description ?? "", cadence: r.cadence, dueDate: r.dueDate ?? "",
    status: r.status, owner: r.owner ?? "", docUrl: r.docUrl ?? "", notes: r.notes ?? "",
  }
}

const EMPTY_DRAFT: Draft = {
  title: "", category: "CORPORATE", authority: "", description: "",
  cadence: "ANNUAL", dueDate: "", status: "NOT_STARTED", owner: "", docUrl: "", notes: "",
}

const DUE_CLS: Record<DueState, string> = {
  overdue: "text-red-400",
  "due-soon": "text-amber-400",
  upcoming: "text-zinc-400",
  none: "text-zinc-600",
}

function dueLabel(r: ObligationRow, nowMs: number): { text: string; cls: string } {
  const st = dueState(r.dueDate, r.status, nowMs)
  const days = daysUntil(r.dueDate, nowMs)
  if (!r.dueDate) return { text: "no date", cls: DUE_CLS.none }
  if (st === "none") return { text: r.dueDate, cls: DUE_CLS.none }
  if (days == null) return { text: r.dueDate, cls: DUE_CLS[st] }
  if (days < 0) return { text: `${r.dueDate} · ${Math.abs(days)}d overdue`, cls: DUE_CLS.overdue }
  if (days === 0) return { text: `${r.dueDate} · today`, cls: DUE_CLS["due-soon"] }
  return { text: `${r.dueDate} · in ${days}d`, cls: DUE_CLS[st] }
}

export function ObligationsManager({ canEdit }: { canEdit: boolean }) {
  const [rows, setRows] = useState<ObligationRow[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [pending, startTransition] = useTransition()
  const [editingId, setEditingId] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [draft, setDraft] = useState<Draft>(EMPTY_DRAFT)
  const [catFilter, setCatFilter] = useState<ObligationCategory | "ALL">("ALL")
  const [hideSettled, setHideSettled] = useState(false)
  const nowMs = useMemo(() => Date.now(), [rows])

  const fetchRows = useCallback(async () => {
    const res = await listObligationsAction()
    if (res.ok) { setRows(res.obligations); setError(null) } else setError(res.error)
    setLoading(false)
  }, [])

  useEffect(() => { fetchRows() }, [fetchRows])

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>, after?: () => void) =>
    startTransition(async () => {
      const res = await fn()
      if (res.ok) { setError(null); after?.(); fetchRows() } else setError(res.error ?? "Failed")
    })

  const handleSeed = () => run(() => seedObligationsAction())
  const handleSave = (id: string) => run(() => updateObligationAction(id, draftPayload(draft)), () => setEditingId(null))
  const handleCreate = () => run(() => createObligationAction(draftPayload(draft)), () => { setCreating(false); setDraft(EMPTY_DRAFT) })
  const handleDelete = (id: string) => run(() => deleteObligationAction(id))
  const handleComplete = (id: string) => run(() => completeObligationAction(id))

  const startEdit = (r: ObligationRow) => { setDraft(toDraft(r)); setEditingId(r.id); setCreating(false) }
  const startCreate = () => { setDraft(EMPTY_DRAFT); setCreating(true); setEditingId(null) }
  const setField = (field: keyof Draft, value: string) => setDraft((p) => ({ ...p, [field]: value }))

  const visible = rows.filter((r) => {
    if (catFilter !== "ALL" && r.category !== catFilter) return false
    if (hideSettled && (r.status === "COMPLETE" || r.status === "FILED" || r.status === "NOT_APPLICABLE")) return false
    return true
  })

  if (loading) return <SkeletonTable />

  if (rows.length === 0) {
    return (
      <div className="space-y-4">
        {error && <ErrorBar error={error} onClear={() => setError(null)} />}
        <div className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-8 text-center">
          <p className="mb-1 text-zinc-300">No obligations tracked yet.</p>
          <p className="mb-4 text-xs text-zinc-500">Seed the company&apos;s known tax, corporate, AML, licensing, and securities obligations to start the calendar.</p>
          {canEdit && <Button onClick={handleSeed} disabled={pending}>Seed obligation calendar</Button>}
        </div>
      </div>
    )
  }

  return (
    <div className="space-y-4">
      {error && <ErrorBar error={error} onClear={() => setError(null)} />}

      {/* Controls */}
      <div className="flex flex-wrap items-center gap-2">
        <select
          value={catFilter}
          onChange={(e) => setCatFilter(e.target.value as ObligationCategory | "ALL")}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
        >
          <option value="ALL">All categories</option>
          {OBLIGATION_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
        </select>
        <label className="flex items-center gap-1.5 text-xs text-zinc-400">
          <input type="checkbox" checked={hideSettled} onChange={(e) => setHideSettled(e.target.checked)} className="accent-sky-500" />
          Hide settled
        </label>
        <span className="text-xs text-zinc-500">{visible.length} of {rows.length}</span>
        {canEdit && (
          <Button size="sm" variant="ghost" className="ml-auto" onClick={startCreate}>+ Add obligation</Button>
        )}
      </div>

      {/* Create form */}
      {creating && canEdit && (
        <ObligationForm
          draft={draft} setField={setField} pending={pending}
          onCancel={() => setCreating(false)} onSubmit={handleCreate} submitLabel="Create"
        />
      )}

      {/* Rows */}
      <ul className="space-y-2">
        {visible.map((r) => {
          const isEditing = editingId === r.id
          const due = dueLabel(r, nowMs)
          return (
            <li key={r.id} className="rounded-xl border border-zinc-800 bg-zinc-900/40 p-4">
              {isEditing && canEdit ? (
                <ObligationForm
                  draft={draft} setField={setField} pending={pending}
                  onCancel={() => setEditingId(null)} onSubmit={() => handleSave(r.id)} submitLabel="Save"
                />
              ) : (
                <>
                  <div className="flex flex-wrap items-center gap-2">
                    <span className={`rounded-md border px-2 py-0.5 text-[11px] font-medium ${CATEGORY_CLS[r.category]}`}>{CATEGORY_LABELS[r.category]}</span>
                    <span className="text-sm font-semibold text-white">{r.title}</span>
                    <span className={`ml-auto text-xs font-medium ${due.cls}`}>{due.text}</span>
                  </div>
                  <div className="mt-2 flex flex-wrap items-center gap-2 text-xs text-zinc-500">
                    <span className={`rounded-md border px-1.5 py-0.5 ${STATUS_CLS[r.status]}`}>{STATUS_LABELS[r.status]}</span>
                    <span>{CADENCE_LABELS[r.cadence]}</span>
                    {r.authority && <span>· {r.authority}</span>}
                    {r.owner && <span>· owner: {r.owner}</span>}
                    {r.lastCompletedAt && <span>· last done {r.lastCompletedAt}</span>}
                  </div>
                  {r.description && <p className="mt-2 text-xs leading-relaxed text-zinc-400">{r.description}</p>}
                  {r.notes && <p className="mt-1 text-xs leading-relaxed text-zinc-500">Note: {r.notes}</p>}
                  <div className="mt-3 flex items-center gap-3">
                    {r.docUrl && <a href={r.docUrl} target="_blank" rel="noreferrer" className="text-xs text-sky-400 underline">Evidence</a>}
                    {canEdit && (
                      <div className="ml-auto flex items-center gap-2">
                        {r.status !== "COMPLETE" && r.status !== "NOT_APPLICABLE" && (
                          <button type="button" disabled={pending} onClick={() => handleComplete(r.id)} className="text-xs text-emerald-400 hover:text-emerald-300">
                            Mark done
                          </button>
                        )}
                        <button type="button" onClick={() => startEdit(r)} className="text-xs text-sky-400 hover:text-sky-300">Edit</button>
                        <button type="button" disabled={pending} onClick={() => handleDelete(r.id)} className="text-xs text-red-400/80 hover:text-red-300">Delete</button>
                      </div>
                    )}
                  </div>
                </>
              )}
            </li>
          )
        })}
      </ul>
    </div>
  )
}

function draftPayload(d: Draft) {
  return {
    title: d.title, category: d.category, authority: d.authority || null,
    description: d.description || null, cadence: d.cadence, dueDate: d.dueDate || null,
    status: d.status, owner: d.owner || null, docUrl: d.docUrl || null, notes: d.notes || null,
  }
}

function ErrorBar({ error, onClear }: { error: string; onClear: () => void }) {
  return (
    <div className="rounded-lg bg-red-950/40 p-3 text-sm text-red-300">
      {error}
      <button type="button" onClick={onClear} className="ml-2 underline">dismiss</button>
    </div>
  )
}

function ObligationForm({
  draft, setField, pending, onCancel, onSubmit, submitLabel,
}: {
  draft: Draft
  setField: (f: keyof Draft, v: string) => void
  pending: boolean
  onCancel: () => void
  onSubmit: () => void
  submitLabel: string
}) {
  const field = "w-full rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none focus:ring-1 focus:ring-zinc-500"
  return (
    <div className="space-y-3">
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Title</label>
        <Input value={draft.title} onChange={(e) => setField("title", e.target.value)} placeholder="e.g. Delaware franchise tax" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Category</label>
          <select value={draft.category} onChange={(e) => setField("category", e.target.value)} className={field}>
            {OBLIGATION_CATEGORIES.map((c) => <option key={c} value={c}>{CATEGORY_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Cadence</label>
          <select value={draft.cadence} onChange={(e) => setField("cadence", e.target.value)} className={field}>
            {OBLIGATION_CADENCES.map((c) => <option key={c} value={c}>{CADENCE_LABELS[c]}</option>)}
          </select>
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Status</label>
          <select value={draft.status} onChange={(e) => setField("status", e.target.value)} className={field}>
            {OBLIGATION_STATUSES.map((s) => <option key={s} value={s}>{STATUS_LABELS[s]}</option>)}
          </select>
        </div>
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-3">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Due date</label>
          <Input value={draft.dueDate} onChange={(e) => setField("dueDate", e.target.value)} placeholder="YYYY-MM-DD" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Authority</label>
          <Input value={draft.authority} onChange={(e) => setField("authority", e.target.value)} placeholder="IRS, Delaware, FinCEN…" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Owner</label>
          <Input value={draft.owner} onChange={(e) => setField("owner", e.target.value)} placeholder="Who's responsible" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
        </div>
      </div>
      <div>
        <label className="mb-1 block text-xs text-zinc-500">Description</label>
        <textarea value={draft.description} onChange={(e) => setField("description", e.target.value)} rows={2} className={field} placeholder="What it is and why it matters" />
      </div>
      <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Evidence URL (optional)</label>
          <Input value={draft.docUrl} onChange={(e) => setField("docUrl", e.target.value)} placeholder="https://… receipt/filing" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
        </div>
        <div>
          <label className="mb-1 block text-xs text-zinc-500">Notes (optional)</label>
          <Input value={draft.notes} onChange={(e) => setField("notes", e.target.value)} placeholder="Internal note" className="border-zinc-700 bg-zinc-900 text-zinc-100" />
        </div>
      </div>
      <div className="flex justify-end gap-2">
        <Button size="sm" variant="ghost" onClick={onCancel}>Cancel</Button>
        <Button size="sm" disabled={pending} onClick={onSubmit}>{submitLabel}</Button>
      </div>
    </div>
  )
}
