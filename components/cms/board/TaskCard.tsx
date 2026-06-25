"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Check, Trash2, UserPlus } from "lucide-react"
import type { TaskView, InitiativeView, TaskStatus } from "@/lib/tasks/types"
import { TASK_PRIORITY, TASK_STATUS, STATUS_ORDER, ownerInitials, ownerName } from "@/lib/tasks/types"
import { claimTaskAction, moveTaskAction, deleteTaskAction } from "@/actions/tasks/board"

export function TaskCard({ task, initiative, canEdit }: {
  task: TaskView
  initiative: InitiativeView | null
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

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      <div className="mb-2 flex items-start justify-between gap-2">
        <span className={`text-sm leading-snug ${task.status === "DONE" ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{task.title}</span>
        <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${pr.cls}`}>{pr.label}</span>
      </div>
      <div className="flex flex-wrap items-center gap-1.5">
        {initiative && (
          <span title={initiative.name} className="inline-flex items-center gap-1 text-[11px]" style={{ color: initiative.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: initiative.color }} />
          </span>
        )}
        {task.labels.map((l) => (
          <span key={l} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{l}</span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5">
          {task.owner ? (
            <span title={ownerName(task.owner)} className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-medium text-sky-300">{ownerInitials(task.owner)}</span>
          ) : canEdit ? (
            <button onClick={() => run(() => claimTaskAction(task.id))} className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300">
              <UserPlus size={12} /> Assign to me
            </button>
          ) : (
            <span className="text-[11px] text-zinc-600">Unassigned</span>
          )}
        </span>
      </div>
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
          {task.status !== "DONE" && (
            <button onClick={() => run(() => moveTaskAction(task.id, "DONE"))} className="inline-flex items-center gap-1 text-[11px] text-emerald-400 hover:text-emerald-300">
              <Check size={12} /> Done
            </button>
          )}
          <button onClick={() => run(() => deleteTaskAction(task.id))} aria-label="Delete task" className="ml-auto text-zinc-600 hover:text-rose-400">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
