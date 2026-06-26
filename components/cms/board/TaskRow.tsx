"use client"

import type { TaskView, InitiativeView } from "@/lib/tasks/types"
import { TASK_PRIORITY, TASK_STATUS, ownerName } from "@/lib/tasks/types"

export function TaskRow({ task, initiative, onOpen }: { task: TaskView; initiative: InitiativeView | null; onOpen: (id: string) => void }) {
  return (
    <tr className="cursor-pointer border-t border-zinc-800 hover:bg-zinc-900/60" onClick={() => onOpen(task.id)}>
      <td className="px-3 py-2 text-zinc-100">
        <span className="flex items-center gap-1.5">
          {task.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: task.color }} title={task.colorLabel || undefined} />}
          {task.title}
        </span>
      </td>
      <td className={`px-3 py-2 ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label}</td>
      <td className="px-3 py-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${TASK_PRIORITY[task.priority].cls}`}>{TASK_PRIORITY[task.priority].label}</span>
      </td>
      <td className="px-3 py-2 text-zinc-300">{ownerName(task.owner)}</td>
      <td className="px-3 py-2" style={initiative ? { color: initiative.color } : undefined}>{initiative?.name ?? "—"}</td>
    </tr>
  )
}
