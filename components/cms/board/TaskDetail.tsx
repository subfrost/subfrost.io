"use client"

import { useEffect, useState } from "react"
import { useRouter } from "next/navigation"
import { X, Trash2, UserPlus } from "lucide-react"
import type { TaskView, InitiativeView, MemberView, TaskStatus, TaskPriority, ChecklistItem } from "@/lib/tasks/types"
import { STATUS_ORDER, PRIORITY_ORDER, TASK_STATUS, TASK_PRIORITY, SUGGESTED_LABELS, colorName, ownerName, ownerInitials } from "@/lib/tasks/types"
import { updateTaskAction, moveTaskAction, assignTaskAction, claimTaskAction, deleteTaskAction } from "@/actions/tasks/board"
import { Checklist } from "./Checklist"
import { ColorPicker } from "./ColorPicker"
import { CommentList } from "./CommentList"

const labelCls = "text-[11px] font-medium uppercase tracking-wide text-zinc-500"
const fieldCls = "w-full rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:border-sky-500 focus:outline-none"

export function TaskDetail({ task, initiatives, members, canEdit, onClose }: {
  task: TaskView
  initiatives: InitiativeView[]
  members: MemberView[]
  canEdit: boolean
  onClose: () => void
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const [confirmDelete, setConfirmDelete] = useState(false)
  const [title, setTitle] = useState(task.title)
  const [description, setDescription] = useState(task.description)
  const [labelDraft, setLabelDraft] = useState("")
  const [checklist, setChecklist] = useState<ChecklistItem[]>(task.checklist)

  // Re-sync local fields when the underlying task changes (after router.refresh()).
  useEffect(() => {
    setTitle(task.title)
    setDescription(task.description)
    setChecklist(task.checklist)
  }, [task])

  useEffect(() => {
    function onKey(e: KeyboardEvent) { if (e.key === "Escape") onClose() }
    window.addEventListener("keydown", onKey)
    return () => window.removeEventListener("keydown", onKey)
  }, [onClose])

  async function run(fn: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    await fn()
    setBusy(false)
    router.refresh()
  }

  function saveTitle() {
    const t = title.trim()
    if (t && t !== task.title) run(() => updateTaskAction(task.id, { title: t }))
    else if (!t) setTitle(task.title)
  }
  function saveDescription() {
    if (description !== task.description) run(() => updateTaskAction(task.id, { description }))
  }
  function saveChecklist(next: ChecklistItem[]) {
    setChecklist(next)
    run(() => updateTaskAction(task.id, { checklist: next }))
  }
  function addLabel() {
    const l = labelDraft.trim()
    if (!l || task.labels.includes(l)) { setLabelDraft(""); return }
    run(() => updateTaskAction(task.id, { labels: [...task.labels, l] }))
    setLabelDraft("")
  }
  function removeLabel(l: string) {
    run(() => updateTaskAction(task.id, { labels: task.labels.filter((x) => x !== l) }))
  }
  function pickColor(hex: string) {
    // The color tints the task's labels — no separate name.
    run(() => updateTaskAction(task.id, { color: hex }))
  }

  const initiativeOptions = (() => {
    const current = task.initiativeId ? initiatives.find((i) => i.id === task.initiativeId) ?? null : null
    const opts = [...initiatives]
    if (current && !opts.some((i) => i.id === current.id)) opts.unshift(current)
    return opts
  })()

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center overflow-y-auto bg-black/60 p-4 md:p-8" onClick={onClose}>
      <div className="my-4 w-full max-w-lg rounded-xl border border-zinc-800 bg-zinc-950 shadow-2xl" onClick={(e) => e.stopPropagation()}>
        {/* Header */}
        <div className="flex items-start gap-2 border-b border-zinc-800 p-4">
          {canEdit ? (
            <input
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              onBlur={saveTitle}
              onKeyDown={(e) => { if (e.key === "Enter") (e.target as HTMLInputElement).blur() }}
              placeholder="Task title…"
              className="flex-1 bg-transparent text-lg font-semibold text-zinc-100 outline-none"
            />
          ) : (
            <h2 className="flex-1 text-lg font-semibold text-zinc-100">{task.title}</h2>
          )}
          <button onClick={onClose} aria-label="Close" className="ml-2 text-zinc-500 hover:text-zinc-300"><X size={20} /></button>
        </div>

        <div className="max-h-[72vh] space-y-5 overflow-y-auto p-4">
          {/* Status + Priority */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Status</label>
              <select disabled={!canEdit} value={task.status} onChange={(e) => run(() => moveTaskAction(task.id, e.target.value as TaskStatus))} className={`mt-1 ${fieldCls}`}>
                {STATUS_ORDER.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Priority</label>
              <select disabled={!canEdit} value={task.priority} onChange={(e) => run(() => updateTaskAction(task.id, { priority: e.target.value as TaskPriority }))} className={`mt-1 ${fieldCls}`}>
                {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
              </select>
            </div>
          </div>

          {/* Initiative + Owner */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className={labelCls}>Initiative</label>
              <select disabled={!canEdit} value={task.initiativeId ?? ""} onChange={(e) => run(() => updateTaskAction(task.id, { initiativeId: e.target.value || null }))} className={`mt-1 ${fieldCls}`}>
                <option value="">— None —</option>
                {initiativeOptions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
            </div>
            <div>
              <label className={labelCls}>Owner</label>
              <div className="mt-1 flex items-center gap-2">
                {task.owner && (
                  <span title={ownerName(task.owner)} className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-medium text-sky-300">{ownerInitials(task.owner)}</span>
                )}
                <select disabled={!canEdit} value={task.owner?.id ?? ""} onChange={(e) => run(() => assignTaskAction(task.id, e.target.value || null))} className="min-w-0 flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1.5 text-sm text-zinc-100 focus:outline-none">
                  <option value="">{task.owner ? "Unassign" : "Unassigned"}</option>
                  {members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
                </select>
              </div>
              {canEdit && !task.owner && (
                <button onClick={() => run(() => claimTaskAction(task.id))} className="mt-1 inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300"><UserPlus size={12} /> Self-assign</button>
              )}
            </div>
          </div>

          {/* Description */}
          <div>
            <label className={labelCls}>Description</label>
            {canEdit ? (
              <textarea value={description} onChange={(e) => setDescription(e.target.value)} onBlur={saveDescription} rows={4} placeholder="Add a description…" className={`mt-1 max-h-[60vh] min-h-[5rem] resize-y ${fieldCls}`} />
            ) : (
              <p className="mt-1 whitespace-pre-wrap text-sm text-zinc-300">{task.description || <span className="text-zinc-600">No description</span>}</p>
            )}
          </div>

          {/* Blocked tag (independent of column/status) */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-rose-400">Blocked</label>
            {canEdit ? (
              <div className="mt-1 space-y-2">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    aria-label="Blocked"
                    checked={task.blocked}
                    onChange={(e) => run(() => updateTaskAction(task.id, { blocked: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-rose-500 focus:ring-0"
                  />
                  Mark this task as blocked
                </label>
                {task.blocked && (
                  <input
                    aria-label="Blocker reason"
                    defaultValue={task.blockerReason}
                    onBlur={(e) => { if (e.target.value !== task.blockerReason) run(() => updateTaskAction(task.id, { blockerReason: e.target.value })) }}
                    placeholder="What's blocking this?"
                    className="w-full rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-sm text-rose-200 placeholder:text-rose-400/50 focus:outline-none"
                  />
                )}
              </div>
            ) : task.blocked ? (
              <p className="mt-1 text-sm text-rose-300/80">{task.blockerReason || "Blocked"}</p>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">Not blocked</p>
            )}
          </div>

          {/* Labels */}
          <div>
            <label className={labelCls}>Labels</label>
            <div className="mt-1 flex flex-wrap items-center gap-1.5">
              {task.labels.map((l) => (
                <span
                  key={l}
                  className={`inline-flex items-center gap-1 rounded px-1.5 py-0.5 text-[11px] ${task.color ? "border" : "bg-zinc-800 text-zinc-300"}`}
                  style={task.color ? { borderColor: task.color, color: task.color } : undefined}
                >
                  {l}
                  {canEdit && <button onClick={() => removeLabel(l)} aria-label={`Remove ${l}`} className="opacity-70 hover:text-rose-400"><X size={11} /></button>}
                </span>
              ))}
              {task.labels.length === 0 && !canEdit && <span className="text-[11px] text-zinc-600">None</span>}
            </div>
            {canEdit && (
              <div className="mt-1.5 flex gap-1.5">
                <input
                  list="task-label-suggestions"
                  value={labelDraft}
                  onChange={(e) => setLabelDraft(e.target.value)}
                  onKeyDown={(e) => { if (e.key === "Enter") { e.preventDefault(); addLabel() } }}
                  placeholder="Add a label…"
                  className="flex-1 rounded border border-zinc-700 bg-zinc-900 px-2 py-1 text-sm text-zinc-100 placeholder:text-zinc-600 focus:border-sky-500 focus:outline-none"
                />
                <datalist id="task-label-suggestions">
                  {SUGGESTED_LABELS.map((l) => <option key={l} value={l} />)}
                </datalist>
              </div>
            )}
          </div>

          {/* Color (tints this task's labels) */}
          <div>
            <label className={`${labelCls} mb-1.5 block`}>Color</label>
            {canEdit ? (
              <ColorPicker selected={task.color} onChange={pickColor} />
            ) : task.color ? (
              <span className="inline-flex items-center gap-1.5 text-sm text-zinc-300">
                <span className="h-3 w-3 rounded-full" style={{ backgroundColor: task.color }} />
                {colorName(task.color)}
              </span>
            ) : (
              <span className="text-sm text-zinc-600">None</span>
            )}
          </div>

          {/* Checklist */}
          <div>
            <label className={`${labelCls} mb-1.5 block`}>Checklist</label>
            <Checklist items={checklist} onChange={saveChecklist} disabled={!canEdit} />
          </div>

          {/* Comments */}
          <div>
            <label className={`${labelCls} mb-1.5 block`}>Comments</label>
            <CommentList taskId={task.id} canEdit={canEdit} />
          </div>
        </div>

        {/* Footer */}
        {canEdit && (
          <div className="flex items-center justify-between border-t border-zinc-800 p-4">
            {confirmDelete ? (
              <div className="flex items-center gap-2">
                <span className="text-sm text-rose-400">Move to recycle bin?</span>
                <button onClick={() => run(() => deleteTaskAction(task.id)).then(onClose)} className="rounded bg-rose-600 px-2.5 py-1 text-sm text-white hover:bg-rose-700">Delete</button>
                <button onClick={() => setConfirmDelete(false)} className="rounded border border-zinc-700 px-2.5 py-1 text-sm text-zinc-300 hover:bg-zinc-800">Cancel</button>
              </div>
            ) : (
              <button onClick={() => setConfirmDelete(true)} className="inline-flex items-center gap-1.5 text-sm text-zinc-500 hover:text-rose-400"><Trash2 size={14} /> Delete</button>
            )}
            <button onClick={onClose} className="rounded border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">Close</button>
          </div>
        )}
      </div>
    </div>
  )
}
