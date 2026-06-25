# Task Board (initiatives) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Um board de tasks colaborativo no `/admin` com initiatives (grupos com objetivo + seeding), views Board⇄List, filtros e auto-atribuição de baixo atrito.

**Architecture:** Padrão do repo: tipos+lógica pura (`lib/tasks/`), store fino sobre Prisma, server-actions gated (`actions/tasks/`), páginas RSC gated, client components dark-themed. Gating por IAM (`tasks.view`/`tasks.edit`).

**Tech Stack:** Next.js (App Router, RSC), Prisma/Postgres, TypeScript, Tailwind (tema dark), Vitest + @testing-library/react (happy-dom), lucide-react, zod.

## Global Constraints

- Branch atual: `feat/admin-task-board`. **Toda mudança via PR** (branch→PR→merge main); nunca push direto na main.
- **Schema aditivo.** Rodar `npx prisma generate` após editar `schema.prisma` e **antes** de tsc/build. Deploy real (init container `prisma db push` + bump `newTag`→Flux) é human-owned, fora deste plano.
- **Gates (em `C:\Alkanes Geral Dev\subfrost.io`):** `npx tsc --noEmit` = 0 · `npx vitest run` verde · `npm run build` = 0.
- **Testes:** Vitest, env global `happy-dom`, `globals: true`, setup `tests/setup.ts`. Sem pragma de environment.
- **Tema:** dark do `/admin` — superfícies `bg-zinc-900`/`bg-zinc-900/40`, borders `border-zinc-800`/`border-zinc-700`, texto `text-zinc-100`/`text-zinc-400`/`text-zinc-500`, acento `sky-400/300/500`, `rounded-md`/`rounded-lg`.
- **IAM:** ADMIN herda `tasks.*` automaticamente (não-restrito). Páginas gated com `currentUser()` + `redirect`.
- **Rodar a suíte CHEIA** ao mexer em arquivo compartilhado (`registry.ts`, `admin-nav.ts`, `icons.tsx`, `schema.prisma`, `audit.ts`).
- DRY, YAGNI, TDD, commits frequentes.

---

## File Structure

- `lib/tasks/types.ts` — tipos (`TaskView`, `InitiativeView`, `BoardFilter`, `BoardData`…), metadata `TASK_STATUS`/`TASK_PRIORITY`, `SUGGESTED_LABELS`, helpers `ownerInitials`/`ownerName`. Prisma-free.
- `lib/tasks/board.ts` — lógica pura: `buildBoard`, `applyFilter`, `initiativeProgress`, `distinctLabels`.
- `lib/tasks/store.ts` — CRUD Prisma fino (tasks + initiatives + seeding).
- `actions/tasks/board.ts` — server-actions gated.
- `lib/cms/iam/registry.ts`, `lib/cms/iam/icons.tsx`, `lib/cms/admin-nav.ts`, `lib/cms/audit.ts` — wiring IAM/nav/audit (edições).
- `prisma/schema.prisma` — models `Initiative`/`Task` + enums (edição).
- `components/cms/board/{BoardClient,TaskCard,TaskRow,BoardFilters,InitiativesClient}.tsx`.
- `app/admin/board/page.tsx`, `app/admin/board/initiatives/page.tsx`.
- Testes em `tests/tasks/`.

---

### Task 1: IAM + nav + icons wiring

**Files:**
- Modify: `lib/cms/iam/registry.ts`
- Modify: `lib/cms/iam/icons.tsx`
- Modify: `lib/cms/admin-nav.ts`
- Test: `tests/tasks/iam.test.ts`

**Interfaces:**
- Produces: privileges `"tasks.view"` / `"tasks.edit"`; category `"tasks"` (label `"Board"`); nav group key `"board"` com leaves `/admin/board` e `/admin/board/initiatives`; `VIEW_GATES["/admin/board"]` e `["/admin/board/initiatives"]`.

- [ ] **Step 1: Write the failing test** — `tests/tasks/iam.test.ts`

```ts
import { it, expect } from "vitest"
import { expand, VIEW_GATES, PRIVILEGES } from "@/lib/cms/iam/registry"
import { effectivePrivileges } from "@/lib/cms/privileges"
import { visibleNav } from "@/lib/cms/admin-nav"

it("tasks.edit implies tasks.view", () => {
  expect(expand(["tasks.edit"])).toContain("tasks.view")
})

it("registers both task privileges under the tasks category", () => {
  const codes = PRIVILEGES.filter((p) => p.category === "tasks").map((p) => p.code)
  expect(codes).toEqual(expect.arrayContaining(["tasks.view", "tasks.edit"]))
})

it("ADMIN inherits both task privileges", () => {
  const eff = effectivePrivileges("ADMIN", [])
  expect(eff).toContain("tasks.view")
  expect(eff).toContain("tasks.edit")
})

it("gates the board routes on tasks.view", () => {
  expect(VIEW_GATES["/admin/board"].view).toBe("tasks.view")
  expect(VIEW_GATES["/admin/board/initiatives"].view).toBe("tasks.view")
})

it("shows the Board nav group (Tasks + Initiatives) for a tasks.view user", () => {
  const group = visibleNav(["tasks.view"]).find((g) => g.key === "board")
  expect(group).toBeTruthy()
  expect(group!.items.map((i) => i.href)).toEqual(["/admin/board", "/admin/board/initiatives"])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tasks/iam.test.ts`
Expected: FAIL (tasks.* not in registry; no "board" nav group).

- [ ] **Step 3: Edit `lib/cms/iam/registry.ts`**

Add `"tasks"` to the `CategoryKey` union:

```ts
export type CategoryKey =
  | "articles"
  | "iam"
  | "apikeys"
  | "audit"
  | "community"
  | "compliance"
  | "billing"
  | "financials"
  | "files"
  | "marketing"
  | "tasks"
```

Add the category to `CATEGORIES` (right after the `articles` entry):

```ts
  { key: "articles", label: "Articles" },
  { key: "tasks", label: "Board" },
```

Add to `PRIVILEGES` (a new block, e.g. after the Articles block):

```ts
  // --- Board (tasks) ---
  { code: "tasks.view", label: "Board — view", description: "View the team task board and initiatives.", category: "tasks", implies: [] },
  { code: "tasks.edit", label: "Board — edit", description: "Create, claim, move, and edit tasks and initiatives.", category: "tasks", implies: ["tasks.view"] },
```

Add to `VIEW_GATES`:

```ts
  "/admin/board": { view: "tasks.view", edit: "tasks.edit" },
  "/admin/board/initiatives": { view: "tasks.view", edit: "tasks.edit" },
```

- [ ] **Step 4: Edit `lib/cms/iam/icons.tsx`**

Add `KanbanSquare` to the lucide import and the map:

