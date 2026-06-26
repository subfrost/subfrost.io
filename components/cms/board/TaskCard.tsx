"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, UserPlus } from "lucide-react"
import type { TaskView, InitiativeView, TaskStatus, TaskPriority, MemberView } from "@/lib/tasks/types"
import { TASK_PRIORITY, TASK_STATUS, STATUS_ORDER, PRIORITY_ORDER, ownerInitials, ownerName } from "@/lib/tasks/types"
import { moveTaskAction, deleteTaskAction, claimTaskAction, assignTaskAction, updateTaskAction } from "@/actions/tasks/board"

export function TaskCard({ task, initiative, selectableInitiatives, members, canEdit }: {
  task: TaskView
  initiative: InitiativeView | null
  selectableInitiatives: InitiativeView[]
  members: MemberView[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [busy, setBusy] = useState(false)
  const pr = TASK_PRIORITY[task.priority]

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

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
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
        <span className={`text-sm leading-snug ${task.status === "DONE" ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{task.title}</span>
        {canEdit ? (
          <select
            aria-label="Priority"
            title="Priority"
            value={task.priority}
            onChange={(e) => run(() => updateTaskAction(task.id, { priority: e.target.value as TaskPriority }))}
            className={`shrink-0 rounded px-1 py-0.5 text-[11px] font-medium focus:outline-none ${pr.cls}`}
          >
            <optgroup label="Priority">
              {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
            </optgroup>
          </select>
        ) : (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${pr.cls}`}>{pr.label}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {task.labels.map((l) => (
          <span key={l} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{l}</span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5">
          {task.owner && (
            <span title={ownerName(task.owner)} className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-medium text-sky-300">{ownerInitials(task.owner)}</span>
          )}
          {canEdit ? (
            <>
              {!task.owner && (
                <button onClick={() => run(() => claimTaskAction(task.id))} className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300">
                  <UserPlus size={12} /> Self-assign
                </button>
              )}
              <select
                aria-label="Assign"
                title="Assign to a member"
                value={task.owner?.id ?? ""}
                onChange={(e) => run(() => assignTaskAction(task.id, e.target.value || null))}
                className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-400 focus:outline-none"
              >
                <option value="">{task.owner ? "Unassign" : "Assign…"}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
              </select>
            </>
          ) : !task.owner ? (
            <span className="text-[11px] text-zinc-600">Unassigned</span>
          ) : null}
        </span>
      </div>

      {canEdit && task.status === "BLOCKED" && (
        <div className="mt-2">
          <input
            aria-label="Blocker reason"
            defaultValue={task.blockerReason}
            onBlur={(e) => { if (e.target.value !== task.blockerReason) run(() => updateTaskAction(task.id, { blockerReason: e.target.value })) }}
            placeholder="What's blocking this?"
            className="w-full rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-200 placeholder:text-rose-400/50 focus:outline-none"
          />
        </div>
      )}
      {!canEdit && task.status === "BLOCKED" && task.blockerReason && (
        <p className="mt-2 text-[11px] text-rose-300/80">{task.blockerReason}</p>
      )}

      {canEdit && (
        <div className="mt-2 flex items-center gap-2 border-t border-zinc-800 pt-2">
          <select
            aria-label="Status"
            value={task.status}
            onChange={(e) => run(() => moveTaskAction(task.id, e.target.value as TaskStatus))}
            className="rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none"
          >
            {STATUS_ORDER.map((s) => <option key={s} value={s}>{TASK_STATUS[s].label}</option>)}
          </select>
          <button onClick={() => run(() => deleteTaskAction(task.id))} aria-label="Delete task" className="ml-auto text-zinc-600 hover:text-rose-400">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
