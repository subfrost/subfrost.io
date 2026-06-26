"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { KanbanSquare, Plus, Layers, Trash2 } from "lucide-react"
import type { TaskView, InitiativeView, BoardFilter, MemberView, TaskStatus } from "@/lib/tasks/types"
import { TASK_STATUS } from "@/lib/tasks/types"
import { buildBoard, distinctLabels, selectableInitiatives } from "@/lib/tasks/board"
import { createTaskAction, bulkCreateTasksAction, moveTaskAction } from "@/actions/tasks/board"
import { TaskCard } from "./TaskCard"
import { TaskRow } from "./TaskRow"
import { BoardFilters } from "./BoardFilters"
import { TaskDetail } from "./TaskDetail"
import { RecycleBin } from "./RecycleBin"

export function BoardClient({ tasks, deletedTasks, initiatives, members, meId, canEdit }: {
  tasks: TaskView[]
  deletedTasks: TaskView[]
  initiatives: InitiativeView[]
  members: MemberView[]
  meId: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<"board" | "list">("board")
  const [filter, setFilter] = useState<BoardFilter>({})
  const [quick, setQuick] = useState("")
  const [busy, setBusy] = useState(false)
  const [bulkOpen, setBulkOpen] = useState(false)
  const [bulkInitiative, setBulkInitiative] = useState("")
  const [bulkText, setBulkText] = useState("")
  const [bulkError, setBulkError] = useState<string | null>(null)
  const [selectedId, setSelectedId] = useState<string | null>(null)
  const [binOpen, setBinOpen] = useState(false)
  const [draggingId, setDraggingId] = useState<string | null>(null)
  const [dragOver, setDragOver] = useState<TaskStatus | null>(null)

  const initiativeById = useMemo(
    () => Object.fromEntries(initiatives.map((i) => [i.id, i])) as Record<string, InitiativeView>,
    [initiatives],
  )
  const selectable = useMemo(() => selectableInitiatives(initiatives), [initiatives])
  const labels = useMemo(() => distinctLabels(tasks), [tasks])
  const board = useMemo(() => buildBoard(tasks, filter), [tasks, filter])
  const bulkCount = bulkText.split("\n").map((s) => s.trim()).filter(Boolean).length
  const selectedTask = selectedId ? tasks.find((t) => t.id === selectedId) ?? null : null

  async function dropOnColumn(status: TaskStatus) {
    const id = draggingId
    setDraggingId(null)
    setDragOver(null)
    if (!id) return
    const task = tasks.find((t) => t.id === id)
    if (!task) return
    // Land at the top of the destination column's priority band: position just
    // below the current minimum. No-op if nothing actually changed.
    const colTasks = board.columns.find((c) => c.status === status)?.tasks ?? []
    const minPos = colTasks.reduce((m, t) => (t.id !== id ? Math.min(m, t.position) : m), Infinity)
    const position = Number.isFinite(minPos) ? minPos - 1 : 0
    if (task.status === status && colTasks[0]?.id === id) return
    await moveTaskAction(id, status, position)
    router.refresh()
  }

  async function addQuick() {
    const title = quick.trim()
    if (!title || busy) return
    setBusy(true)
    await createTaskAction({ title, initiativeId: filter.initiativeId ?? null, labels: filter.label ? [filter.label] : [] })
    setQuick("")
    setBusy(false)
    router.refresh()
  }

  async function bulkAdd() {
    setBulkError(null)
    if (!bulkInitiative) { setBulkError("Pick an initiative"); return }
    if (bulkCount === 0 || busy) { setBulkError("Add at least one task"); return }
    setBusy(true)
    const r = await bulkCreateTasksAction({ initiativeId: bulkInitiative, titles: bulkText.split("\n") })
    setBusy(false)
    if (!r.ok) { setBulkError(r.error); return }
    setBulkText(""); setBulkInitiative(""); setBulkOpen(false)
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
        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={() => setBinOpen(true)} title="Recycle bin" className="inline-flex items-center gap-1.5 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-300 hover:bg-zinc-800">
              <Trash2 size={15} /> Deleted{deletedTasks.length > 0 && <span className="rounded-full bg-zinc-700 px-1.5 text-[11px] text-zinc-300">{deletedTasks.length}</span>}
            </button>
          )}
          <div className="inline-flex overflow-hidden rounded-md border border-zinc-700">
            <button onClick={() => setView("board")} className={segCls(view === "board")}>Board</button>
            <button onClick={() => setView("list")} className={segCls(view === "list")}>List</button>
          </div>
        </div>
      </div>

      <BoardFilters filter={filter} setFilter={setFilter} initiatives={initiatives} labels={labels} meId={meId} />

      {canEdit && (
        <div className="space-y-2">
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
            <button onClick={() => setBulkOpen((v) => !v)} disabled={selectable.length === 0} title={selectable.length === 0 ? "Create an initiative first" : "Bulk add tasks to an initiative"} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-2 text-sm text-zinc-200 hover:bg-zinc-800 disabled:opacity-40">
              <Layers size={16} /> Bulk Add
            </button>
          </div>
          {bulkOpen && (
            <div className="space-y-2 rounded-md border border-zinc-800 bg-zinc-900/40 p-3">
              <select value={bulkInitiative} onChange={(e) => setBulkInitiative(e.target.value)} aria-label="Bulk initiative" className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 focus:outline-none">
                <option value="">Choose an initiative…</option>
                {selectable.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={4} aria-label="Bulk tasks" placeholder={"One task per line\nAudit mint path\nWrite the migration"} className="w-full rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 font-mono text-sm text-zinc-100 placeholder:text-zinc-600 focus:outline-none" />
              {bulkError && <p className="text-xs text-rose-400">{bulkError}</p>}
              <div className="flex items-center justify-between">
                <span className="text-xs text-zinc-500">{bulkCount} task{bulkCount === 1 ? "" : "s"} will be created</span>
                <button onClick={bulkAdd} disabled={busy} className="rounded-md border border-sky-500/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10 disabled:opacity-50">Add tasks</button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
          {board.columns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => { if (draggingId) { e.preventDefault(); setDragOver(col.status) } }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(null) }}
              onDrop={(e) => { e.preventDefault(); dropOnColumn(col.status) }}
              className={`rounded-lg border bg-zinc-900/40 p-3 transition-colors ${dragOver === col.status ? "border-sky-500/60 bg-sky-500/5" : "border-zinc-800"}`}
            >
              <div className="mb-3 flex items-center justify-between px-1">
                <span className={`text-sm font-medium ${TASK_STATUS[col.status].cls}`}>{col.title}</span>
                <span className="text-xs text-zinc-500">{col.count}</span>
              </div>
              <div className="space-y-2">
                {col.tasks.map((t) => (
                  <TaskCard
                    key={t.id}
                    task={t}
                    initiative={t.initiativeId ? initiativeById[t.initiativeId] ?? null : null}
                    selectableInitiatives={selectable}
                    members={members}
                    canEdit={canEdit}
                    onOpen={setSelectedId}
                    onDragStart={setDraggingId}
                    onDragEnd={() => { setDraggingId(null); setDragOver(null) }}
                    dragging={draggingId === t.id}
                  />
                ))}
                {col.tasks.length === 0 && (
                  <p className="px-1 py-6 text-center text-xs text-zinc-600">{dragOver === col.status ? "Drop here" : "No tasks"}</p>
                )}
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
                <TaskRow key={t.id} task={t} initiative={t.initiativeId ? initiativeById[t.initiativeId] ?? null : null} onOpen={setSelectedId} />
              ))}
            </tbody>
          </table>
        </div>
      )}

      {selectedTask && (
        <TaskDetail
          task={selectedTask}
          initiatives={initiatives}
          members={members}
          canEdit={canEdit}
          onClose={() => setSelectedId(null)}
        />
      )}

      {binOpen && (
        <RecycleBin tasks={deletedTasks} initiatives={initiativeById} onClose={() => setBinOpen(false)} />
      )}
    </div>
  )
}
