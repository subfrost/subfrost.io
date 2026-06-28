export type TaskStatus = "REQUESTED" | "TODO" | "BLOCKED" | "IN_PROGRESS" | "DONE"
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "FIRE"
export type InitiativeStatus = "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE"

export interface OwnerView {
  id: string
  name: string | null
  email: string
}

export type MemberView = OwnerView

export interface ChecklistItem {
  id: string
  text: string
  checked: boolean
}

export interface TaskView {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
  blockerReason: string
  blocked: boolean
  color: string
  colorLabel: string
  checklist: ChecklistItem[]
  commentCount: number
  owner: OwnerView | null
  initiativeId: string | null
  position: number
  createdAt: Date
  updatedAt: Date
}

export interface CommentView {
  id: string
  taskId: string
  author: OwnerView | null
  body: string
  createdAt: Date
}

export interface InitiativeView {
  id: string
  name: string
  goal: string
  color: string
  status: InitiativeStatus
  archived: boolean
  productId: string | null
  createdAt: Date
  updatedAt: Date
}

export interface ProductView {
  id: string
  name: string
  color: string
  archived: boolean
  createdAt: Date
  updatedAt: Date
}

export interface BoardFilter {
  initiativeId?: string | null // null/undefined = all
  label?: string
  ownerId?: string // "My tasks" passes the current user id
  status?: TaskStatus
}

// Rich dashboard filter state for the board. `assignee` is "all" | "mine" |
// "unassigned" | a member id. Empty arrays mean "no constraint".
export interface BoardFilterState {
  hiddenProducts: string[]
  initiativeId: string | null
  priorities: TaskPriority[]
  statuses: TaskStatus[]
  assignee: string // "all" | "mine" | "unassigned" | <memberId>
  label: string | null
}

export const EMPTY_FILTERS: BoardFilterState = {
  hiddenProducts: [], initiativeId: null, priorities: [], statuses: [], assignee: "all", label: null,
}

export interface BoardColumn {
  status: TaskStatus
  title: string
  tasks: TaskView[]
  count: number
}

export interface BoardData {
  columns: BoardColumn[] // always [REQUESTED, TODO, IN_PROGRESS, DONE]
  total: number
}

export interface InitiativeBoardColumn {
  status: InitiativeStatus
  title: string
  initiatives: InitiativeView[]
  count: number
}

export interface InitiativeBoardData {
  columns: InitiativeBoardColumn[] // always [TODO, ON_HOLD, IN_PROGRESS, DONE]
}

export interface InitiativeProgress {
  total: number
  done: number
  active: number
  pct: number
}

export const STATUS_ORDER: TaskStatus[] = ["REQUESTED", "TODO", "IN_PROGRESS", "DONE"]
export const PRIORITY_ORDER: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "FIRE"]
export const INITIATIVE_STATUS_ORDER: InitiativeStatus[] = ["TODO", "ON_HOLD", "IN_PROGRESS", "DONE"]

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  REQUESTED: { label: "Requested Tasks", cls: "text-violet-300", dot: "bg-violet-400" },
  TODO: { label: "To do", cls: "text-zinc-400", dot: "bg-zinc-500" },
  BLOCKED: { label: "Blocked", cls: "text-rose-300", dot: "bg-rose-400" },
  IN_PROGRESS: { label: "In Progress", cls: "text-sky-300", dot: "bg-sky-400" },
  DONE: { label: "Done", cls: "text-emerald-300", dot: "bg-emerald-400" },
}

// `color` is the per-level hex used to tint each <option> directly (native
// <option>s don't reliably inherit Tailwind text classes), so every priority
// keeps its own fixed color whether the dropdown is closed or open.
// Scale cold→hot: Low gray · Med amber · High orange · Fire red.
export const TASK_PRIORITY: Record<TaskPriority, { label: string; rank: number; cls: string; color: string }> = {
  FIRE: { label: "Fire", rank: 3, cls: "bg-red-500/20 text-red-300", color: "#fca5a5" },
  HIGH: { label: "High", rank: 2, cls: "bg-orange-500/20 text-orange-300", color: "#fdba74" },
  MEDIUM: { label: "Med", rank: 1, cls: "bg-amber-500/15 text-amber-300", color: "#fcd34d" },
  LOW: { label: "Low", rank: 0, cls: "bg-zinc-500/15 text-zinc-400", color: "#a1a1aa" },
}

export const INITIATIVE_STATUS: Record<InitiativeStatus, { label: string; cls: string; dot: string }> = {
  TODO: { label: "To do", cls: "text-zinc-400", dot: "bg-zinc-500" },
  ON_HOLD: { label: "On hold", cls: "text-amber-300", dot: "bg-amber-400" },
  IN_PROGRESS: { label: "In Progress", cls: "text-sky-300", dot: "bg-sky-400" },
  DONE: { label: "Done", cls: "text-emerald-300", dot: "bg-emerald-400" },
}

export const SUGGESTED_LABELS = ["subfrost.io", "subfrost-app", "subfrost-admin", "contracts", "infra", "marketing"]

// Curated accent palette for per-task color tags. `name` is only the swatch
// tooltip / default suggestion — the user types their own colorLabel.
export const TASK_COLORS: { hex: string; name: string }[] = [
  { hex: "#ef4444", name: "Red" },
  { hex: "#f97316", name: "Orange" },
  { hex: "#f59e0b", name: "Amber" },
  { hex: "#eab308", name: "Yellow" },
  { hex: "#22c55e", name: "Green" },
  { hex: "#14b8a6", name: "Teal" },
  { hex: "#38bdf8", name: "Sky" },
  { hex: "#6366f1", name: "Indigo" },
  { hex: "#a855f7", name: "Violet" },
  { hex: "#ec4899", name: "Pink" },
  { hex: "#a1a1aa", name: "Zinc" },
]

export const MAX_COLOR_LABEL = 20

export function colorName(hex: string): string {
  return TASK_COLORS.find((c) => c.hex.toLowerCase() === hex.toLowerCase())?.name ?? hex
}

export function ownerInitials(owner: { name: string | null; email: string } | null): string {
  if (!owner) return "?"
  const base = owner.name?.trim() || owner.email
  const parts = base.split(/[\s@._-]+/).filter(Boolean)
  const a = parts[0]?.[0] ?? ""
  const b = parts.length > 1 ? parts[1][0] : ""
  return (a + b).toUpperCase() || "?"
}

export function ownerName(owner: { name: string | null; email: string } | null): string {
  return owner ? owner.name?.trim() || owner.email : "Unassigned"
}

export interface ChecklistProgress {
  total: number
  done: number
}

export function checklistProgress(items: ChecklistItem[]): ChecklistProgress {
  return { total: items.length, done: items.filter((i) => i.checked).length }
}
