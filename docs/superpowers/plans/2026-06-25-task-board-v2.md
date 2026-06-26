# Task board v2 (demandas do Gabe) — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Implementar os 8 pedidos do Gabe pro task board ao vivo: coluna Blocked + motivo do bloqueio, prioridade Fire em dropdown, remover botão Done, Self-assign + Assign, dropdown de initiative no card, Bulk Add, e um board kanban pras Initiatives (On Hold).

**Architecture:** Estende as peças existentes — enums Prisma, `lib/tasks/{types,store,board}.ts`, `actions/tasks/board.ts`, `components/cms/board/*`. Initiatives ganham um `status` próprio (`InitiativeStatus`). Sem drag-and-drop (move por dropdown). Aditivo, sem nova categoria IAM.

**Tech Stack:** Next.js (App Router, server components + server actions), Prisma + Postgres, Zod, React, Vitest + @testing-library/react (happy-dom), Tailwind (tema dark zinc do /admin), lucide-react.

## Global Constraints

- Migração ADITIVA, nunca destrutiva. Schema novo via init container `prisma db push` no boot; tasks/initiatives antigos mantêm status, `blockerReason=""`, initiatives → `TODO`.
- SEM nova categoria IAM. Páginas gated por `tasks.view` (`currentUser()`→`redirect("/admin/login")` sem user → `redirect("/admin")` sem `tasks.view`); mutations por `tasks.edit`. ADMIN herda.
- Padrão de action: `gate("tasks.edit")` → zod `safeParse` → `store.*` → `audit(...)` → `revalidatePath` → `{ ok: true, value } | { ok: false, error }`.
- `import prisma from "@/lib/prisma"` (default). Store test mock: `const client = vi.hoisted(() => ({...}))` + `vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))`.
- Ordem das colunas — Tasks: `STATUS_ORDER = ["TODO","BLOCKED","IN_PROGRESS","DONE"]`. Initiatives: `INITIATIVE_STATUS_ORDER = ["TODO","ON_HOLD","IN_PROGRESS","DONE"]`.
- Tema dark /admin: zinc-950/900, border-zinc-800/700, text-zinc-100/300/400/500, sky-400/300, rose-300/400 (blocked), emerald-300 (done), orange-300 (fire).
- `prisma generate` SEMPRE após mexer no `schema.prisma`, ANTES do tsc.
- Gates: `npx tsc --noEmit` 0 / `npx vitest run` verde / `npm run build` 0.
- `git add` SÓ os arquivos da task (NUNCA `.claude/`/`.npmrc`/`.superpowers/`). Cada commit termina com `Co-Authored-By: Claude Opus 4.8 <noreply@anthropic.com>`.
- Tipos-chave: `OwnerView = { id: string; name: string | null; email: string }`; `MemberView = OwnerView`. `TaskStatus = "TODO"|"BLOCKED"|"IN_PROGRESS"|"DONE"`. `TaskPriority = "LOW"|"MEDIUM"|"HIGH"|"FIRE"`. `InitiativeStatus = "TODO"|"IN_PROGRESS"|"ON_HOLD"|"DONE"`.

---

### Task 1: Schema — enums + campos

**Files:**
- Modify: `prisma/schema.prisma` (enums `TaskStatus`/`TaskPriority` ~L1160-1170; `model Initiative` ~L1172; `model Task` ~L1186)

**Interfaces:**
- Produces: `TaskStatus.BLOCKED`, `TaskPriority.FIRE`, `Task.blockerReason`, `enum InitiativeStatus`, `Initiative.status`.

- [ ] **Step 1: Editar os enums e modelos**

Em `prisma/schema.prisma`, trocar o enum `TaskStatus` por:

```prisma
enum TaskStatus {
  TODO
  BLOCKED
  IN_PROGRESS
  DONE
}
```

Trocar `TaskPriority` por:

```prisma
enum TaskPriority {
  LOW
  MEDIUM
  HIGH
  FIRE
}
```

Adicionar o enum novo logo após `TaskPriority`:

```prisma
enum InitiativeStatus {
  TODO
  IN_PROGRESS
  ON_HOLD
  DONE
}
```

No `model Initiative`, adicionar (depois da linha `archived    Boolean  @default(false)`):

```prisma
  status      InitiativeStatus @default(TODO)
```

No `model Task`, adicionar (depois da linha `labels       String[]     @default([])`):

```prisma
  blockerReason String      @default("")
```

- [ ] **Step 2: Validar + gerar**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx prisma validate && npx prisma generate`
Expected: `The schema at prisma/schema.prisma is valid` + `Generated Prisma Client`.

- [ ] **Step 3: Commit**

```bash
git add prisma/schema.prisma
git commit -m "feat(schema): task Blocked status, Fire priority, blockerReason, initiative status"
```

---

### Task 2: Tipos + mappers + fixtures (fundação TS)

**Files:**
- Modify: `lib/tasks/types.ts`
- Modify: `lib/tasks/store.ts` (`TaskRow`/`mapTask`; `InitiativeRow`/`mapInitiative`)
- Modify: `tests/tasks/types.test.ts`, `tests/tasks/board.test.ts`, `tests/tasks/board-client.test.tsx`, `tests/tasks/initiatives-client.test.tsx` (atualizar fixtures/asserções que quebram com os campos novos)

**Interfaces:**
- Produces: `TaskStatus`/`TaskPriority`/`InitiativeStatus` unions; `STATUS_ORDER` (4); `PRIORITY_ORDER`; `INITIATIVE_STATUS_ORDER`; `TASK_STATUS` (com BLOCKED + "In Progress"); `TASK_PRIORITY` (com FIRE); `INITIATIVE_STATUS`; `TaskView.blockerReason: string`; `InitiativeView.status: InitiativeStatus`; `MemberView`; `InitiativeBoardColumn`/`InitiativeBoardData`. `mapTask`/`mapInitiative` populam os campos novos.

- [ ] **Step 1: Reescrever `lib/tasks/types.ts`**

Substituir o conteúdo inteiro de `lib/tasks/types.ts` por:

```ts
export type TaskStatus = "TODO" | "BLOCKED" | "IN_PROGRESS" | "DONE"
export type TaskPriority = "LOW" | "MEDIUM" | "HIGH" | "FIRE"
export type InitiativeStatus = "TODO" | "IN_PROGRESS" | "ON_HOLD" | "DONE"

