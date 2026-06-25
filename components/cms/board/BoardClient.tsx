"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { KanbanSquare, Plus } from "lucide-react"
import type { TaskView, InitiativeView, BoardFilter } from "@/lib/tasks/types"
import { TASK_STATUS } from "@/lib/tasks/types"
import { buildBoard, distinctLabels } from "@/lib/tasks/board"
import { createTaskAction } from "@/actions/tasks/board"
import { TaskCard } from "./TaskCard"
import { TaskRow } from "./TaskRow"
import { BoardFilters } from "./BoardFilters"

export function BoardClient({ tasks, initiatives, meId, canEdit }: {
  tasks: TaskView[]
  initiatives: InitiativeView[]
  meId: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<"board" | "list">("board")
  const [filter, setFilter] = useState<BoardFilter>({})
  const [quick, setQuick] = useState("")
  const [busy, setBusy] = useState(false)

  const initiativeById = useMemo(
    () => Object.fromEntries(initiatives.map((i) => [i.id, i])) as Record<string, InitiativeView>,
    [initiatives],
  )
  const labels = useMemo(() => distinctLabels(tasks), [tasks])
  const board = useMemo(() => buildBoard(tasks, filter), [tasks, filter])

  async function addQuick() {
    const title = quick.trim()
    if (!title || busy) return
    setBusy(true)
    await createTaskAction({ title, initiativeId: filter.initiativeId ?? null, labels: filter.label ? [filter.label] : [] })
    setQuick("")
    setBusy(false)
    router.refresh()
  }

  const segCls = (active: boolean) =>
    `px-3 py-1.5 text-sm ${active ? "bg-sky-500/15 text-sky-300" : "text-zinc-400 hover:bg-zinc-800"}`

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <KanbanSquare size={20} className="text-zinc-400" /> Board
        </h1>
        <div className="inline-flex overflow-hidden rounded-md border border-zinc-700">
          <button onClick={() => setView("board")} className={segCls(view === "board")}>Board</button>
          <button onClick={() => setView("list")} className={segCls(view === "list")}>List</button>
        </div>
      </div>

      <BoardFilters filter={filter} setFilter={setFilter} initiatives={initiatives} labels={labels} meId={meId} />

      {canEdit && (
        <div className="flex gap-2">
          <input
            value={quick}
            onChange={(e) => setQuick(e.target.value)}
            onKeyDown={(e) => { if (e.key === "Enter") addQuick() }}
            placeholder="Quick add a task…  (Enter)"
            className="flex-1 rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"
          />
          <button onClick={addQuick} disabled={busy} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-50">
            <Plus size={16} /> Add
          </button>
        </div>
      )}

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-3">
          {board.columns.map((col) => (
            <div key={col.status} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className={`text-sm font-medium ${TASK_STATUS[col.status].cls}`}>{col.title}</span>
                <span className="text-xs text-zinc-500">{col.count}</span>
              </div>
              <div className="space-y-2">
                {col.tasks.map((t) => (
                  <TaskCard key={t.id} task={t} initiative={t.initiativeId ? initiativeById[t.initiativeId] ?? null : null} canEdit={canEdit} />
                ))}
                {col.tasks.length === 0 && <p className="px-1 py-6 text-center text-xs text-zinc-600">No tasks</p>}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-hidden rounded-lg border border-zinc-800">
          <table className="w-full text-sm">
            <thead className="bg-zinc-900/60 text-left text-xs uppercase tracking-wide text-zinc-500">
              <tr>
                <th className="px-3 py-2 font-medium">Task</th>
                <th className="px-3 py-2 font-medium">Status</th>
                <th className="px-3 py-2 font-medium">Priority</th>
                <th className="px-3 py-2 font-medium">Owner</th>
                <th className="px-3 py-2 font-medium">Initiative</th>
              </tr>
            </thead>
            <tbody>
              {board.columns.flatMap((c) => c.tasks).map((t) => (
                <TaskRow key={t.id} task={t} initiative={t.initiativeId ? initiativeById[t.initiativeId] ?? null : null} />
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  )
}
