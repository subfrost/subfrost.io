"use client"

import type { TaskView, InitiativeView } from "@/lib/tasks/types"
import { TASK_PRIORITY, TASK_STATUS, ownerName } from "@/lib/tasks/types"

export function TaskRow({ task, initiative }: { task: TaskView; initiative: InitiativeView | null }) {
  return (
    <tr className="border-t border-zinc-800">
      <td className="px-3 py-2 text-zinc-100">{task.title}</td>
      <td className={`px-3 py-2 ${TASK_STATUS[task.status].cls}`}>{TASK_STATUS[task.status].label}</td>
      <td className="px-3 py-2">
        <span className={`rounded px-1.5 py-0.5 text-[11px] ${TASK_PRIORITY[task.priority].cls}`}>{TASK_PRIORITY[task.priority].label}</span>
      </td>
      <td className="px-3 py-2 text-zinc-300">{ownerName(task.owner)}</td>
      <td className="px-3 py-2" style={initiative ? { color: initiative.color } : undefined}>{initiative?.name ?? "—"}</td>
    </tr>
  )
}