export interface OwnerView {
  id: string
  name: string | null
  email: string
}

export type MemberView = OwnerView

export interface TaskView {
  id: string
  title: string
  description: string
  status: TaskStatus
  priority: TaskPriority
  labels: string[]
  blockerReason: string
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
  status: InitiativeStatus
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
  columns: BoardColumn[] // always [TODO, BLOCKED, IN_PROGRESS, DONE]
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

export const STATUS_ORDER: TaskStatus[] = ["TODO", "BLOCKED", "IN_PROGRESS", "DONE"]
export const PRIORITY_ORDER: TaskPriority[] = ["LOW", "MEDIUM", "HIGH", "FIRE"]
export const INITIATIVE_STATUS_ORDER: InitiativeStatus[] = ["TODO", "ON_HOLD", "IN_PROGRESS", "DONE"]

export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  TODO: { label: "To do", cls: "text-zinc-400", dot: "bg-zinc-500" },
  BLOCKED: { label: "Blocked", cls: "text-rose-300", dot: "bg-rose-400" },
  IN_PROGRESS: { label: "In Progress", cls: "text-sky-300", dot: "bg-sky-400" },
  DONE: { label: "Done", cls: "text-emerald-300", dot: "bg-emerald-400" },
}

export const TASK_PRIORITY: Record<TaskPriority, { label: string; rank: number; cls: string }> = {
  FIRE: { label: "Fire", rank: 3, cls: "bg-orange-500/15 text-orange-300" },
  HIGH: { label: "High", rank: 2, cls: "bg-rose-500/15 text-rose-300" },
  MEDIUM: { label: "Med", rank: 1, cls: "bg-amber-500/15 text-amber-300" },
  LOW: { label: "Low", rank: 0, cls: "bg-zinc-500/15 text-zinc-400" },
}