```tsx
import {
  UserCog, FileText, Megaphone, Scale, CreditCard, Banknote, KeyRound, ScrollText, Shield, FolderOpen, TrendingUp, KanbanSquare,
} from "lucide-react"
```

```tsx
export const CATEGORY_ICON: Record<CategoryKey, LucideIcon> = {
  iam: UserCog,
  articles: FileText,
  tasks: KanbanSquare,
  community: Megaphone,
  compliance: Scale,
  billing: CreditCard,
  financials: Banknote,
  files: FolderOpen,
  marketing: TrendingUp,
  apikeys: KeyRound,
  audit: ScrollText,
}
```

- [ ] **Step 5: Edit `lib/cms/admin-nav.ts`**

Add `KanbanSquare` to the lucide import line. Then insert a new group right after the `articles` group in `NAV_GROUPS`:

```ts
  {
    key: "board", label: "Board", icon: KanbanSquare, items: [
      { label: "Tasks", href: "/admin/board", icon: KanbanSquare, privilege: "tasks.view" },
      { label: "Initiatives", href: "/admin/board/initiatives", icon: Target, privilege: "tasks.view" },
    ],
  },
```

Add `Target` to the lucide import line as well (used for the Initiatives leaf).

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/tasks/iam.test.ts`
Expected: PASS (all 5).

- [ ] **Step 7: Run the full suite (shared files touched)**

Run: `npx vitest run`
Expected: green (no regression in existing iam/nav tests).

- [ ] **Step 8: Commit**

```bash
git add lib/cms/iam/registry.ts lib/cms/iam/icons.tsx lib/cms/admin-nav.ts tests/tasks/iam.test.ts
git commit -m "feat(board): IAM privileges, category, and nav group for the task board"
```

---

### Task 2: Domain types + metadata + helpers

**Files:**
- Create: `lib/tasks/types.ts`
- Test: `tests/tasks/types.test.ts`

**Interfaces:**
- Produces: `TaskStatus`, `TaskPriority`, `OwnerView`, `TaskView`, `InitiativeView`, `BoardFilter`, `BoardColumn`, `BoardData`, `InitiativeProgress`; `TASK_STATUS`, `TASK_PRIORITY`, `STATUS_ORDER`, `SUGGESTED_LABELS`; `ownerInitials(owner)`, `ownerName(owner)`.

- [ ] **Step 1: Write the failing test** — `tests/tasks/types.test.ts`

```ts
import { it, expect } from "vitest"
import { TASK_STATUS, TASK_PRIORITY, STATUS_ORDER, ownerInitials, ownerName } from "@/lib/tasks/types"

it("has metadata for every status and an explicit column order", () => {
  expect(STATUS_ORDER).toEqual(["TODO", "IN_PROGRESS", "DONE"])
  expect(TASK_STATUS.TODO.label).toBe("To do")
  expect(TASK_STATUS.IN_PROGRESS.label).toBe("Doing")
  expect(TASK_STATUS.DONE.label).toBe("Done")
})

it("ranks priorities HIGH > MEDIUM > LOW", () => {
  expect(TASK_PRIORITY.HIGH.rank).toBeGreaterThan(TASK_PRIORITY.MEDIUM.rank)
  expect(TASK_PRIORITY.MEDIUM.rank).toBeGreaterThan(TASK_PRIORITY.LOW.rank)
})

