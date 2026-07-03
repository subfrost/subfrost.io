"use client"

import type { TaskView, InitiativeView } from "@/lib/tasks/types"
import { TASK_PRIORITY, TASK_STATUS, ownerName } from "@/lib/tasks/types"

export function TaskRow({ task, initiative, onOpen }: { task: TaskView; initiative: InitiativeView | null; onOpen: (id: string) => void }) {
  return (
    <tr className="cursor-pointer border-t border-[color:var(--ed-hair)] transition-colors hover:bg-[color:var(--ed-surface)]" onClick={() => onOpen(task.id)}>
      <td className="px-3 py-3 text-[color:var(--ed-ink)]">
        <span className="flex items-center gap-1.5">
          {task.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: task.color }} title={task.colorLabel || undefined} />}
          {task.title}
          {task.blocked && <span className="rounded bg-rose-500/15 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">Blocked</span>}
        </span>
      </td>
      <td className={`px-3 py-3 ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label}</td>
      <td className="px-3 py-3">
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${TASK_PRIORITY[task.priority].cls}`}>{TASK_PRIORITY[task.priority].label}</span>
      </td>
      <td className="px-3 py-3 text-[color:var(--ed-body)]">{ownerName(task.owner)}</td>
      <td className="px-3 py-3 text-[color:var(--ed-muted)]" style={initiative ? { color: initiative.color } : undefined}>{initiative?.name ?? "-"}</td>
    </tr>
  )
}