export const INITIATIVE_STATUS: Record<InitiativeStatus, { label: string; cls: string; dot: string }> = {
  TODO: { label: "To do", cls: "text-zinc-400", dot: "bg-zinc-500" },
  ON_HOLD: { label: "On hold", cls: "text-amber-300", dot: "bg-amber-400" },
  IN_PROGRESS: { label: "In Progress", cls: "text-sky-300", dot: "bg-sky-400" },
  DONE: { label: "Done", cls: "text-emerald-300", dot: "bg-emerald-400" },
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

- [ ] **Step 2: Atualizar os mappers em `lib/tasks/store.ts`**

No `type TaskRow` (após `labels: string[];`), adicionar `blockerReason: string`. No `mapTask`, adicionar `blockerReason: r.blockerReason,` (ex.: após `labels: r.labels,`).

No `type InitiativeRow` (após `color: string;`), adicionar `status: string`. No `mapInitiative`, trocar o return por incluir o status:

```ts
function mapInitiative(r: InitiativeRow): InitiativeView {
  return { id: r.id, name: r.name, goal: r.goal, color: r.color, status: r.status as InitiativeStatus, archived: r.archived, createdAt: r.createdAt, updatedAt: r.updatedAt }
}
```

Adicionar `InitiativeStatus` ao import de tipos no topo de `store.ts`:

```ts
import type { TaskView, InitiativeView, TaskStatus, TaskPriority, InitiativeStatus } from "./types"
```

- [ ] **Step 3: Atualizar os testes que quebram (fixtures + asserções)**

`tests/tasks/types.test.ts` — substituir o 1º `it` e o 2º por:

```ts
it("has metadata for every status and an explicit column order", () => {
  expect(STATUS_ORDER).toEqual(["TODO", "BLOCKED", "IN_PROGRESS", "DONE"])
  expect(TASK_STATUS.TODO.label).toBe("To do")
  expect(TASK_STATUS.BLOCKED.label).toBe("Blocked")
  expect(TASK_STATUS.IN_PROGRESS.label).toBe("In Progress")
  expect(TASK_STATUS.DONE.label).toBe("Done")
})

it("ranks priorities FIRE > HIGH > MEDIUM > LOW", () => {
  expect(TASK_PRIORITY.FIRE.rank).toBeGreaterThan(TASK_PRIORITY.HIGH.rank)
  expect(TASK_PRIORITY.HIGH.rank).toBeGreaterThan(TASK_PRIORITY.MEDIUM.rank)
  expect(TASK_PRIORITY.MEDIUM.rank).toBeGreaterThan(TASK_PRIORITY.LOW.rank)
})

it("mirrors the task columns for initiatives with On hold", () => {
  expect(INITIATIVE_STATUS_ORDER).toEqual(["TODO", "ON_HOLD", "IN_PROGRESS", "DONE"])
  expect(INITIATIVE_STATUS.ON_HOLD.label).toBe("On hold")
})
```

E atualizar o import dele para:

```ts
import { TASK_STATUS, TASK_PRIORITY, STATUS_ORDER, INITIATIVE_STATUS, INITIATIVE_STATUS_ORDER, ownerInitials, ownerName } from "@/lib/tasks/types"
```

`tests/tasks/board.test.ts` — no factory `t`, adicionar `blockerReason: "",` (ex.: após `labels: [],`). No 1º `it` ("groups tasks…"), trocar as asserções de coluna por:

```ts
it("groups tasks into the four ordered columns", () => {
  const b = buildBoard([t({ id: "a", status: "TODO" }), t({ id: "b", status: "DONE" })])
  expect(b.columns.map((c) => c.status)).toEqual(["TODO", "BLOCKED", "IN_PROGRESS", "DONE"])
  expect(b.columns[0].count).toBe(1)
  expect(b.columns[3].count).toBe(1)
  expect(b.total).toBe(2)
})
```

`tests/tasks/board-client.test.tsx` — no `init` literal, adicionar `status: "TODO",`. No factory `task`, adicionar `blockerReason: "",`.

`tests/tasks/initiatives-client.test.tsx` — no `init` literal, adicionar `status: "TODO",`. No factory `task`, adicionar `blockerReason: "",`.

(NÃO mexer no comportamento dos componentes nesta task — só os fixtures, pra o tsc passar. Os renders de `BoardClient`/`InitiativesClient` continuam sem `members` por enquanto; as props novas entram nas Tasks 6/7.)

- [ ] **Step 4: Rodar gates**

Run: `npx prisma generate && npx vitest run tests/tasks && npx tsc --noEmit`
Expected: suíte tasks verde; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/types.ts lib/tasks/store.ts tests/tasks/types.test.ts tests/tasks/board.test.ts tests/tasks/board-client.test.tsx tests/tasks/initiatives-client.test.tsx
git commit -m "feat(tasks): types for Blocked/Fire/initiative status + blockerReason mappers"
```

---

### Task 3: Lógica de board (`lib/tasks/board.ts`)

**Files:**
- Modify: `lib/tasks/board.ts`
- Test: `tests/tasks/board.test.ts` (adicionar testes; NÃO alterar os existentes desta task)

**Interfaces:**
- Consumes: `INITIATIVE_STATUS_ORDER`, `INITIATIVE_STATUS`, `InitiativeBoardData` (Task 2).
- Produces: `buildInitiativeBoard(initiatives: InitiativeView[]): InitiativeBoardData`; `selectableInitiatives(initiatives: InitiativeView[]): InitiativeView[]` (status TODO/IN_PROGRESS, não-arquivadas). `buildBoard` já produz 4 colunas via `STATUS_ORDER`.

- [ ] **Step 1: Write the failing tests (board.test.ts)**

No TOPO de `tests/tasks/board.test.ts`, estender os imports existentes (ES imports só no topo): adicionar `buildInitiativeBoard, selectableInitiatives` ao `import { ... } from "@/lib/tasks/board"` e `InitiativeView` ao `import type { ... } from "@/lib/tasks/types"`. Depois adicionar ao FIM do arquivo o factory + os dois testes:

```ts
const init = (over: Partial<InitiativeView>): InitiativeView => ({
  id: "i", name: "n", goal: "", color: "#38bdf8", status: "TODO", archived: false,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

it("groups initiatives into the four mirrored columns", () => {
  const b = buildInitiativeBoard([init({ id: "a", status: "TODO" }), init({ id: "b", status: "ON_HOLD" }), init({ id: "c", status: "DONE" })])
  expect(b.columns.map((c) => c.status)).toEqual(["TODO", "ON_HOLD", "IN_PROGRESS", "DONE"])
  expect(b.columns[0].count).toBe(1)
  expect(b.columns[1].count).toBe(1)
  expect(b.columns[3].count).toBe(1)
})

it("offers only To do / In progress (non-archived) initiatives as selectable", () => {
  const list = [
    init({ id: "a", status: "TODO" }),
    init({ id: "b", status: "IN_PROGRESS" }),
    init({ id: "c", status: "ON_HOLD" }),
    init({ id: "d", status: "DONE" }),
    init({ id: "e", status: "TODO", archived: true }),
  ]
  expect(selectableInitiatives(list).map((i) => i.id)).toEqual(["a", "b"])
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/tasks/board.test.ts`
Expected: FAIL — `buildInitiativeBoard`/`selectableInitiatives` não existem.

- [ ] **Step 3: Implementar em `lib/tasks/board.ts`**

Adicionar ao import do topo `INITIATIVE_STATUS_ORDER, INITIATIVE_STATUS` e os tipos `InitiativeView, InitiativeBoardData`:

```ts
import type { TaskView, BoardFilter, BoardData, BoardColumn, InitiativeProgress, InitiativeView, InitiativeBoardData } from "./types"
import { STATUS_ORDER, TASK_STATUS, TASK_PRIORITY, INITIATIVE_STATUS_ORDER, INITIATIVE_STATUS } from "./types"
```

Adicionar ao fim do arquivo:

```ts
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
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tasks/board.test.ts`
Expected: PASS (todos).

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/board.ts tests/tasks/board.test.ts
git commit -m "feat(tasks): buildInitiativeBoard + selectableInitiatives"
```

---

### Task 4: Funções de store

**Files:**
- Modify: `lib/tasks/store.ts`
- Test: `tests/tasks/store.test.ts`

**Interfaces:**
- Consumes: `prisma`, `MemberView`, `InitiativeStatus`, `TaskError`.
- Produces: `assignTask(id, ownerId: string | null)` (valida user ativo); `listAssignableUsers(): Promise<MemberView[]>`; `bulkCreateTasks({ initiativeId, titles, createdById? }): Promise<number>`; `moveInitiative(id, status): Promise<InitiativeView>`; `updateTask` aceita `blockerReason`.

- [ ] **Step 1: Write the failing tests (append em store.test.ts)**

No topo de `tests/tasks/store.test.ts`, estender o `client` hoisted e o import:

```ts
const client = vi.hoisted(() => ({
  task: { findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  initiative: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
}))
```

```ts
import { createTask, createInitiativeWithSeed, moveTask, claimTask, assignTask, listAssignableUsers, bulkCreateTasks, moveInitiative, updateTask, TaskError } from "@/lib/tasks/store"
```

Adicionar ao fim do arquivo:

```ts
it("assignTask rejects an unknown or inactive user", async () => {
  client.user.findUnique.mockResolvedValue(null)
  await expect(assignTask("t1", "ghost")).rejects.toBeInstanceOf(TaskError)
  client.user.findUnique.mockResolvedValue({ id: "u9", active: false })
  await expect(assignTask("t1", "u9")).rejects.toBeInstanceOf(TaskError)
})

it("assignTask sets the owner for a valid user and clears it for null", async () => {
  client.user.findUnique.mockResolvedValue({ id: "u9", active: true })
  client.task.update.mockResolvedValue({
    id: "t1", title: "x", description: "", status: "TODO", priority: "LOW",
    labels: [], blockerReason: "", initiativeId: null, position: 0, owner, createdAt: new Date(), updatedAt: new Date(),
  })
  await assignTask("t1", "u9")
  expect(client.task.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t1" }, data: { ownerId: "u9" } }))
  await assignTask("t1", null)
  expect(client.task.update).toHaveBeenLastCalledWith(expect.objectContaining({ data: { ownerId: null } }))
})

it("listAssignableUsers returns active users", async () => {
  client.user.findMany.mockResolvedValue([{ id: "u1", name: "Vitor", email: "v@x.io" }])
  const r = await listAssignableUsers()
  expect(r).toEqual([{ id: "u1", name: "Vitor", email: "v@x.io" }])
  expect(client.user.findMany).toHaveBeenCalledWith(expect.objectContaining({ where: { active: true } }))
})

it("bulkCreateTasks creates one task per non-empty line under the initiative", async () => {
  client.task.createMany.mockResolvedValue({ count: 2 })
  const n = await bulkCreateTasks({ initiativeId: "i1", titles: ["Deploy", "  ", "Audit"], createdById: "u1" })
  expect(n).toBe(2)
  const arg = client.task.createMany.mock.calls[0][0]
  expect(arg.data.map((d: { title: string }) => d.title)).toEqual(["Deploy", "Audit"])
  expect(arg.data.every((d: { initiativeId: string }) => d.initiativeId === "i1")).toBe(true)
})

it("bulkCreateTasks rejects when no titles remain", async () => {
  await expect(bulkCreateTasks({ initiativeId: "i1", titles: ["  "] })).rejects.toBeInstanceOf(TaskError)
})

it("moveInitiative updates the status", async () => {
  client.initiative.update.mockResolvedValue({ id: "i1", name: "n", goal: "", color: "#fff", status: "ON_HOLD", archived: false, createdAt: new Date(), updatedAt: new Date() })
  const v = await moveInitiative("i1", "ON_HOLD")
  expect(v.status).toBe("ON_HOLD")
  expect(client.initiative.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "i1" }, data: { status: "ON_HOLD" } }))
})

it("updateTask persists a trimmed blockerReason", async () => {
  client.task.update.mockResolvedValue({
    id: "t1", title: "x", description: "", status: "BLOCKED", priority: "LOW",
    labels: [], blockerReason: "waiting on flex", initiativeId: null, position: 0, owner: null, createdAt: new Date(), updatedAt: new Date(),
  })
  await updateTask("t1", { blockerReason: "  waiting on flex  " })
  expect(client.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ blockerReason: "waiting on flex" }) }))
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/tasks/store.test.ts`
Expected: FAIL — funções novas não existem / `blockerReason` não setado.

- [ ] **Step 3: Implementar em `lib/tasks/store.ts`**

No `interface UpdateTaskPatch`, adicionar `blockerReason?: string`. No `updateTask`, adicionar (ex.: após o bloco de `labels`):

```ts
  if (patch.blockerReason !== undefined) data.blockerReason = patch.blockerReason.trim()
```

Adicionar ao import de tipos `MemberView`:

```ts
import type { TaskView, InitiativeView, TaskStatus, TaskPriority, InitiativeStatus, MemberView } from "./types"
```

Adicionar as funções novas (ex.: após `claimTask`):

```ts
export async function assignTask(id: string, ownerId: string | null): Promise<TaskView> {
  if (ownerId) {
    const u = await prisma.user.findUnique({ where: { id: ownerId }, select: { id: true, active: true } })
    if (!u || !u.active) throw new TaskError("User not found")
  }
  const r = (await prisma.task.update({ where: { id }, data: { ownerId }, include: TASK_INCLUDE })) as TaskRow
  return mapTask(r)
}

export async function listAssignableUsers(): Promise<MemberView[]> {
  const rows = await prisma.user.findMany({ where: { active: true }, select: { id: true, name: true, email: true }, orderBy: { name: "asc" } })
  return rows.map((u) => ({ id: u.id, name: u.name, email: u.email }))
}

export async function bulkCreateTasks(input: { initiativeId: string; titles: string[]; createdById?: string | null }): Promise<number> {
  const titles = input.titles.map((t) => t.trim()).filter(Boolean)
  if (titles.length === 0) throw new TaskError("Add at least one task")
  const r = await prisma.task.createMany({
    data: titles.map((title) => ({ title, initiativeId: input.initiativeId, createdById: input.createdById || null })),
  })
  return r.count
}
```

Adicionar (ex.: após `archiveInitiative`):

```ts
export async function moveInitiative(id: string, status: InitiativeStatus): Promise<InitiativeView> {
  const r = (await prisma.initiative.update({ where: { id }, data: { status } })) as InitiativeRow
  return mapInitiative(r)
}
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tasks/store.test.ts && npx tsc --noEmit`
Expected: PASS; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add lib/tasks/store.ts tests/tasks/store.test.ts
git commit -m "feat(tasks): assignTask, listAssignableUsers, bulkCreateTasks, moveInitiative + blockerReason"
```

---

### Task 5: Actions + audit

**Files:**
- Modify: `actions/tasks/board.ts`
- Modify: `lib/cms/audit.ts` (união `AuditAction`, após `"initiative_archive"` ~L90)
- Test: `tests/tasks/actions.test.ts`

**Interfaces:**
- Consumes: `store.assignTask`/`bulkCreateTasks`/`moveInitiative` (Task 4).
- Produces: `assignTaskAction(id, ownerId: string | null)`; `bulkCreateTasksAction({ initiativeId, titles })`; `moveInitiativeAction(id, status)`; `StatusEnum`/`PriorityEnum` estendidos; `UpdateTaskSchema.blockerReason`. Audit: `task_assign`, `task_bulk_create`, `initiative_move`.

- [ ] **Step 1: Write the failing tests (estender actions.test.ts)**

No `vi.mock("@/lib/tasks/store", …)` do topo, adicionar as funções novas:

```ts
vi.mock("@/lib/tasks/store", () => ({
  createTask: vi.fn(), createInitiativeWithSeed: vi.fn(), moveTask: vi.fn(),
  assignTask: vi.fn(), bulkCreateTasks: vi.fn(), moveInitiative: vi.fn(),
  TaskError: class extends Error {},
}))
```

No TOPO do arquivo (ES imports só no topo), estender os dois imports existentes: adicionar `assignTaskAction, bulkCreateTasksAction, moveInitiativeAction` ao `import { ... } from "@/actions/tasks/board"` e `assignTask, bulkCreateTasks, moveInitiative` ao `import { ... } from "@/lib/tasks/store"`. Depois adicionar ao FIM do arquivo os testes:

```ts
it("assignTaskAction sets the owner via the store", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  vi.mocked(assignTask).mockResolvedValue({ id: "t1" } as never)
  const r = await assignTaskAction("t1", "u9")
  expect(r).toEqual({ ok: true, value: { id: "t1" } })
  expect(assignTask).toHaveBeenCalledWith("t1", "u9")
})

it("bulkCreateTasksAction requires an initiative", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  const r = await bulkCreateTasksAction({ initiativeId: "", titles: ["a"] })
  expect(r.ok).toBe(false)
  expect(bulkCreateTasks).not.toHaveBeenCalled()
})

it("bulkCreateTasksAction creates under the initiative and returns the count", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  vi.mocked(bulkCreateTasks).mockResolvedValue(2 as never)
  const r = await bulkCreateTasksAction({ initiativeId: "i1", titles: ["a", "b"] })
  expect(r).toEqual({ ok: true, value: { count: 2 } })
  expect(bulkCreateTasks).toHaveBeenCalledWith(expect.objectContaining({ initiativeId: "i1", titles: ["a", "b"], createdById: "u1" }))
})

it("moveInitiativeAction rejects an invalid status", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  const r = await moveInitiativeAction("i1", "BOGUS" as never)
  expect(r).toEqual({ ok: false, error: "Invalid status" })
  expect(moveInitiative).not.toHaveBeenCalled()
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/tasks/actions.test.ts`
Expected: FAIL — actions novas não existem.

- [ ] **Step 3a: Estender os enums + schema em `actions/tasks/board.ts`**

Trocar as duas linhas dos enums por:

```ts
const PriorityEnum = z.enum(["LOW", "MEDIUM", "HIGH", "FIRE"])
const StatusEnum = z.enum(["TODO", "BLOCKED", "IN_PROGRESS", "DONE"])
const InitiativeStatusEnum = z.enum(["TODO", "IN_PROGRESS", "ON_HOLD", "DONE"])
```

No `UpdateTaskSchema`, adicionar `blockerReason: z.string().optional(),`.

- [ ] **Step 3b: Adicionar as actions novas**

Adicionar `assignTaskAction` (ex.: após `claimTaskAction`):

```ts
export async function assignTaskAction(id: string, ownerId: string | null): Promise<Result<TaskView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  try {
    const value = await store.assignTask(id, ownerId)
    await audit("task_assign", { actorId: g.me.id, target: id, details: { ownerId }, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}

const BulkCreateSchema = z.object({
  initiativeId: z.string().min(1, "An initiative is required"),
  titles: z.array(z.string()),
})
export type BulkCreateInput = z.input<typeof BulkCreateSchema>

export async function bulkCreateTasksAction(input: BulkCreateInput): Promise<Result<{ count: number }>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = BulkCreateSchema.safeParse(input)
  if (!parsed.success) return { ok: false, error: parsed.error.issues[0]?.message ?? "Invalid input" }
  try {
    const count = await store.bulkCreateTasks({ initiativeId: parsed.data.initiativeId, titles: parsed.data.titles, createdById: g.me.id })
    await audit("task_bulk_create", { actorId: g.me.id, target: parsed.data.initiativeId, details: { count }, ip: await ip() })
    revalidatePath(BOARD)
    return { ok: true, value: { count } }
  } catch (e) {
    if (e instanceof TaskError) return { ok: false, error: e.message }
    throw e
  }
}
```

Adicionar `moveInitiativeAction` (ex.: após `archiveInitiativeAction`):

```ts
export async function moveInitiativeAction(id: string, status: z.infer<typeof InitiativeStatusEnum>): Promise<Result<InitiativeView>> {
  const g = await gate("tasks.edit")
  if (!g.ok) return g
  const parsed = InitiativeStatusEnum.safeParse(status)
  if (!parsed.success) return { ok: false, error: "Invalid status" }
  const value = await store.moveInitiative(id, parsed.data)
  await audit("initiative_move", { actorId: g.me.id, target: id, details: { status: parsed.data }, ip: await ip() })
  revalidatePath(INITIATIVES)
  revalidatePath(BOARD)
  return { ok: true, value }
}
```

- [ ] **Step 3c: Adicionar os literais de audit**

Em `lib/cms/audit.ts`, após `| "initiative_archive"`, adicionar:

```ts
  | "task_assign"
  | "task_bulk_create"
  | "initiative_move"
```

- [ ] **Step 4: Run to verify pass**

Run: `npx vitest run tests/tasks/actions.test.ts && npx tsc --noEmit`
Expected: PASS; tsc 0.

- [ ] **Step 5: Commit**

```bash
git add actions/tasks/board.ts lib/cms/audit.ts tests/tasks/actions.test.ts
git commit -m "feat(tasks): assign/bulk-create/move-initiative actions + audit literals"
```

---

### Task 6: Tasks board UI (TaskCard + BoardClient + page)

**Files:**
- Modify: `components/cms/board/TaskCard.tsx` (rewrite)
- Modify: `components/cms/board/BoardClient.tsx` (rewrite)
- Modify: `app/admin/board/page.tsx` (carregar members)
- Modify: `tests/tasks/board-client.test.tsx` (rewrite)

**Interfaces:**
- Consumes: `selectableInitiatives` (board.ts), `assignTaskAction`/`bulkCreateTasksAction`/`updateTaskAction`/`moveTaskAction`/`claimTaskAction`/`deleteTaskAction`/`createTaskAction`, `listAssignableUsers`, `MemberView`, `PRIORITY_ORDER`.
- Produces: `TaskCard` props `{ task, initiative, selectableInitiatives, members, canEdit }`; `BoardClient` props `{ tasks, initiatives, members, meId, canEdit }`.

- [ ] **Step 1: Write the failing test (rewrite board-client.test.tsx)**

Substituir `tests/tasks/board-client.test.tsx` inteiro por:

```tsx
import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent, act } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/tasks/board", () => ({
  createTaskAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "t9" } }),
  claimTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  moveTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  deleteTaskAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
  assignTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  updateTaskAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
  bulkCreateTasksAction: vi.fn().mockResolvedValue({ ok: true, value: { count: 2 } }),
}))