it("derives owner initials and a display name", () => {
  expect(ownerInitials({ name: "Vitor Texeira", email: "v@x.io" })).toBe("VT")
  expect(ownerInitials({ name: null, email: "gabe@subfrost.io" })).toBe("GS")
  expect(ownerInitials(null)).toBe("?")
  expect(ownerName(null)).toBe("Unassigned")
  expect(ownerName({ name: "Gabe", email: "g@x.io" })).toBe("Gabe")
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tasks/types.test.ts`
Expected: FAIL ("Cannot find module '@/lib/tasks/types'").

- [ ] **Step 3: Create `lib/tasks/types.ts`**

```ts
export type TaskStatus = "TODO" | "IN_PROGRESS" | "DONE"
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH"

export interface OwnerView {
  id: string
  name: string | null
  email: string
}

export interface TaskView {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
  owner: OwnerView | null
  initiativeId: string | null
  position: number
  createdAt: Date
  updatedAt: Date
}

export interface InitiativeView {
  id: string
  name: string
  goal: string
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

export interface BoardColumn {
  status: TaskStatus
  title: string
  tasks: TaskView[]
  count: number
}

export interface BoardData {
  columns: BoardColumn[] // always [TODO, IN_PROGRESS, DONE]
  total: number
}

export interface InitiativeProgress {
  total: number
  done: number
  active: number
  pct: number
}

export const STATUS_ORDER: TaskStatus[] = ["TODO", "IN_PROGRESS", "DONE"]

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  TODO: { label: "To do", cls: "text-zinc-400", dot: "bg-zinc-500" },
  IN_PROGRESS: { label: "Doing", cls: "text-sky-300", dot: "bg-sky-400" },
  DONE: { label: "Done", cls: "text-emerald-300", dot: "bg-emerald-400" },
}

export const TASK_PRIORITY: Record<TaskPriority, { label: string; rank: number; cls: string }> = {
  HIGH: { label: "High", rank: 2, cls: "bg-rose-500/15 text-rose-300" },
  MEDIUM: { label: "Med", rank: 1, cls: "bg-amber-500/15 text-amber-300" },
  LOW: { label: "Low", rank: 0, cls: "bg-zinc-500/15 text-zinc-400" },
}

export const SUGGESTED_LABELS = ["subfrost.io", "subfrost-app", "subfrost-admin", "contracts", "infra", "marketing"]

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tasks/types.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/types.ts tests/tasks/types.test.ts
git commit -m "feat(board): task/initiative domain types, metadata, and owner helpers"
```

---

### Task 3: Pure board logic

**Files:**
- Create: `lib/tasks/board.ts`
- Test: `tests/tasks/board.test.ts`

**Interfaces:**
- Consumes: types from `@/lib/tasks/types`.
- Produces: `buildBoard(tasks: TaskView[], filter?: BoardFilter): BoardData`; `applyFilter(tasks, filter): TaskView[]`; `initiativeProgress(initiativeId, tasks): InitiativeProgress`; `distinctLabels(tasks): string[]`.

- [ ] **Step 1: Write the failing test** — `tests/tasks/board.test.ts`

```ts
import { it, expect } from "vitest"
import { buildBoard, applyFilter, initiativeProgress, distinctLabels } from "@/lib/tasks/board"
import type { TaskView } from "@/lib/tasks/types"

const t = (over: Partial<TaskView>): TaskView => ({
  id: "x", title: "t", description: "", status: "TODO", priority: "MEDIUM",
  labels: [], owner: null, initiativeId: null, position: 0,
  createdAt: new Date("2026-06-25T00:00:00Z"), updatedAt: new Date("2026-06-25T00:00:00Z"), ...over,
})

it("groups tasks into the three ordered columns", () => {
  const b = buildBoard([t({ id: "a", status: "TODO" }), t({ id: "b", status: "DONE" })])
  expect(b.columns.map((c) => c.status)).toEqual(["TODO", "IN_PROGRESS", "DONE"])
  expect(b.columns[0].count).toBe(1)
  expect(b.columns[2].count).toBe(1)
  expect(b.total).toBe(2)
})

it("orders a column by priority desc", () => {
  const b = buildBoard([
    t({ id: "lo", status: "TODO", priority: "LOW" }),
    t({ id: "hi", status: "TODO", priority: "HIGH" }),
  ])
  expect(b.columns[0].tasks.map((x) => x.id)).toEqual(["hi", "lo"])
})

it("filters by initiative, label, owner, and status", () => {
  const tasks = [
    t({ id: "a", initiativeId: "i1", labels: ["marketing"], owner: { id: "u1", name: null, email: "e" }, status: "TODO" }),
    t({ id: "b", initiativeId: "i2", labels: ["infra"], status: "DONE" }),
  ]
  expect(applyFilter(tasks, { initiativeId: "i1" }).map((x) => x.id)).toEqual(["a"])
  expect(applyFilter(tasks, { label: "infra" }).map((x) => x.id)).toEqual(["b"])
  expect(applyFilter(tasks, { ownerId: "u1" }).map((x) => x.id)).toEqual(["a"])
  expect(applyFilter(tasks, { status: "DONE" }).map((x) => x.id)).toEqual(["b"])
  expect(applyFilter(tasks, { initiativeId: null }).length).toBe(2)
})

it("computes initiative progress", () => {
  const tasks = [
    t({ initiativeId: "i1", status: "DONE" }),
    t({ initiativeId: "i1", status: "TODO" }),
    t({ initiativeId: "i2", status: "DONE" }),
  ]
  expect(initiativeProgress("i1", tasks)).toEqual({ total: 2, done: 1, active: 1, pct: 50 })
  expect(initiativeProgress("none", tasks)).toEqual({ total: 0, done: 0, active: 0, pct: 0 })
})

it("collects distinct labels sorted", () => {
  const tasks = [t({ labels: ["b", "a"] }), t({ labels: ["a", "c"] })]
  expect(distinctLabels(tasks)).toEqual(["a", "b", "c"])
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tasks/board.test.ts`
Expected: FAIL ("Cannot find module '@/lib/tasks/board'").

- [ ] **Step 3: Create `lib/tasks/board.ts`**

```ts
import type { TaskView, BoardFilter, BoardData, BoardColumn, InitiativeProgress } from "./types"
import { STATUS_ORDER, TASK_STATUS, TASK_PRIORITY } from "./types"

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
```

- [ ] **Step 4: Run test to verify it passes**

Run: `npx vitest run tests/tasks/board.test.ts`
Expected: PASS.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/board.ts tests/tasks/board.test.ts
git commit -m "feat(board): pure board aggregation (columns, filter, progress, labels)"
```

---

### Task 4: Prisma schema + store

**Files:**
- Modify: `prisma/schema.prisma`
- Create: `lib/tasks/store.ts`
- Test: `tests/tasks/store.test.ts`

**Interfaces:**
- Consumes: `prisma` (`@/lib/prisma`), types from `@/lib/tasks/types`.
- Produces: `TaskError`; `listTasks()`, `createTask(input)`, `updateTask(id, patch)`, `moveTask(id, status)`, `claimTask(id, ownerId)`, `deleteTask(id)`; `listInitiatives()`, `createInitiativeWithSeed(input)`, `updateInitiative(id, patch)`, `archiveInitiative(id)`. Input types: `CreateTaskInput`, `UpdateTaskPatch`, `CreateInitiativeInput { name; goal?; color?; seedTitles?; createdById? }`, `UpdateInitiativePatch`.

- [ ] **Step 1: Edit `prisma/schema.prisma`** — add enums + models (after the `BalanceSheetItem` block, end of file)

```prisma
// ============================================
// TASK BOARD (initiatives) — /admin/board
// ============================================

enum TaskStatus {
  TODO
  IN_PROGRESS
  DONE
}

enum TaskPriority {
  LOW
  MEDIUM
  HIGH
}

model Initiative {
  id          String   @id @default(cuid())
  name        String
  goal        String   @default("")
  color       String   @default("#38bdf8")
  archived    Boolean  @default(false)
  createdById String?
  tasks       Task[]
  createdAt   DateTime @default(now())
  updatedAt   DateTime @updatedAt

  @@index([archived])
}

model Task {
  id           String       @id @default(cuid())
  title        String
  description  String       @default("")
  status       TaskStatus   @default(TODO)
  priority     TaskPriority @default(MEDIUM)
  labels       String[]     @default([])
  ownerId      String?
  owner        User?        @relation("TaskOwner", fields: [ownerId], references: [id], onDelete: SetNull)
  initiativeId String?
  initiative   Initiative?  @relation(fields: [initiativeId], references: [id], onDelete: SetNull)
  createdById  String?
  position     Float        @default(0)
  createdAt    DateTime     @default(now())
  updatedAt    DateTime     @updatedAt

  @@index([status])
  @@index([initiativeId])
  @@index([ownerId])
}
```

In `model User`, add the back-relation (next to the other relation lines, e.g. after `marketingSnapshots`):

```prisma
  tasksOwned         Task[]               @relation("TaskOwner")
```

- [ ] **Step 2: Generate the Prisma client**

Run: `npx prisma generate`
Expected: "Generated Prisma Client" (now `prisma.task` / `prisma.initiative` exist).

- [ ] **Step 3: Write the failing test** — `tests/tasks/store.test.ts`

```ts
import { it, expect, vi, beforeEach } from "vitest"

const client = vi.hoisted(() => ({
  task: { findMany: vi.fn(), create: vi.fn(), update: vi.fn(), delete: vi.fn() },
  initiative: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))

import { createTask, createInitiativeWithSeed, moveTask, claimTask, TaskError } from "@/lib/tasks/store"

const owner = { id: "u1", name: "Vitor", email: "v@x.io" }
beforeEach(() => vi.clearAllMocks())

it("rejects an empty task title", async () => {
  await expect(createTask({ title: "   " })).rejects.toBeInstanceOf(TaskError)
})

it("creates a task with defaults and maps the owner", async () => {
  client.task.create.mockResolvedValue({
    id: "t1", title: "Audit", description: "", status: "TODO", priority: "MEDIUM",
    labels: ["infra"], initiativeId: "i1", position: 0, owner,
    createdAt: new Date(), updatedAt: new Date(),
  })
  const v = await createTask({ title: "  Audit  ", labels: ["infra"], initiativeId: "i1", createdById: "u1" })
  expect(v.title).toBe("Audit")
  expect(v.owner).toEqual(owner)
  expect(client.task.create).toHaveBeenCalledWith(expect.objectContaining({
    data: expect.objectContaining({ title: "Audit", priority: "MEDIUM", initiativeId: "i1", createdById: "u1" }),
  }))
})

it("seeds an initiative with one task per non-empty line", async () => {
  client.initiative.create.mockResolvedValue({
    id: "i1", name: "frUSD", goal: "", color: "#38bdf8", archived: false,
    createdAt: new Date(), updatedAt: new Date(),
  })
  await createInitiativeWithSeed({ name: "frUSD", seedTitles: ["Deploy", "  ", "Audit"], createdById: "u1" })
  const arg = client.initiative.create.mock.calls[0][0]
  expect(arg.data.tasks.create.map((t: { title: string }) => t.title)).toEqual(["Deploy", "Audit"])
})

it("moveTask updates status; claimTask sets owner", async () => {
  client.task.update.mockResolvedValue({
    id: "t1", title: "x", description: "", status: "DONE", priority: "LOW",
    labels: [], initiativeId: null, position: 0, owner: null, createdAt: new Date(), updatedAt: new Date(),
  })
  await moveTask("t1", "DONE")
  expect(client.task.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t1" }, data: { status: "DONE" } }))
  await claimTask("t1", "u9")
  expect(client.task.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t1" }, data: { ownerId: "u9" } }))
})
```

- [ ] **Step 4: Run test to verify it fails**

Run: `npx vitest run tests/tasks/store.test.ts`
Expected: FAIL ("Cannot find module '@/lib/tasks/store'").

- [ ] **Step 5: Create `lib/tasks/store.ts`**

```ts
import prisma from "@/lib/prisma"
import type { TaskView, InitiativeView, TaskStatus, TaskPriority } from "./types"

export class TaskError extends Error {}

const TASK_INCLUDE = { owner: { select: { id: true, name: true, email: true } } }

type TaskRow = {
  id: string; title: string; description: string; status: string; priority: string
  labels: string[]; initiativeId: string | null; position: number; createdAt: Date; updatedAt: Date
  owner: { id: string; name: string | null; email: string } | null
}

function mapTask(r: TaskRow): TaskView {
  return {
    id: r.id, title: r.title, description: r.description,
    status: r.status as TaskStatus, priority: r.priority as TaskPriority,
    labels: r.labels, owner: r.owner, initiativeId: r.initiativeId,
    position: r.position, createdAt: r.createdAt, updatedAt: r.updatedAt,
  }
}

export async function listTasks(): Promise<TaskView[]> {
  const rows = (await prisma.task.findMany({ include: TASK_INCLUDE, orderBy: { createdAt: "desc" } })) as TaskRow[]
  return rows.map(mapTask)
}

export interface CreateTaskInput {
  title: string; description?: string; priority?: TaskPriority
  labels?: string[]; initiativeId?: string | null; ownerId?: string | null; createdById?: string | null
}

export async function createTask(input: CreateTaskInput): Promise<TaskView> {
  const title = input.title.trim()
  if (!title) throw new TaskError("A title is required")
  const r = (await prisma.task.create({
    data: {
      title,
      description: input.description?.trim() || "",
      priority: input.priority ?? "MEDIUM",
      labels: input.labels ?? [],
      initiativeId: input.initiativeId || null,
      ownerId: input.ownerId || null,
      createdById: input.createdById || null,
    },
    include: TASK_INCLUDE,
  })) as TaskRow
  return mapTask(r)
}

export interface UpdateTaskPatch {
  title?: string; description?: string; priority?: TaskPriority; labels?: string[]; initiativeId?: string | null
}

export async function updateTask(id: string, patch: UpdateTaskPatch): Promise<TaskView> {
  const data: Record<string, unknown> = {}
  if (patch.title !== undefined) {
    const t = patch.title.trim()
    if (!t) throw new TaskError("A title is required")
    data.title = t
  }
  if (patch.description !== undefined) data.description = patch.description.trim()
  if (patch.priority !== undefined) data.priority = patch.priority
  if (patch.labels !== undefined) data.labels = patch.labels
  if (patch.initiativeId !== undefined) data.initiativeId = patch.initiativeId || null
  const r = (await prisma.task.update({ where: { id }, data, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function moveTask(id: string, status: TaskStatus): Promise<TaskView> {
  const r = (await prisma.task.update({ where: { id }, data: { status }, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function claimTask(id: string, ownerId: string): Promise<TaskView> {
  const r = (await prisma.task.update({ where: { id }, data: { ownerId }, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function deleteTask(id: string): Promise<void> {
  await prisma.task.delete({ where: { id } })
}

// --- Initiatives ---

type InitiativeRow = { id: string; name: string; goal: string; color: string; archived: boolean; createdAt: Date; updatedAt: Date }

function mapInitiative(r: InitiativeRow): InitiativeView {
  return { id: r.id, name: r.name, goal: r.goal, color: r.color, archived: r.archived, createdAt: r.createdAt, updatedAt: r.updatedAt }
}

export async function listInitiatives(): Promise<InitiativeView[]> {
  const rows = (await prisma.initiative.findMany({ orderBy: { createdAt: "desc" } })) as InitiativeRow[]
  return rows.map(mapInitiative)
}

export interface CreateInitiativeInput {
  name: string; goal?: string; color?: string; seedTitles?: string[]; createdById?: string | null
}

export async function createInitiativeWithSeed(input: CreateInitiativeInput): Promise<InitiativeView> {
  const name = input.name.trim()
  if (!name) throw new TaskError("An initiative name is required")
  const titles = (input.seedTitles ?? []).map((t) => t.trim()).filter(Boolean)
  const r = (await prisma.initiative.create({
    data: {
      name,
      goal: input.goal?.trim() || "",
      color: input.color?.trim() || "#38bdf8",
      createdById: input.createdById || null,
      tasks: { create: titles.map((title) => ({ title, createdById: input.createdById || null })) },
    },
  })) as InitiativeRow
  return mapInitiative(r)
}

export interface UpdateInitiativePatch { name?: string; goal?: string; color?: string; archived?: boolean }

export async function updateInitiative(id: string, patch: UpdateInitiativePatch): Promise<InitiativeView> {
  const data: Record<string, unknown> = {}
  if (patch.name !== undefined) {
    const n = patch.name.trim()
    if (!n) throw new TaskError("An initiative name is required")
    data.name = n
  }
  if (patch.goal !== undefined) data.goal = patch.goal.trim()
  if (patch.color !== undefined) data.color = patch.color.trim()
  if (patch.archived !== undefined) data.archived = patch.archived
  const r = (await prisma.initiative.update({ where: { id }, data })) as InitiativeRow
  return mapInitiative(r)
}

export async function archiveInitiative(id: string): Promise<void> {
  await prisma.initiative.update({ where: { id }, data: { archived: true } })
}
```

- [ ] **Step 6: Run test to verify it passes**

Run: `npx vitest run tests/tasks/store.test.ts`
Expected: PASS.

- [ ] **Step 7: Commit**

```bash
git add prisma/schema.prisma lib/tasks/store.ts tests/tasks/store.test.ts
git commit -m "feat(board): Prisma Task/Initiative models + thin store with seeding"
```

---

### Task 5: Server actions (gated)

**Files:**
- Create: `actions/tasks/board.ts`
- Modify: `lib/cms/audit.ts` (add audit action literals)
- Test: `tests/tasks/actions.test.ts`

**Interfaces:**
- Consumes: `currentUser` (`@/lib/cms/authz`), `audit` (`@/lib/cms/audit`), `* as store` (`@/lib/tasks/store`), `TaskError`.
- Produces: `createTaskAction`, `updateTaskAction`, `moveTaskAction`, `claimTaskAction`, `deleteTaskAction`, `createInitiativeAction`, `updateInitiativeAction`, `archiveInitiativeAction`. All return `{ ok: true; value } | { ok: false; error }`.

- [ ] **Step 1: Edit `lib/cms/audit.ts`** — extend the `AuditAction` union (append before `"marketing_snapshot_create"` or at the end of the union):

```ts
  | "task_create"
  | "task_update"
  | "task_move"
  | "task_claim"
  | "task_delete"
  | "initiative_create"
  | "initiative_update"
  | "initiative_archive"
```

- [ ] **Step 2: Write the failing test** — `tests/tasks/actions.test.ts`

```ts
import { it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }))
vi.mock("@/lib/tasks/store", () => ({
  createTask: vi.fn(), createInitiativeWithSeed: vi.fn(), moveTask: vi.fn(),
  TaskError: class extends Error {},
}))

import { createTaskAction, createInitiativeAction, moveTaskAction } from "@/actions/tasks/board"
import { currentUser } from "@/lib/cms/authz"
import { createTask, createInitiativeWithSeed } from "@/lib/tasks/store"

beforeEach(() => vi.clearAllMocks())

it("denies a user without tasks.edit", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.view"] } as never)
  const r = await createTaskAction({ title: "x" })
  expect(r).toEqual({ ok: false, error: "unauthorized" })
  expect(createTask).not.toHaveBeenCalled()
})

it("creates a task stamped with the current user id", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  vi.mocked(createTask).mockResolvedValue({ id: "t1" } as never)
  const r = await createTaskAction({ title: "Audit", initiativeId: "i1" })
  expect(r).toEqual({ ok: true, value: { id: "t1" } })
  expect(createTask).toHaveBeenCalledWith(expect.objectContaining({ title: "Audit", initiativeId: "i1", createdById: "u1" }))
})

it("splits the seed textarea into titles", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  vi.mocked(createInitiativeWithSeed).mockResolvedValue({ id: "i9" } as never)
  await createInitiativeAction({ name: "frUSD", seedText: "Deploy\nAudit" })
  expect(createInitiativeWithSeed).toHaveBeenCalledWith(expect.objectContaining({ name: "frUSD", seedTitles: ["Deploy", "Audit"], createdById: "u1" }))
})

it("rejects an invalid status on move", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  const r = await moveTaskAction("t1", "BOGUS" as never)
  expect(r).toEqual({ ok: false, error: "Invalid status" })
})
```

- [ ] **Step 3: Run test to verify it fails**

Run: `npx vitest run tests/tasks/actions.test.ts`
Expected: FAIL ("Cannot find module '@/actions/tasks/board'").

- [ ] **Step 4: Create `actions/tasks/board.ts`**

```ts
"use server"

import { z } from "zod"
import { revalidatePath } from "next/cache"
import { headers } from "next/headers"
import { currentUser, type CmsUser } from "@/lib/cms/authz"
import { audit } from "@/lib/cms/audit"
import * as store from "@/lib/tasks/store"
import { TaskError } from "@/lib/tasks/store"
import type { TaskView, InitiativeView } from "@/lib/tasks/types"

const BOARD = "/admin/board"
const INITIATIVES = "/admin/board/initiatives"

type Result<T> = { ok: true; value: T } | { ok: false; error: string }
type Gate = { ok: true; me: CmsUser } | { ok: false; error: "unauthorized" }

async function ip(): Promise<string | null> {
  const h = await headers()
  return h.get("x-forwarded-for")?.split(",")[0]?.trim() || h.get("x-real-ip") || null
}

async function gate(priv: "tasks.view" | "tasks.edit"): Promise<Gate> {
  const me = await currentUser()
  if (!me || !me.privileges.includes(priv)) return { ok: false, error: "unauthorized" }
  return { ok: true, me }
}

const PriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH"])
const StatusEnum = z.enum(["TODO", "IN_PROGRESS", "DONE"])

const CreateTaskSchema = z.object({
  title: z.string().min(1, "A title is required"),
  description: z.string().optional(),
  priority: PriorityEnum.optional(),
  labels: z.array(z.string()).optional(),
  initiativeId: z.string().nullable().optional(),
})
export type CreateTaskInput = z.input<typeof CreateTaskSchema>

export async function createTaskAction(input: CreateTaskInput): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = CreateTaskSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.createTask({ ...parsed.data, createdById: g.me.id })
    await audit("task_create", { actorId: g.me.id, target: value.id, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

const UpdateTaskSchema = z.object({
  title: z.string().optional(),
  description: z.string().optional(),
  priority: PriorityEnum.optional(),
  labels: z.array(z.string()).optional(),
  initiativeId: z.string().nullable().optional(),
})
export type UpdateTaskInput = z.input<typeof UpdateTaskSchema>

export async function updateTaskAction(id: string, patch: UpdateTaskInput): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = UpdateTaskSchema.safeParse(patch)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.updateTask(id, parsed.data)
    await audit("task_update", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

export async function moveTaskAction(id: string, status: z.infer<typeof StatusEnum>): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = StatusEnum.safeParse(status)
  if (!parsed.success) return { ok: false, error: "Invalid status" }
  const value = await store.moveTask(id, parsed.data)
  await audit("task_move", { actorId: g.me.id, target: id, details: { status: parsed.data }, ip: await ip() })
  revalidatePath(BOARD)
  return { ok: true, value }
}

export async function claimTaskAction(id: string): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const value = await store.claimTask(id, g.me.id)
  await audit("task_claim", { actorId: g.me.id, target: id, ip: await ip() })
  revalidatePath(BOARD)
  return { ok: true, value }
}

export async function deleteTaskAction(id: string): Promise<Result<null>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  await store.deleteTask(id)
  await audit("task_delete", { actorId: g.me.id, target: id, ip: await ip() })
  revalidatePath(BOARD)
  return { ok: true, value: null }
}

const CreateInitiativeSchema = z.object({
  name: z.string().min(1, "An initiative name is required"),
  goal: z.string().optional(),
  color: z.string().optional(),
  seedText: z.string().optional(),
})
export type CreateInitiativeInput = z.input<typeof CreateInitiativeSchema>

export async function createInitiativeAction(input: CreateInitiativeInput): Promise<Result<InitiativeView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = CreateInitiativeSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const seedTitles = (parsed.data.seedText ?? "").split("\n")
    const value = await store.createInitiativeWithSeed({
      name: parsed.data.name, goal: parsed.data.goal, color: parsed.data.color,
      seedTitles, createdById: g.me.id,
    })
    await audit("initiative_create", { actorId: g.me.id, target: value.id, ip: await ip() })
    revalidatePath(INITIATIVES)
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

const UpdateInitiativeSchema = z.object({
  name: z.string().optional(),
  goal: z.string().optional(),
  color: z.string().optional(),
})
export type UpdateInitiativeInput = z.input<typeof UpdateInitiativeSchema>

export async function updateInitiativeAction(id: string, patch: UpdateInitiativeInput): Promise<Result<InitiativeView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = UpdateInitiativeSchema.safeParse(patch)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const value = await store.updateInitiative(id, parsed.data)
    await audit("initiative_update", { actorId: g.me.id, target: id, ip: await ip() })
    revalidatePath(INITIATIVES)
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

export async function archiveInitiativeAction(id: string): Promise<Result<null>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  await store.archiveInitiative(id)
  await audit("initiative_archive", { actorId: g.me.id, target: id, ip: await ip() })
  revalidatePath(INITIATIVES)
  revalidatePath(BOARD)
  return { ok: true, value: null }
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/tasks/actions.test.ts`
Expected: PASS.

- [ ] **Step 6: Commit**

```bash
git add actions/tasks/board.ts lib/cms/audit.ts tests/tasks/actions.test.ts
git commit -m "feat(board): gated server actions for tasks + initiatives"
```

---

### Task 6: Board UI + route

**Files:**
- Create: `components/cms/board/BoardClient.tsx`
- Create: `components/cms/board/TaskCard.tsx`
- Create: `components/cms/board/TaskRow.tsx`
- Create: `components/cms/board/BoardFilters.tsx`
- Create: `app/admin/board/page.tsx`
- Test: `tests/tasks/board-client.test.tsx`

**Interfaces:**
- Consumes: types/`buildBoard`/`distinctLabels` from `@/lib/tasks/*`; actions from `@/actions/tasks/board`.
- Produces: `<BoardClient tasks initiatives meId canEdit />`; page `/admin/board` (RSC, gated `tasks.view`, `force-dynamic`).

- [ ] **Step 1: Write the failing test** — `tests/tasks/board-client.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/tasks/board", () => ({
  createTaskAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "t9" } }),
  claimTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  moveTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  deleteTaskAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
}))

import { BoardClient } from "@/components/cms/board/BoardClient"
import type { TaskView, InitiativeView } from "@/lib/tasks/types"

const init: InitiativeView = { id: "i1", name: "frUSD deployment", goal: "ship", color: "#1D9E75", archived: false, createdAt: new Date(), updatedAt: new Date() }
const task = (over: Partial<TaskView>): TaskView => ({
  id: "t1", title: "Audit mint path", description: "", status: "TODO", priority: "HIGH",
  labels: ["subfrost-app"], owner: null, initiativeId: "i1", position: 0,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => cleanup())

it("renders tasks and the initiative chip", () => {
  const { getByText } = render(<BoardClient tasks={[task({})]} initiatives={[init]} meId="u1" canEdit />)
  expect(getByText("Audit mint path")).toBeTruthy()
  expect(getByText("frUSD deployment")).toBeTruthy()
})

it("quick-add submits createTaskAction with the active initiative", async () => {
  const { getByPlaceholderText } = render(<BoardClient tasks={[]} initiatives={[init]} meId="u1" canEdit />)
  const input = getByPlaceholderText(/Quick add/i)
  fireEvent.change(input, { target: { value: "New task" } })
  fireEvent.keyDown(input, { key: "Enter" })
  const { createTaskAction } = await import("@/actions/tasks/board")
  expect(createTaskAction).toHaveBeenCalled()
})

it("toggles to the list view (Priority header appears)", () => {
  const { getByText } = render(<BoardClient tasks={[task({})]} initiatives={[init]} meId="u1" canEdit />)
  fireEvent.click(getByText("List"))
  expect(getByText("Priority")).toBeTruthy()
})

it("assign-to-me calls claimTaskAction", async () => {
  const { getByText } = render(<BoardClient tasks={[task({ owner: null })]} initiatives={[init]} meId="u1" canEdit />)
  fireEvent.click(getByText(/Assign to me/i))
  const { claimTaskAction } = await import("@/actions/tasks/board")
  expect(claimTaskAction).toHaveBeenCalledWith("t1")
})

it("filtering by an initiative hides non-matching tasks", () => {
  const tasks = [task({ id: "a", title: "In frUSD", initiativeId: "i1" }), task({ id: "b", title: "No initiative", initiativeId: null })]
  const { getByText, queryByText } = render(<BoardClient tasks={tasks} initiatives={[init]} meId="u1" canEdit />)
  fireEvent.click(getByText("frUSD deployment"))
  expect(queryByText("No initiative")).toBeNull()
  expect(getByText("In frUSD")).toBeTruthy()
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tasks/board-client.test.tsx`
Expected: FAIL ("Cannot find module '@/components/cms/board/BoardClient'").

- [ ] **Step 3: Create `components/cms/board/BoardFilters.tsx`**

```tsx
"use client"

import type { BoardFilter, InitiativeView } from "@/lib/tasks/types"

export function BoardFilters({ filter, setFilter, initiatives, labels, meId }: {
  filter: BoardFilter
  setFilter: (f: BoardFilter) => void
  initiatives: InitiativeView[]
  labels: string[]
  meId: string
}) {
  const pill = (active: boolean) =>
    `rounded-full border px-3 py-1 text-xs ${active ? "border-sky-500/50 bg-sky-500/15 text-sky-300" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`
  return (
    <div className="flex flex-wrap items-center gap-2">
      <span className="text-xs text-zinc-500">Initiative:</span>
      <button className={pill(filter.initiativeId == null)} onClick={() => setFilter({ ...filter, initiativeId: null })}>All</button>
      {initiatives.map((i) => (
        <button key={i.id} className={pill(filter.initiativeId === i.id)} onClick={() => setFilter({ ...filter, initiativeId: i.id })}>
          <span className="mr-1 inline-block h-2 w-2 rounded-full align-middle" style={{ background: i.color }} />
          {i.name}
        </button>
      ))}
      <span className="mx-1 h-4 w-px bg-zinc-700" />
      <button className={pill(!!filter.ownerId)} onClick={() => setFilter({ ...filter, ownerId: filter.ownerId ? undefined : meId })}>My tasks</button>
      {labels.length > 0 && (
        <select
          aria-label="Label"
          value={filter.label ?? ""}
          onChange={(e) => setFilter({ ...filter, label: e.target.value || undefined })}
          className="rounded-md border border-zinc-700 bg-zinc-900 px-2 py-1 text-xs text-zinc-300 focus:outline-none"
        >
          <option value="">All labels</option>
          {labels.map((l) => <option key={l} value={l}>{l}</option>)}
        </select>
      )}
    </div>
  )
}
```

- [ ] **Step 4: Create `components/cms/board/TaskCard.tsx`**

```tsx
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
          <span className="inline-flex items-center gap-1 text-[11px]" style={{ color: initiative.color }}>
            <span className="h-2 w-2 rounded-full" style={{ background: initiative.color }} />
            {initiative.name}
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
```

- [ ] **Step 5: Create `components/cms/board/TaskRow.tsx`**

```tsx
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
```

- [ ] **Step 6: Create `components/cms/board/BoardClient.tsx`**

```tsx
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
```

- [ ] **Step 7: Create `app/admin/board/page.tsx`**

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listTasks, listInitiatives } from "@/lib/tasks/store"
import { BoardClient } from "@/components/cms/board/BoardClient"

export const dynamic = "force-dynamic"

export default async function BoardPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("tasks.view")) redirect("/admin")

  const [tasks, initiatives] = await Promise.all([listTasks(), listInitiatives()])
  return (
    <BoardClient
      tasks={tasks}
      initiatives={initiatives.filter((i) => !i.archived)}
      meId={me.id}
      canEdit={me.privileges.includes("tasks.edit")}
    />
  )
}
```

- [ ] **Step 8: Run test to verify it passes**

Run: `npx vitest run tests/tasks/board-client.test.tsx`
Expected: PASS (all 5).

- [ ] **Step 9: Commit**

```bash
git add components/cms/board/BoardClient.tsx components/cms/board/TaskCard.tsx components/cms/board/TaskRow.tsx components/cms/board/BoardFilters.tsx app/admin/board/page.tsx tests/tasks/board-client.test.tsx
git commit -m "feat(board): board+list client, cards, filters, and /admin/board route"
```

---

### Task 7: Initiatives UI + route

**Files:**
- Create: `components/cms/board/InitiativesClient.tsx`
- Create: `app/admin/board/initiatives/page.tsx`
- Test: `tests/tasks/initiatives-client.test.tsx`

**Interfaces:**
- Consumes: `initiativeProgress` (`@/lib/tasks/board`); `createInitiativeAction`, `archiveInitiativeAction` (`@/actions/tasks/board`).
- Produces: `<InitiativesClient initiatives tasks canEdit />`; page `/admin/board/initiatives` (RSC, gated `tasks.view`, `force-dynamic`).

- [ ] **Step 1: Write the failing test** — `tests/tasks/initiatives-client.test.tsx`

```tsx
import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/tasks/board", () => ({
  createInitiativeAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "i9" } }),
  archiveInitiativeAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
}))

