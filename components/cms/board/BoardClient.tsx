"use client"

import { useEffect, useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { ArrowUpRight, Layers, Plus, Trash2 } from "lucide-react"
import type { TaskView, InitiativeView, ProductView, BoardFilterState, MemberView, TaskStatus } from "@/lib/tasks/types"
import { TASK_STATUS, EMPTY_FILTERS } from "@/lib/tasks/types"
import { buildBoard, distinctLabels, selectableInitiatives, filterTasks } from "@/lib/tasks/board"
import { createTaskAction, bulkCreateTasksAction, moveTaskAction } from "@/actions/tasks/board"
import { TaskCard } from "./TaskCard"
import { TaskRow } from "./TaskRow"
import { BoardFilters } from "./BoardFilters"
import { TaskDetail } from "./TaskDetail"
import { RecycleBin } from "./RecycleBin"

const FILTERS_KEY = "subfrost:board:filters:v2"

export function BoardClient({ tasks, deletedTasks, initiatives, products = [], members, meId, canEdit }: {
  tasks: TaskView[]
  deletedTasks: TaskView[]
  initiatives: InitiativeView[]
  products?: ProductView[]
  members: MemberView[]
  meId: string
  canEdit: boolean
}) {
  const router = useRouter()
  const [view, setView] = useState<"board" | "list">("board")
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
  // Dashboard filter state (products/priority/assignee/status/…), persisted.
  const [filters, setFilters] = useState<BoardFilterState>(() => {
    if (typeof window === "undefined") return EMPTY_FILTERS
    try { return { ...EMPTY_FILTERS, ...JSON.parse(localStorage.getItem(FILTERS_KEY) || "{}") } } catch { return EMPTY_FILTERS }
  })
  useEffect(() => {
    try { localStorage.setItem(FILTERS_KEY, JSON.stringify(filters)) } catch { /* ignore */ }
  }, [filters])

  const initiativeById = useMemo(
    () => Object.fromEntries(initiatives.map((i) => [i.id, i])) as Record<string, InitiativeView>,
    [initiatives],
  )
  const productByInitiative = useMemo(
    () => Object.fromEntries(initiatives.map((i) => [i.id, i.productId])) as Record<string, string | null>,
    [initiatives],
  )
  const selectable = useMemo(() => selectableInitiatives(initiatives), [initiatives])
  const labels = useMemo(() => distinctLabels(tasks), [tasks])
  const visibleTasks = useMemo(() => filterTasks(tasks, filters, productByInitiative, meId), [tasks, filters, productByInitiative, meId])
  const board = useMemo(() => buildBoard(visibleTasks), [visibleTasks])
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
    await createTaskAction({ title, initiativeId: filters.initiativeId ?? null, labels: filters.label ? [filters.label] : [] })
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
    `h-9 px-3 text-sm transition-colors ${
      active
        ? "bg-[color:var(--ed-ink)] text-[color:var(--ed-canvas)]"
        : "text-[color:var(--ed-muted)] hover:text-[color:var(--ed-ink)]"
    }`

  return (
    <div className="ed-admin-reveal space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-6 border-b border-[color:var(--ed-hair)] pb-10">
        <div>
          <p className="text-sm text-[color:var(--ed-muted)]">Admin</p>
          <h1 className="mt-3 text-[56px] font-medium leading-none text-[color:var(--ed-ink)] md:text-[68px]">Board</h1>
          <p className="mt-4 max-w-[620px] text-[17px] leading-[1.5] text-[color:var(--ed-body)]">
            Track initiatives, ownership, blockers, and project execution from one operational surface.
          </p>
        </div>
        <div className="flex items-center gap-2">
          {canEdit && (
            <button onClick={() => setBinOpen(true)} title="Recycle bin" className="inline-flex h-9 items-center gap-1.5 rounded-[6px] px-3 text-sm text-[color:var(--ed-muted)] hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)]">
              <Trash2 size={15} /> Deleted{deletedTasks.length > 0 && <span className="rounded-full bg-[color:var(--ed-surface)] px-1.5 text-[11px] text-[color:var(--ed-ink)]">{deletedTasks.length}</span>}
            </button>
          )}
          <div className="inline-flex overflow-hidden rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)]">
            <button onClick={() => setView("board")} className={segCls(view === "board")}>Board</button>
            <button onClick={() => setView("list")} className={segCls(view === "list")}>List</button>
          </div>
        </div>
      </div>

      <BoardFilters state={filters} setState={setFilters} products={products} initiatives={initiatives} members={members} labels={labels} meId={meId} />

      {canEdit && (
        <div className="space-y-3">
          <div className="flex flex-col gap-2 md:flex-row">
            <input
              value={quick}
              onChange={(e) => setQuick(e.target.value)}
              onKeyDown={(e) => { if (e.key === "Enter") addQuick() }}
              placeholder="Quick add a task…  (Enter)"
              className="h-11 flex-1 rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-3 text-sm text-[color:var(--ed-ink)] outline-none placeholder:text-[color:var(--ed-muted)] focus:border-[color:var(--ed-muted)]"
              style={{ minHeight: 44 }}
            />
            <button onClick={addQuick} disabled={busy || !quick.trim()} className="inline-flex h-11 items-center justify-center gap-1 rounded-[6px] bg-[color:var(--ed-action-bg)] px-4 text-sm text-[color:var(--ed-action-fg)] hover:opacity-85 disabled:opacity-45">
              <Plus size={16} /> Add
            </button>
            <button onClick={() => setBulkOpen((v) => !v)} disabled={selectable.length === 0} title={selectable.length === 0 ? "Create an initiative first" : "Bulk add tasks to an initiative"} className="inline-flex h-11 items-center justify-center gap-1 rounded-[6px] px-4 text-sm text-[color:var(--ed-muted)] hover:bg-[color:var(--ed-surface)] hover:text-[color:var(--ed-ink)] disabled:opacity-40">
              <Layers size={16} /> Bulk Add
            </button>
          </div>
          {bulkOpen && (
            <div className="ed-admin-reveal space-y-3 border-t border-[color:var(--ed-hair)] pt-4">
              <select value={bulkInitiative} onChange={(e) => setBulkInitiative(e.target.value)} aria-label="Bulk initiative" className="h-10 w-full rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-3 text-sm text-[color:var(--ed-ink)] outline-none">
                <option value="">Choose an initiative…</option>
                {selectable.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
              </select>
              <textarea value={bulkText} onChange={(e) => setBulkText(e.target.value)} rows={4} aria-label="Bulk tasks" placeholder={"One task per line\nAudit mint path\nWrite the migration"} className="w-full rounded-[6px] border border-[color:var(--ed-hair)] bg-[color:var(--ed-surface)] px-3 py-2 font-mono text-sm text-[color:var(--ed-ink)] outline-none placeholder:text-[color:var(--ed-muted)]" />
              {bulkError && <p className="text-xs text-rose-400">{bulkError}</p>}
              <div className="flex items-center justify-between">
                <span className="text-xs text-[color:var(--ed-muted)]">{bulkCount} task{bulkCount === 1 ? "" : "s"} will be created</span>
                <button onClick={bulkAdd} disabled={busy} className="inline-flex h-9 items-center rounded-[6px] bg-[color:var(--ed-action-bg)] px-3 text-sm text-[color:var(--ed-action-fg)] disabled:opacity-50">Add tasks</button>
              </div>
            </div>
          )}
        </div>
      )}

      {view === "board" ? (
        <div className="grid grid-cols-1 gap-5 xl:grid-cols-4">
          {board.columns.map((col) => (
            <div
              key={col.status}
              onDragOver={(e) => { if (draggingId) { e.preventDefault(); setDragOver(col.status) } }}
              onDragLeave={(e) => { if (e.currentTarget === e.target) setDragOver(null) }}
              onDrop={(e) => { e.preventDefault(); dropOnColumn(col.status) }}
              className={`min-h-[360px] border-t p-0 pt-4 transition-colors ${
                dragOver === col.status ? "border-[color:var(--ed-ink)] bg-[color:var(--ed-surface)]/45" : "border-[color:var(--ed-hair)]"
              }`}
            >
              <div className="mb-4 flex items-center justify-between">
                <span className="text-sm font-medium text-[color:var(--ed-ink)]">{col.title}</span>
                <span className="font-mono text-xs text-[color:var(--ed-muted)]">{col.count}</span>
              </div>
              <div className="space-y-3">
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
                  <p className="px-1 py-10 text-center text-sm text-[color:var(--ed-muted)]">{dragOver === col.status ? "Drop here" : "No tasks"}</p>
                )}
              </div>
            </div>
          ))}
        </div>
      ) : (
        <div className="overflow-x-auto border-t border-[color:var(--ed-hair)]">
          <table className="w-full text-sm">
            <thead className="text-left text-xs text-[color:var(--ed-muted)]">
              <tr>
                <th className="py-3 pr-4 font-medium">Task</th>
                <th className="px-4 py-3 font-medium">Status</th>
                <th className="px-4 py-3 font-medium">Priority</th>
                <th className="px-4 py-3 font-medium">Owner</th>
                <th className="py-3 pl-4 font-medium">Initiative</th>
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

      <div className="border-t border-[color:var(--ed-hair)] pt-6 text-sm text-[color:var(--ed-muted)]">
        Board data is backed by the admin task API and updates through server actions. <a href="/admin/board/initiatives" className="inline-flex items-center gap-1 text-[color:var(--ed-ink)] hover:opacity-70">Manage initiatives <ArrowUpRight size={14} /></a>
      </div>
    </div>
  )
}