import { BoardClient } from "@/components/cms/board/BoardClient"
import type { TaskView, InitiativeView, MemberView } from "@/lib/tasks/types"

const init: InitiativeView = { id: "i1", name: "frUSD deployment", goal: "ship", color: "#1D9E75", status: "TODO", archived: false, createdAt: new Date(), updatedAt: new Date() }
const members: MemberView[] = [{ id: "u2", name: "Gabe", email: "g@x.io" }]
const task = (over: Partial<TaskView>): TaskView => ({
  id: "t1", title: "Audit mint path", description: "", status: "TODO", priority: "HIGH",
  labels: ["subfrost-app"], blockerReason: "", owner: null, initiativeId: "i1", position: 0,
  createdAt: new Date(), updatedAt: new Date(), ...over,
})

beforeEach(() => cleanup())

it("renders the four columns including Blocked", () => {
  const { getAllByText } = render(<BoardClient tasks={[task({})]} initiatives={[init]} members={members} meId="u1" canEdit />)
  // "Blocked"/"In Progress" appear as a column header AND as a status <option>, so match >= 1
  expect(getAllByText("Blocked").length).toBeGreaterThan(0)
  expect(getAllByText("In Progress").length).toBeGreaterThan(0)
})

it("self-assign calls claimTaskAction", async () => {
  const { getByText } = render(<BoardClient tasks={[task({ owner: null })]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.click(getByText(/Self-assign/i)) })
  const { claimTaskAction } = await import("@/actions/tasks/board")
  expect(claimTaskAction).toHaveBeenCalledWith("t1")
})