import { InitiativesClient } from "@/components/cms/board/InitiativesClient"
import type { InitiativeView, TaskView } from "@/lib/tasks/types"

const init: InitiativeView = { id: "i1", name: "frUSD deployment", goal: "ship it", color: "#1D9E75", archived: false, createdAt: new Date(), updatedAt: new Date() }
const task = (over: Partial<TaskView>): TaskView => ({
  id: "t", title: "t", description: "", status: "TODO", priority: "MEDIUM",
  labels: [], owner: null, initiativeId: "i1", position: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => cleanup())

it("shows initiative progress (done/total)", () => {
  const { getByText } = render(<InitiativesClient initiatives={[init]} tasks={[task({ status: "DONE" }), task({ status: "TODO" })]} canEdit />)
  expect(getByText("frUSD deployment")).toBeTruthy()
  expect(getByText(/1 \/ 2 done/)).toBeTruthy()
})

it("opens the form, counts seed lines, and submits seedText", async () => {
  const { getByText, getByLabelText } = render(<InitiativesClient initiatives={[]} tasks={[]} canEdit />)
  fireEvent.click(getByText("New initiative"))
  fireEvent.change(getByLabelText("Name"), { target: { value: "frUSD" } })
  fireEvent.change(getByLabelText("Seed tasks"), { target: { value: "Deploy\nAudit" } })
  expect(getByText(/2 tasks will be created/)).toBeTruthy()
  fireEvent.click(getByText("Create + seed"))
  const { createInitiativeAction } = await import("@/actions/tasks/board")
  expect(createInitiativeAction).toHaveBeenCalledWith(expect.objectContaining({ name: "frUSD", seedText: "Deploy\nAudit" }))
})
```

- [ ] **Step 2: Run test to verify it fails**

Run: `npx vitest run tests/tasks/initiatives-client.test.tsx`
Expected: FAIL ("Cannot find module '@/components/cms/board/InitiativesClient'").

- [ ] **Step 3: Create `components/cms/board/InitiativesClient.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Target, Archive } from "lucide-react"
import type { InitiativeView, TaskView } from "@/lib/tasks/types"
import { initiativeProgress } from "@/lib/tasks/board"
import { createInitiativeAction, archiveInitiativeAction } from "@/actions/tasks/board"

