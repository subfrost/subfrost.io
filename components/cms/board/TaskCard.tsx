"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, UserPlus, CheckSquare, MessageSquare } from "lucide-react"
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
      className={`cursor-pointer rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-canvas)] p-3.5 shadow-[0_12px_40px_rgba(7,17,31,0.04)] transition-[border-color,box-shadow,opacity,transform] hover:border-[color:var(--ed-muted)] hover:shadow-[0_18px_55px_rgba(7,17,31,0.08)] ${dragging ? "opacity-40" : ""} ${canEdit ? "active:cursor-grabbing" : ""}`}
    >
      {canEdit ? (
        <div className="mb-2">
          <select
            aria-label="Initiative"
            title="Initiative"
            value={task.initiativeId ?? ""}
            onChange={(e) => run(() => updateTaskAction(task.id, { initiativeId: e.target.value || null }))}
            className="max-w-full rounded-[4px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-1.5 py-0.5 text-[11px] text-[color:var(--ed-ink)] outline-none"
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
            className={`text-left text-[15px] leading-snug transition-colors hover:text-[color:var(--ed-ink)] ${task.status === "DONE" ? "text-[color:var(--ed-muted)] line-through" : "text-[color:var(--ed-ink)]"}`}
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
              className={`shrink-0 rounded-[4px] px-1 py-0.5 text-[11px] font-medium outline-none ${pr.cls}`}
              style={{ colorScheme: "dark" }}
            >
              <optgroup label="Priority">
                {PRIORITY_ORDER.map((p) => <option key={p} value={p} style={{ color: TASK_PRIORITY[p].color }}>{TASK_PRIORITY[p].label}</option>)}
              </optgroup>
            </select>
          ) : (
            <span className={`shrink-0 rounded-[4px] px-1.5 py-0.5 text-[11px] font-medium ${pr.cls}`}>{pr.label}</span>
          )}
        </span>
      </div>

      {(task.labels.length > 0 || cl.total > 0 || task.commentCount > 0) && (
        <div className="mb-2 flex flex-wrap items-center gap-1.5">
          {task.labels.map((l) => (
            <span
              key={l}
              className={`rounded-[4px] px-1.5 py-0.5 text-[11px] ${task.color ? "border" : "bg-[color:var(--ed-surface)] text-[color:var(--ed-muted)]"}`}
              style={task.color ? { borderColor: task.color, color: task.color } : undefined}
            >
              {l}
            </span>
          ))}
          {cl.total > 0 && (
            <span title="Checklist" className={`inline-flex items-center gap-0.5 text-[11px] ${cl.done === cl.total ? "text-emerald-400" : "text-[color:var(--ed-muted)]"}`}>
              <CheckSquare size={11} /> {cl.done}/{cl.total}
            </span>
          )}
          {task.commentCount > 0 && (
            <span title="Comments" className="inline-flex items-center gap-0.5 text-[11px] text-[color:var(--ed-muted)]">
              <MessageSquare size={11} /> {task.commentCount}
            </span>
          )}
        </div>
      )}

      <div className="flex items-center gap-1.5">
        {task.owner && (
          <>
            <span title={ownerName(task.owner)} className="flex h-5 w-5 shrink-0 items-center justify-center rounded-full bg-[color:var(--ed-surface)] text-[10px] font-medium text-[color:var(--ed-ink)]">{ownerInitials(task.owner)}</span>
            <span title={ownerName(task.owner)} className="min-w-0 flex-1 truncate text-[11px] text-[color:var(--ed-body)]">{ownerName(task.owner)}</span>
          </>
        )}
        {canEdit ? (
          <>
            {!task.owner && (
              <button onClick={() => run(() => claimTaskAction(task.id))} className="inline-flex shrink-0 items-center gap-1 whitespace-nowrap text-[11px] text-[color:var(--ed-ink)] hover:opacity-70">
                <UserPlus size={12} /> Self-assign
              </button>
            )}
            <select
              aria-label="Assign"
              title={task.owner ? "Reassign to a member" : "Assign to a member"}
              value=""
              onChange={(e) => { const v = e.target.value; if (v) run(() => assignTaskAction(task.id, v === "__none__" ? null : v)) }}
              className="ml-auto shrink-0 rounded-[4px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-1 py-0.5 text-[11px] text-[color:var(--ed-muted)] outline-none"
              style={{ colorScheme: "dark" }}
            >
              <option value="">{task.owner ? "Reassign" : "Assign…"}</option>
              {task.owner && <option value="__none__">Unassign</option>}
              {members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
            </select>
          </>
        ) : !task.owner ? (
          <span className="ml-auto shrink-0 text-[11px] text-[color:var(--ed-muted)]">Unassigned</span>
        ) : null}
      </div>

      {canEdit && task.status === "BLOCKED" && (
        <div className="mt-2">
          <input
            aria-label="Blocker reason"
            defaultValue={task.blockerReason}
            onBlur={(e) => { if (e.target.value !== task.blockerReason) run(() => updateTaskAction(task.id, { blockerReason: e.target.value })) }}
            placeholder="What's blocking this?"
            className="w-full rounded-[4px] border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-300 placeholder:text-rose-400/50 outline-none"
          />
        </div>
      )}
      {!canEdit && task.status === "BLOCKED" && task.blockerReason && (
        <p className="mt-2 text-[11px] text-rose-300/80">{task.blockerReason}</p>
      )}

      <div className="mt-3 flex items-center gap-2 border-t border-[color:var(--ed-hair)] pt-3">
        {canEdit && (
          <select
            aria-label="Status"
            value={task.status}
            onChange={(e) => run(() => moveTaskAction(task.id, e.target.value as TaskStatus))}
            className="rounded-[4px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-1.5 py-1 text-[11px] text-[color:var(--ed-ink)] outline-none"
          >
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
          </select>
        )}
        <span className="ml-auto font-mono text-[10px] tabular-nums text-[color:var(--ed-muted)]" title={`Created ${task.createdAt.toLocaleString()}`}>{formatAge(task.createdAt)}</span>
        {canEdit && (
          <button onClick={() => run(() => deleteTaskAction(task.id))} aria-label="Delete task" className="text-[color:var(--ed-muted)] hover:text-rose-400">
            <Trash2 size={13} />
          </button>
        )}
      </div>
    </div>
  )
}