it("the Assign dropdown assigns the task to another member", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({ owner: null })]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getByLabelText("Assign"), { target: { value: "u2" } }) })
  const { assignTaskAction } = await import("@/actions/tasks/board")
  expect(assignTaskAction).toHaveBeenCalledWith("t1", "u2")
})

it("has no green Done button on the card", () => {
  const { queryByText } = render(<BoardClient tasks={[task({ status: "IN_PROGRESS" })]} initiatives={[init]} members={members} meId="u1" canEdit />)
  expect(queryByText("Done", { selector: "button" })).toBeNull()
})

it("shows the blocker input only for blocked tasks and saves it on blur", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({ status: "BLOCKED" })]} initiatives={[init]} members={members} meId="u1" canEdit />)
  const input = getByLabelText("Blocker reason")
  await act(async () => { fireEvent.change(input, { target: { value: "waiting on flex" } }); fireEvent.blur(input) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { blockerReason: "waiting on flex" })
})

it("changing the priority dropdown calls updateTaskAction", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({})]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getByLabelText("Priority"), { target: { value: "FIRE" } }) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { priority: "FIRE" })
})

it("the initiative dropdown reassigns the task initiative", async () => {
  const other: InitiativeView = { ...init, id: "i2", name: "Treasury", status: "IN_PROGRESS" }
  const { getAllByLabelText } = render(<BoardClient tasks={[task({})]} initiatives={[init, other]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.change(getAllByLabelText("Initiative")[0], { target: { value: "i2" } }) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { initiativeId: "i2" })
})

it("Bulk Add creates tasks under the chosen initiative", async () => {
  const { getByText, getByLabelText } = render(<BoardClient tasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  fireEvent.click(getByText("Bulk Add"))
  fireEvent.change(getByLabelText("Bulk initiative"), { target: { value: "i1" } })
  fireEvent.change(getByLabelText("Bulk tasks"), { target: { value: "Deploy\nAudit" } })
  await act(async () => { fireEvent.click(getByText("Add tasks")) })
  const { bulkCreateTasksAction } = await import("@/actions/tasks/board")
  expect(bulkCreateTasksAction).toHaveBeenCalledWith({ initiativeId: "i1", titles: ["Deploy", "Audit"] })
})
```

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/tasks/board-client.test.tsx`
Expected: FAIL — props/labels novos não existem.

- [ ] **Step 3a: Reescrever `components/cms/board/TaskCard.tsx`**

```tsx
"use client"

import { useState } from "react"
import { useRouter } from "next/navigation"
import { Trash2, UserPlus } from "lucide-react"
import type { TaskView, InitiativeView, TaskStatus, TaskPriority, MemberView } from "@/lib/tasks/types"
import { TASK_PRIORITY, TASK_STATUS, STATUS_ORDER, PRIORITY_ORDER, ownerInitials, ownerName } from "@/lib/tasks/types"
import { moveTaskAction, deleteTaskAction, claimTaskAction, assignTaskAction, updateTaskAction } from "@/actions/tasks/board"

export function TaskCard({ task, initiative, selectableInitiatives, members, canEdit }: {
  task: TaskView
  initiative: InitiativeView | null
  selectableInitiatives: InitiativeView[]
  members: MemberView[]
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

  const initiativeOptions = (() => {
    const opts = [...selectableInitiatives]
    if (initiative && !opts.some((i) => i.id === initiative.id)) opts.unshift(initiative)
    return opts
  })()

  return (
    <div className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
      {canEdit ? (
        <div className="mb-2">
          <select
            aria-label="Initiative"
            title="Initiative"
            value={task.initiativeId ?? ""}
            onChange={(e) => run(() => updateTaskAction(task.id, { initiativeId: e.target.value || null }))}
            className="max-w-full rounded border border-zinc-800 bg-zinc-900 px-1.5 py-0.5 text-[11px] focus:outline-none"
            style={{ color: initiative ? initiative.color : undefined }}
          >
            <option value="">— No initiative —</option>
            {initiativeOptions.map((i) => <option key={i.id} value={i.id}>{i.name}</option>)}
          </select>
        </div>
      ) : initiative ? (
        <div className="mb-2 inline-flex items-center gap-1 text-[11px]" style={{ color: initiative.color }}>
          <span className="h-2 w-2 rounded-full" style={{ background: initiative.color }} />
          {initiative.name}
        </div>
      ) : null}

      <div className="mb-2 flex items-start justify-between gap-2">
        <span className={`text-sm leading-snug ${task.status === "DONE" ? "text-zinc-500 line-through" : "text-zinc-100"}`}>{task.title}</span>
        {canEdit ? (
          <select
            aria-label="Priority"
            title="Priority"
            value={task.priority}
            onChange={(e) => run(() => updateTaskAction(task.id, { priority: e.target.value as TaskPriority }))}
            className={`shrink-0 rounded px-1 py-0.5 text-[11px] font-medium focus:outline-none ${pr.cls}`}
          >
            <optgroup label="Priority">
              {PRIORITY_ORDER.map((p) => <option key={p} value={p}>{TASK_PRIORITY[p].label}</option>)}
            </optgroup>
          </select>
        ) : (
          <span className={`shrink-0 rounded px-1.5 py-0.5 text-[11px] font-medium ${pr.cls}`}>{pr.label}</span>
        )}
      </div>

      <div className="flex flex-wrap items-center gap-1.5">
        {task.labels.map((l) => (
          <span key={l} className="rounded bg-zinc-800 px-1.5 py-0.5 text-[11px] text-zinc-400">{l}</span>
        ))}
        <span className="ml-auto inline-flex items-center gap-1.5">
          {task.owner && (
            <span title={ownerName(task.owner)} className="flex h-5 w-5 items-center justify-center rounded-full bg-sky-500/20 text-[10px] font-medium text-sky-300">{ownerInitials(task.owner)}</span>
          )}
          {canEdit ? (
            <>
              {!task.owner && (
                <button onClick={() => run(() => claimTaskAction(task.id))} className="inline-flex items-center gap-1 text-[11px] text-sky-400 hover:text-sky-300">
                  <UserPlus size={12} /> Self-assign
                </button>
              )}
              <select
                aria-label="Assign"
                title="Assign to a member"
                value={task.owner?.id ?? ""}
                onChange={(e) => run(() => assignTaskAction(task.id, e.target.value || null))}
                className="rounded border border-zinc-800 bg-zinc-900 px-1 py-0.5 text-[11px] text-zinc-400 focus:outline-none"
              >
                <option value="">{task.owner ? "Unassign" : "Assign…"}</option>
                {members.map((m) => <option key={m.id} value={m.id}>{m.name ?? m.email}</option>)}
              </select>
            </>
          ) : !task.owner ? (
            <span className="text-[11px] text-zinc-600">Unassigned</span>
          ) : null}
        </span>
      </div>

      {canEdit && task.status === "BLOCKED" && (
        <div className="mt-2">
          <input
            aria-label="Blocker reason"
            defaultValue={task.blockerReason}
            onBlur={(e) => { if (e.target.value !== task.blockerReason) run(() => updateTaskAction(task.id, { blockerReason: e.target.value })) }}
            placeholder="What's blocking this?"
            className="w-full rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-200 placeholder:text-rose-400/50 focus:outline-none"
          />
        </div>
      )}
      {!canEdit && task.status === "BLOCKED" && task.blockerReason && (
        <p className="mt-2 text-[11px] text-rose-300/80">{task.blockerReason}</p>
      )}

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
          <button onClick={() => run(() => deleteTaskAction(task.id))} aria-label="Delete task" className="ml-auto text-zinc-600 hover:text-rose-400">
            <Trash2 size={13} />
          </button>
        </div>
      )}
    </div>
  )
}
```

- [ ] **Step 3b: Reescrever `components/cms/board/BoardClient.tsx`**

```tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { KanbanSquare, Plus, Layers } from "lucide-react"
import type { TaskView, InitiativeView, BoardFilter, MemberView } from "@/lib/tasks/types"
import { TASK_STATUS } from "@/lib/tasks/types"
import { buildBoard, distinctLabels, selectableInitiatives } from "@/lib/tasks/board"
import { createTaskAction, bulkCreateTasksAction } from "@/actions/tasks/board"
import { TaskCard } from "./TaskCard"
import { TaskRow } from "./TaskRow"
import { BoardFilters } from "./BoardFilters"

export function BoardClient({ tasks, initiatives, members, meId, canEdit }: {
  tasks: TaskView[]
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

  const initiativeById = useMemo(
    () => Object.fromEntries(initiatives.map((i) => [i.id, i])) as Record<string, InitiativeView>,
    [initiatives],
  )
  const selectable = useMemo(() => selectableInitiatives(initiatives), [initiatives])
  const labels = useMemo(() => distinctLabels(tasks), [tasks])
  const board = useMemo(() => buildBoard(tasks, filter), [tasks, filter])
  const bulkCount = bulkText.split("\n").map((s) => s.trim()).filter(Boolean).length

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
        <div className="inline-flex overflow-hidden rounded-md border border-zinc-700">
          <button onClick={() => setView("board")} className={segCls(view === "board")}>Board</button>
          <button onClick={() => setView("list")} className={segCls(view === "list")}>List</button>
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
            <div key={col.status} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
              <div className="mb-3 flex items-center justify-between px-1">
                <span className={`text-sm font-medium ${TASK_STATUS[col.status].cls}`}>{col.title}</span>
                <span className="text-xs text-zinc-500">{col.count}</span>
              </div>
              <div className="space-y-2">
                {col.tasks.map((t) => (
                  <TaskCard key={t.id} task={t} initiative={t.initiativeId ? initiativeById[t.initiativeId] ?? null : null} selectableInitiatives={selectable} members={members} canEdit={canEdit} />
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

- [ ] **Step 3c: Carregar members na page `app/admin/board/page.tsx`**

Trocar o import + a chamada:

```tsx
import { listTasks, listInitiatives, listAssignableUsers } from "@/lib/tasks/store"
```

```tsx
  const [tasks, initiatives, members] = await Promise.all([listTasks(), listInitiatives(), listAssignableUsers()])
  return (
    <BoardClient
      tasks={tasks}
      initiatives={initiatives.filter((i) => !i.archived)}
      members={members}
      meId={me.id}
      canEdit={me.privileges.includes("tasks.edit")}
    />
  )
```

- [ ] **Step 4: Run + typecheck**

Run: `npx vitest run tests/tasks/board-client.test.tsx && npx tsc --noEmit`
Expected: PASS (8 testes); tsc 0.

- [ ] **Step 5: Commit**

```bash
git add components/cms/board/TaskCard.tsx components/cms/board/BoardClient.tsx app/admin/board/page.tsx tests/tasks/board-client.test.tsx
git commit -m "feat(board): redesigned task card + 4 columns + Bulk Add + Assign"
```

---

### Task 7: Initiatives board UI

**Files:**
- Modify: `components/cms/board/InitiativesClient.tsx` (rewrite — kanban por status, sem List)
- Modify: `tests/tasks/initiatives-client.test.tsx` (adicionar teste do status dropdown)

**Interfaces:**
- Consumes: `buildInitiativeBoard`, `initiativeProgress` (board.ts), `INITIATIVE_STATUS`/`INITIATIVE_STATUS_ORDER`, `moveInitiativeAction`/`createInitiativeAction`/`archiveInitiativeAction`.
- Produces: kanban de 4 colunas por status; cada card com dropdown de status.

- [ ] **Step 1: Write the failing test (append em initiatives-client.test.tsx)**

Adicionar ao mock de actions o `moveInitiativeAction`:

```ts
vi.mock("@/actions/tasks/board", () => ({
  createInitiativeAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "i9" } }),
  archiveInitiativeAction: vi.fn().mockResolvedValue({ ok: true, value: null }),
  moveInitiativeAction: vi.fn().mockResolvedValue({ ok: true, value: {} }),
}))
```

E adicionar, ao fim do arquivo, o teste:

```ts
it("moving an initiative status calls moveInitiativeAction", async () => {
  const { getByLabelText } = render(<InitiativesClient initiatives={[init]} tasks={[]} canEdit />)
  await act(async () => { fireEvent.change(getByLabelText("Initiative status"), { target: { value: "ON_HOLD" } }) })
  const { moveInitiativeAction } = await import("@/actions/tasks/board")
  expect(moveInitiativeAction).toHaveBeenCalledWith("i1", "ON_HOLD")
})
```

(Atualizar o import do topo do arquivo para incluir `moveInitiativeAction`.)

- [ ] **Step 2: Run to verify fail**

Run: `npx vitest run tests/tasks/initiatives-client.test.tsx`
Expected: FAIL — `Initiative status` label não existe.

- [ ] **Step 3: Reescrever `components/cms/board/InitiativesClient.tsx`**

```tsx
"use client"