export function InitiativesClient({ initiatives, tasks, canEdit }: {
  initiatives: InitiativeView[]
  tasks: TaskView[]
  canEdit: boolean
}) {
  const router = useRouter()
  const [open, setOpen] = useState(false)
  const [name, setName] = useState("")
  const [goal, setGoal] = useState("")
  const [color, setColor] = useState("#38bdf8")
  const [seedText, setSeedText] = useState("")
  const [busy, setBusy] = useState(false)
  const [error, setError] = useState<string | null>(null)

  const seedCount = seedText.split("\n").map((s) => s.trim()).filter(Boolean).length

  async function create() {
    if (busy) return
    setBusy(true)
    setError(null)
    const r = await createInitiativeAction({ name, goal, color, seedText })
    setBusy(false)
    if (!r.ok) { setError(r.error); return }
    setName(""); setGoal(""); setSeedText(""); setColor("#38bdf8"); setOpen(false)
    router.refresh()
  }

  const inputCls = "rounded-md border border-zinc-700 bg-zinc-900 px-3 py-2 text-sm text-zinc-100 placeholder:text-zinc-500 focus:border-sky-500 focus:outline-none"

  return (
    <div className="space-y-5">
      <div className="flex items-center justify-between">
        <h1 className="flex items-center gap-2 text-xl font-semibold text-white">
          <Target size={20} className="text-zinc-400" /> Initiatives
        </h1>
        {canEdit && (
          <button onClick={() => setOpen((v) => !v)} className="inline-flex items-center gap-1 rounded-md border border-zinc-700 px-3 py-1.5 text-sm text-zinc-200 hover:bg-zinc-800">
            <Plus size={16} /> New initiative
          </button>
        )}
      </div>

      {open && canEdit && (
        <div className="space-y-3 rounded-lg border border-zinc-800 bg-zinc-900/40 p-4">
          <div className="flex gap-2">
            <input value={name} onChange={(e) => setName(e.target.value)} placeholder="Initiative name (e.g. frUSD deployment)" aria-label="Name" className={`flex-1 ${inputCls}`} />
            <input value={color} onChange={(e) => setColor(e.target.value)} aria-label="Color" className={`w-28 ${inputCls}`} />
          </div>
          <input value={goal} onChange={(e) => setGoal(e.target.value)} placeholder="Goal / objective" aria-label="Goal" className={`w-full ${inputCls}`} />
          <div>
            <label className="mb-1 block text-xs text-zinc-500" htmlFor="seed">Seed tasks — one per line:</label>
            <textarea id="seed" value={seedText} onChange={(e) => setSeedText(e.target.value)} rows={4} aria-label="Seed tasks" placeholder={"Deploy frUSD contract\nAudit mint path"} className={`w-full font-mono ${inputCls}`} />
          </div>
          {error && <p className="text-xs text-rose-400">{error}</p>}
          <div className="flex items-center justify-between">
            <span className="text-xs text-zinc-500">{seedCount} task{seedCount === 1 ? "" : "s"} will be created</span>
            <button onClick={create} disabled={busy} className="rounded-md border border-sky-500/40 px-3 py-1.5 text-sm text-sky-300 hover:bg-sky-500/10 disabled:opacity-50">Create + seed</button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 gap-3 md:grid-cols-2">
        {initiatives.map((i) => {
          const p = initiativeProgress(i.id, tasks)
          return (
            <div key={i.id} className="rounded-lg border border-zinc-800 bg-zinc-900 p-4">
              <div className="mb-1 flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
                <span className="font-medium text-zinc-100">{i.name}</span>
                {canEdit && (
                  <button onClick={async () => { await archiveInitiativeAction(i.id); router.refresh() }} aria-label="Archive" className="ml-auto text-zinc-600 hover:text-zinc-400">
                    <Archive size={14} />
                  </button>
                )}
              </div>
              {i.goal && <p className="mb-3 text-xs text-zinc-400">{i.goal}</p>}
              <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: i.color }} />
              </div>
              <p className="mt-1.5 text-[11px] text-zinc-500">{p.done} / {p.total} done · {p.active} active</p>
            </div>
          )
        })}
        {initiatives.length === 0 && <p className="text-sm text-zinc-500">No initiatives yet.</p>}
      </div>
    </div>
  )
}
```

- [ ] **Step 4: Create `app/admin/board/initiatives/page.tsx`**

```tsx
import { redirect } from "next/navigation"
import { currentUser } from "@/lib/cms/authz"
import { listTasks, listInitiatives } from "@/lib/tasks/store"
import { InitiativesClient } from "@/components/cms/board/InitiativesClient"

