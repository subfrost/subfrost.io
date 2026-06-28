"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, UserPlus, CheckSquare, MessageSquare, Ban } from "lucide-react"
import type { TaskView, InitiativeView, TaskStatus, TaskPriority, MemberView } from "@/lib/tasks/types"
import { TASK_PRIORITY, TASK_STATUS, STATUS_ORDER, PRIORITY_ORDER, ownerInitials, ownerName, checklistProgress } from "@/lib/tasks/types"
import { moveTaskAction, deleteTaskAction, claimTaskAction, assignTaskAction, updateTaskAction } from "@/actions/tasks/board"

function formatAge(from: Date): string {
  const s = Math.max(0, Math.floor((Date.now() - from.getTime()) / 1000))
  if (s < 60) return "now"
  const m = Math.floor(s / 60); if (m < 60) return `${m}m`
  const h = Math.floor(m / 60); if (h < 24) return `${h}h`
  const d = Math.floor(h / 24); if (d < 7) return `${d}d`
  const w = Math.floor(d / 7); if (d < 30) return `${w}w`
  const mo = Math.floor(d / 30); if (mo < 12) return `${mo}mo`
  return `${Math.floor(d / 365)}y`
}

export function TaskCard({ task, initiative, selectableInitiatives, members, canEdit, onOpen, onDragStart, onDragEnd, dragging }: {
  task: TaskView
  initiative: InitiativeView | null
  selectableInitiatives: InitiativeView[]
  members: MemberView[]
  canEdit: boolean
  onOpen: (id: string) => void
  onDragStart?: (id: string) => void
  onDragEnd?: () => void
  dragging?: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const pr = TASK_PRIORITY[task.priority]
  const cl = checklistProgress(task.checklist)

  async function run(fn: () => Promise<unknown>) {
    if (busy) return
    setBusy(true)
    await fn()
    setBusy(false)
    router.refresh()
  }

  const initiativeOptions = (() => {
    const opts = [...selectableInitiatives]
    if (initiative && !opts.some((i) => i.id === initiative.id)) opts.unshift(initiative)
    return opts
  })()

  // Click anywhere on the card opens the detail panel — except on an actual
  // inline control (so the dropdowns/buttons keep working).
  function cardClick(e: React.MouseEvent) {
    if ((e.target as HTMLElement).closest("button, select, input, textarea, a, label")) return
    onOpen(task.id)
  }

  return (
    <div
      draggable={canEdit}
      onDragStart={(e) => { if (!canEdit) return; e.dataTransfer.setData("text/plain", task.id); e.dataTransfer.effectAllowed = "move"; onDragStart?.(task.id) }}
      onDragEnd={() => onDragEnd?.()}
      onClick={cardClick}
      style={task.color ? { borderLeftColor: task.color, borderLeftWidth: 3 } : undefined}
      className={`cursor-pointer rounded-md border border-zinc-800 bg-zinc-900 p-3 transition-shadow hover:border-zinc-700 hover:shadow-md ${dragging ? "opacity-40" : ""} ${canEdit ? "active:cursor-grabbing" : ""}`}
    >
      {canEdit ? (
        <div className="mb-2">
          <select
            aria-label="Initiative"
            title="Initiative"
            value={task.initiativeId ?? ""}
            onChange={(e) => run(() => updateTaskAction(task.id, { initiativeId: e.target.value || null }))}
            className="max-w-full rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] focus:outline-none"
            style={{ color: initiative ? initiative.color : undefined }}
          >
            <option value="">— No initiative —</option>
            {initiativeOptions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      ) : initiative ? (
        <div className="mb-2 inline-flex items-center gap-1 text-[11px]" style={{ color: initiative.color }}>
          <span className="h-2 w-2 rounded-full" style={{ background: initiative.color }} />
          {initiative.name}
        </div>
      ) : null}

      <div className="mb-2 flex items-start justify-between gap-2">
        <span className="flex min-w-0 flex-1 items-start gap-1.5">
          <button
            onClick={() => onOpen(task.id)}
            title="Open details"
            className={`text-left text-sm leading-snug hover:text-sky-300 ${task.status === "DONE" ? "text-zinc-500 line-through" : "text-zinc-100"}`}
          >
            {task.title}
          </button>
        </span>
        <span className="flex shrink-0 items-center gap-1.5">
          {initiative && (
            <span className="h-3 w-3 shrink-0 rounded-full ring-1 ring-black/30" style={{ backgroundColor: initiative.color }} title={initiative.name} aria-label={`Initiative: ${initiative.name}`} />
          )}
          {canEdit ? (
            <select
              aria-label="Priority"
              title="Priority"
              value={task.priority}
              onChange={(e) => run(() => updateTaskAction(task.id, { priority: e.target.value as TaskPriority }))}
              className={`shrink-0 rounded px-1 py-0.5 text-[11px] font-medium focus:outline-none ${pr.cls}`}
              style={{ colorScheme: "dark" }}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p} style={{ color: TASK_PRIORITY[p].color, backgroundColor: "#18181b" }}>{TASK_PRIORITY[p].label}</option>
              ))}
            </select>
          ) : (
            <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${pr.cls}`}>{pr.label}</span>
          )}
        </span>
      </div>

      {(task.labels.length > 0 || cl.total > 0 || task.commentCount > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {task.labels.map((l) => (
            <span
              key={l}
              className={`rounded px-1.5 py-0.5 text-[11px] ${task.color ? "border" : "bg-zinc-800 text-zinc-400"}`}
              style={task.color ? { borderColor: task.color, color: task.color } : undefined}
            >
              {l}
            </span>
          ))}
          {cl.total > 0 && (
            <span title="Checklist" className={`inline-flex items-center gap-0.5 text-[11px] ${cl.done === cl.total ? "text-emerald-400" : "text-zinc-500"}`}>
              <CheckSquare size={11} /> {cl.done}/{cl.total}
            </span>
          )}
          {task.commentCount > 0 && (
            <span title="Comments" className="inline-flex items-center gap-0.5 text-[11px] text-zinc-500">
              <MessageSquare size={11} /> {task.commentCount}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {task.owner && (
          <>
            <span title={ownerName(task.owner)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-medium text-sky-300">{ownerInitials(task.owner)}</span>
            <span title={ownerName(task.owner)} className="min-w-0 flex-1 truncate text-[11px] text-zinc-300">{ownerName(task.owner)}</span>
          </>
        )}
        {canEdit ? (
          <>
            {!task.owner && (
              <button onClick={() => run(() => claimTaskAction(task.id))} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-sky-400 hover:text-sky-300">
                <UserPlus size={12} /> Self-assign
              </button>
            )}
            <select
              aria-label="Assign"
              title={task.owner ? "Reassign to a member" : "Assign to a member"}
              value=""
              onChange={(e) => { const v = e.target.value; if (v) run(() => assignTaskAction(task.id, v === "__none__" ? null : v)) }}
              className="ml-auto shrink-0 rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-400 focus:outline-none"
              style={{ colorScheme: "dark" }}
            >
              <option value="">{task.owner ? "Reassign" : "Assign…"}</option>
              {task.owner && <option value="__none__">Unassign</option>}
              {members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
            </select>
          </>
        ) : !task.owner ? (
          <span className="ml-auto shrink-0 text-[11px] text-zinc-600">Unassigned</span>
        ) : null}
      </div>

      {task.blocked && (
        <div className="mt-2 space-y-1">
          <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">
            <Ban size={10} /> Blocked
          </span>
          {canEdit ? (
            <input
              aria-label="Blocker reason"
              defaultValue={task.blockerReason}
              onBlur={(e) => { if (e.target.value !== task.blockerReason) run(() => updateTaskAction(task.id, { blockerReason: e.target.value })) }}
              placeholder="What's blocking this?"
              className="w-full rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-200 placeholder:text-rose-400/50 focus:outline-none"
            />
          ) : task.blockerReason ? (
            <p className="text-[11px] text-rose-300/80">{task.blockerReason}</p>
          ) : null}
        </div>
      )}

      <div className="mt-2 flex items-center gap-2 border-t border-zinc-800 pt-2">
        {canEdit && (
          <select
            aria-label="Status"
            value={task.status}
            onChange={(e) => run(() => moveTaskAction(task.id, e.target.value as TaskStatus))}
            className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none"
          >
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
          </select>
        )}
        {canEdit && (
          <button
            onClick={() => run(() => updateTaskAction(task.id, { blocked: !task.blocked }))}
            aria-label={task.blocked ? "Unmark blocked" : "Mark blocked"}
            title={task.blocked ? "Unmark blocked" : "Mark blocked"}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${task.blocked ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
          >
            <Ban size={12} /> {task.blocked ? "Blocked" : "Block"}
          </button>
        )}
        <span className="ml-auto text-[10px] tabular-nums text-zinc-600" title={`Created ${task.createdAt.toLocaleString()}`}>{formatAge(task.createdAt)}</span>
        {canEdit && (
          <button onClick={() => run(() => deleteTaskAction(task.id))} aria-label="Delete task" className="text-zinc-600 hover:text-rose-400">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