import { useMemo, useState } from "react"
import { useRouter } from "next/navigation"
import { Plus, Target, Archive } from "lucide-react"
import type { InitiativeView, TaskView, InitiativeStatus } from "@/lib/tasks/types"
import { INITIATIVE_STATUS, INITIATIVE_STATUS_ORDER } from "@/lib/tasks/types"
import { initiativeProgress, buildInitiativeBoard } from "@/lib/tasks/board"
import { createInitiativeAction, archiveInitiativeAction, moveInitiativeAction } from "@/actions/tasks/board"

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
  const boardCols = useMemo(() => buildInitiativeBoard(initiatives), [initiatives])

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

  async function run(fn: () => Promise<unknown>) {
    await fn()
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

      <div className="grid grid-cols-1 gap-3 md:grid-cols-4">
        {boardCols.columns.map((col) => (
          <div key={col.status} className="rounded-lg border border-zinc-800 bg-zinc-900/40 p-3">
            <div className="mb-3 flex items-center justify-between px-1">
              <span className={`text-sm font-medium ${INITIATIVE_STATUS[col.status].cls}`}>{col.title}</span>
              <span className="text-xs text-zinc-500">{col.count}</span>
            </div>
            <div className="space-y-2">
              {col.initiatives.map((i) => {
                const p = initiativeProgress(i.id, tasks)
                return (
                  <div key={i.id} className="rounded-md border border-zinc-800 bg-zinc-900 p-3">
                    <div className="mb-1 flex items-center gap-2">
                      <span className="h-2.5 w-2.5 rounded-full" style={{ background: i.color }} />
                      <span className="font-medium text-zinc-100">{i.name}</span>
                      {canEdit && (
                        <button onClick={() => run(() => archiveInitiativeAction(i.id))} aria-label="Archive" className="ml-auto text-zinc-600 hover:text-zinc-400">
                          <Archive size={14} />
                        </button>
                      )}
                    </div>
                    {i.goal && <p className="mb-2 text-xs text-zinc-400">{i.goal}</p>}
                    <div className="h-1.5 overflow-hidden rounded-full bg-zinc-800">
                      <div className="h-full rounded-full" style={{ width: `${p.pct}%`, background: i.color }} />
                    </div>
                    <p className="mt-1.5 text-[11px] text-zinc-500">{p.done} / {p.total} done · {p.active} active</p>
                    {canEdit && (
                      <select
                        aria-label="Initiative status"
                        value={i.status}
                        onChange={(e) => run(() => moveInitiativeAction(i.id, e.target.value as InitiativeStatus))}
                        className="mt-2 w-full rounded border border-zinc-700 bg-zinc-900 px-1.5 py-1 text-[11px] text-zinc-300 focus:outline-none"
                      >
                        {INITIATIVE_STATUS_ORDER.map((s) => <option key={s} value={s}>{INITIATIVE_STATUS[s].label}</option>)}
                      </select>
                    )}
                  </div>
                )
              })}
              {col.initiatives.length === 0 && <p className="px-1 py-6 text-center text-xs text-zinc-600">None</p>}
            </div>
          </div>
        ))}
      </div>
    </div>
  )
}
```

(A page `app/admin/board/initiatives/page.tsx` não muda — já passa `initiatives.filter(!archived)` + `tasks`.)

- [ ] **Step 4: Run + typecheck**

Run: `npx vitest run tests/tasks/initiatives-client.test.tsx && npx tsc --noEmit`
Expected: PASS (3 testes); tsc 0.

- [ ] **Step 5: Commit**

```bash
git add components/cms/board/InitiativesClient.tsx tests/tasks/initiatives-client.test.tsx
git commit -m "feat(board): initiatives kanban by status (To do / On hold / In progress / Done)"
```

---

### Task 8: Gates finais + verificação

**Files:** none (verification only)

- [ ] **Step 1: Full gate run**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && npx prisma generate && npx tsc --noEmit && npx vitest run && npm run build`
Expected: tsc 0 · vitest verde (os únicos fails aceitáveis são os pré-existentes de `tests/integration/{block-range-data,blockchain-data}` = RPC offline) · build "Compiled successfully" exit 0.