export const dynamic = "force-dynamic"

export default async function InitiativesPage() {
  const me = await currentUser()
  if (!me) redirect("/admin/login")
  if (!me.privileges.includes("tasks.view")) redirect("/admin")

  const [tasks, initiatives] = await Promise.all([listTasks(), listInitiatives()])
  return (
    <InitiativesClient
      initiatives={initiatives.filter((i) => !i.archived)}
      tasks={tasks}
      canEdit={me.privileges.includes("tasks.edit")}
    />
  )
}
```

- [ ] **Step 5: Run test to verify it passes**

Run: `npx vitest run tests/tasks/initiatives-client.test.tsx`
Expected: PASS (both).

- [ ] **Step 6: Commit**

```bash
git add components/cms/board/InitiativesClient.tsx app/admin/board/initiatives/page.tsx tests/tasks/initiatives-client.test.tsx
git commit -m "feat(board): initiatives client (seeding + progress) and /admin/board/initiatives route"
```

---

### Task 8: Final verification (gates)

**Files:** none (verification only).

- [ ] **Step 1: Regenerate the Prisma client (idempotent)**

Run: `npx prisma generate`
Expected: success.

- [ ] **Step 2: Type-check**

Run: `npx tsc --noEmit`
Expected: 0 errors.

- [ ] **Step 3: Full test suite**

Run: `npx vitest run`
Expected: green (all task-board tests + no regression).

- [ ] **Step 4: Production build**

Run: `npm run build`
Expected: exit 0; routes `/admin/board` and `/admin/board/initiatives` compiled.

- [ ] **Step 5: Commit (only if any fix was needed)**

```bash
git add -A
git commit -m "chore(board): green gates (tsc, vitest, build)"
```

---

## Post-plan (human-owned, not executed here)

- Open PR `feat/admin-task-board` → review (subagent two-stage + final opus) → merge main.
- Deploy: bump `newTag` no `k8s/` (GitRepository/source antes do Kustomization) → Flux; init container roda `prisma db push` (cria `Task`/`Initiative`, aditivo).
- Conceder `tasks.edit` ao time (ADMINs já herdam). Verificar live: `/admin/board` 307 sem `tasks.view`; criar initiative semeia N tasks; quick-add/assign-to-me/mark-done.

## Self-Review (preenchido)

- **Spec coverage:** modelo (T4) · board.ts puro (T3) · store+seeding (T4) · actions gated (T5) · IAM/nav/icons (T1) · audit (T5) · Board⇄List + quick-add + assign + move/mark-done + filtros (T6) · initiatives + seeding + progresso (T7) · tema dark (T6/T7) · gates (T8). Sem lacunas.
- **Placeholder scan:** todos os steps têm código real; sem TBD/TODO.
- **Type consistency:** `TaskView`/`InitiativeView`/`BoardFilter` idênticos em types→board→store→actions→componentes; nomes de action (`createTaskAction`, `claimTaskAction`, `moveTaskAction`, `deleteTaskAction`, `createInitiativeAction`, `archiveInitiativeAction`) batem entre actions e componentes; metadata `TASK_STATUS`/`TASK_PRIORITY` e `STATUS_ORDER` consistentes; ícone `KanbanSquare` confirmado no lucide.
