import type { TaskView, BoardFilter, BoardFilterState, BoardData, BoardColumn, InitiativeProgress, InitiativeView, InitiativeBoardData } from "./types"
import { STATUS_ORDER, TASK_STATUS, TASK_PRIORITY, INITIATIVE_STATUS_ORDER, INITIATIVE_STATUS } from "./types"

// Apply the dashboard filter state. `productByInitiative` maps an initiative id
// to its product id (or null) so we can hide whole products. meId resolves the
// "mine" assignee shortcut.
export function filterTasks(
  tasks: TaskView[],
  s: BoardFilterState,
  productByInitiative: Record<string, string | null>,
  meId: string,
): TaskView[] {
  return tasks.filter((t) => {
    const productId = t.initiativeId ? productByInitiative[t.initiativeId] ?? null : null
    if (productId && s.hiddenProducts.includes(productId)) return false
    if (s.initiativeId && t.initiativeId !== s.initiativeId) return false
    if (s.priorities.length && !s.priorities.includes(t.priority)) return false
    if (s.statuses.length && !s.statuses.includes(t.status)) return false
    if (s.label && !t.labels.includes(s.label)) return false
    if (s.assignee === "mine" && t.owner?.id !== meId) return false
    if (s.assignee === "unassigned" && t.owner) return false
    if (s.assignee !== "all" && s.assignee !== "mine" && s.assignee !== "unassigned" && t.owner?.id !== s.assignee) return false
    return true
  })
}

// How many distinct filter constraints are active (for the "Filters (n)" badge).
export function activeFilterCount(s: BoardFilterState): number {
  let n = 0
  if (s.hiddenProducts.length) n++
  if (s.initiativeId) n++
  if (s.priorities.length) n++
  if (s.statuses.length) n++
  if (s.assignee !== "all") n++
  if (s.label) n++
  return n
}

export function applyFilter(tasks: TaskView[], filter: BoardFilter): TaskView[] {
  return tasks.filter((t) => {
    if (filter.initiativeId !== undefined && filter.initiativeId !== null && t.initiativeId !== filter.initiativeId) return false
    if (filter.label && !t.labels.includes(filter.label)) return false
    if (filter.ownerId && t.owner?.id !== filter.ownerId) return false
    if (filter.status && t.status !== filter.status) return false
    return true
  })
}

function byColumnOrder(a: TaskView, b: TaskView): number {
  const pr = TASK_PRIORITY[b.priority].rank - TASK_PRIORITY[a.priority].rank
  if (pr !== 0) return pr
  if (a.position !== b.position) return a.position - b.position
  return b.updatedAt.getTime() - a.updatedAt.getTime()
}

export function buildBoard(tasks: TaskView[], filter: BoardFilter = {}): BoardData {
  const filtered = applyFilter(tasks, filter)
  const columns: BoardColumn[] = STATUS_ORDER.map((status) => {
    const colTasks = filtered.filter((t) => t.status === status).sort(byColumnOrder)
    return { status, title: TASK_STATUS[status].label, tasks: colTasks, count: colTasks.length }
  })
  return { columns, total: filtered.length }
}

export function initiativeProgress(initiativeId: string, tasks: TaskView[]): InitiativeProgress {
  const mine = tasks.filter((t) => t.initiativeId === initiativeId)
  const total = mine.length
  const done = mine.filter((t) => t.status === "DONE").length
  const active = total - done
  const pct = total === 0 ? 0 : Math.round((done / total) * 100)
  return { total, done, active, pct }
}

export function distinctLabels(tasks: TaskView[]): string[] {
  const s = new Set<string>()
  for (const t of tasks) for (const l of t.labels) s.add(l)
  return [...s].sort()
}

export function buildInitiativeBoard(initiatives: InitiativeView[]): InitiativeBoardData {
  const live = initiatives.filter((i) => !i.archived)
  const columns = INITIATIVE_STATUS_ORDER.map((status) => {
    const colInitiatives = live.filter((i) => i.status === status)
    return { status, title: INITIATIVE_STATUS[status].label, initiatives: colInitiatives, count: colInitiatives.length }
  })
  return { columns }
}

export function selectableInitiatives(initiatives: InitiativeView[]): InitiativeView[] {
  return initiatives.filter((i) => !i.archived && (i.status === "TODO" || i.status === "IN_PROGRESS"))
}