- [ ] **Step 2: Verificação funcional (local dev)**

`npm run dev`, logar no /admin, então:
- Tasks board: 4 colunas **To Do · Blocked · In Progress · Done**; mover uma task pra Blocked revela o campo de motivo (salva on-blur); prioridade dropdown cicla Low/Med/High/Fire (header/hover "Priority"); **sem** botão verde Done; Self-assign + Assign (atribui a outro membro) funcionam; initiative dropdown no card lista To Do/In Progress; Bulk Add cria N tasks numa initiative.
- Initiatives: board com 4 colunas **To Do · On Hold · In Progress · Done** (sem List); mover initiative entre colunas funciona; progress bar e archive mantidos.
- Task/initiative antigos renderizam (status default, blocker vazio).

- [ ] **Step 3: Commit (se algo ajustado)**

```bash
git add -A && git commit -m "test(board): task board v2 gates green"
```

(Se nada mudou, pular. NÃO `git add` scratch.)

---

## Notas de deploy (human-owned — Vitor dá o go)

- PR `feat/board-v2` → review → merge na `main`.
- Bump `newTag` no `k8s/…kustomization.yaml` (⚠️ **com aspas**) → Flux (source antes do Kustomization).
- Init container roda `prisma db push` no boot → cria a coluna `blockerReason`, a coluna `status` da Initiative, e os valores de enum `BLOCKED`/`FIRE`/`InitiativeStatus` (aditivo).
