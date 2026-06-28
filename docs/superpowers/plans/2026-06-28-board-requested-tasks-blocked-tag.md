# Board: "Requested Tasks" column + Blocked tag — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Replace the Board's "Blocked" column with a "Requested Tasks" triage column, and turn "blocked" into a first-class red tag (flag + reason) usable in any column. Also fix the card's priority dropdown rendering with an orange popup background.

**Architecture:** Additive Prisma change (`REQUESTED` added to the `TaskStatus` enum, new `blocked Boolean`), keeping the legacy `BLOCKED` enum value so the boot-time `prisma db push` stays non-destructive. `STATUS_ORDER` drives the columns and the status dropdowns, so renaming/reordering columns is centralized. `buildBoard` folds any leftover `BLOCKED` task into "In Progress" (marked blocked) as a safety net. A one-off script migrates existing BLOCKED rows.

**Tech Stack:** Next.js (App Router) + TypeScript, Prisma 5.22 + Postgres, Zod, React Testing Library + Vitest, Tailwind. Package manager: pnpm. Platform: Windows + Git Bash.

## Global Constraints

- Package manager is **pnpm** (`pnpm test`, `pnpm build`). Prisma **5.22.0**.
- Schema changes MUST be **additive** — deploy applies them via an init-container
  `prisma db push --skip-generate` (`k8s/deployment.yaml`) with **no** `--accept-data-loss`.
  Do **not** remove the `BLOCKED` enum value.
- **No new IAM.** Reuse `tasks.view` / `tasks.edit`.
- UI copy stays in **English** (matches existing labels "To do", "In Progress", "Done").
  New column label is exactly **"Requested Tasks"**.
- Requested column color: **violet** (`text-violet-300` / `bg-violet-400`).
- Tailwind `content` already includes `./lib/**` — class strings in `lib/tasks/types.ts`
  are not purged.
- Creation defaults are **unchanged** (new tasks default to `TODO`; the bearer API is untouched).
- After all tasks, deploy is: branch → PR → merge → bump `newTag` **with quotes** in the
  k8s kustomization → Flux. Then run the migration script against prod.

---

### Task 1: Backend layer — schema, types, store, actions, board safety net

**Files:**
- Modify: `prisma/schema.prisma` (enum `TaskStatus`, model `Task`)
- Modify: `lib/tasks/types.ts`
- Modify: `lib/tasks/store.ts`
- Modify: `actions/tasks/board.ts`
- Modify: `lib/tasks/board.ts`
- Test: `tests/tasks/types.test.ts`, `tests/tasks/board.test.ts`, `tests/tasks/store.test.ts`
- Test fixtures to keep tsc green: `tests/tasks/board-client.test.tsx`,
  `tests/tasks/initiatives-client.test.tsx` (add `blocked: false` to their TaskView factories;
  rename the "Blocked column" assertion)

**Interfaces:**
- Produces: `TaskStatus` includes `"REQUESTED"`; `STATUS_ORDER = ["REQUESTED","TODO","IN_PROGRESS","DONE"]`;
  `TASK_STATUS.REQUESTED = { label: "Requested Tasks", cls: "text-violet-300", dot: "bg-violet-400" }`;
  `TaskView.blocked: boolean`; store `updateTask` accepts `{ blocked?: boolean }`;
  actions `UpdateTaskSchema` accepts `blocked`; `StatusEnum` includes `"REQUESTED"`;
  `buildBoard` folds legacy `BLOCKED` into the `IN_PROGRESS` column with `blocked: true`.

- [ ] **Step 1: Update the failing unit tests (types + board)**

In `tests/tasks/types.test.ts`, replace the first test body (lines 4-10) with:

```ts
it("has metadata for every status and an explicit column order", () => {
  expect(STATUS_ORDER).toEqual(["REQUESTED", "TODO", "IN_PROGRESS", "DONE"])
  expect(TASK_STATUS.REQUESTED.label).toBe("Requested Tasks")
  expect(TASK_STATUS.TODO.label).toBe("To do")
  expect(TASK_STATUS.IN_PROGRESS.label).toBe("In Progress")
  expect(TASK_STATUS.DONE.label).toBe("Done")
})
```

In `tests/tasks/board.test.ts`, update the factory `t` (line 7) to include `blocked`:

```ts
const t = (over: Partial<TaskView>): TaskView => ({
  id: "x", title: "t", description: "", status: "TODO", priority: "MEDIUM",
  labels: [], blockerReason: "", blocked: false, color: "", colorLabel: "", checklist: [], commentCount: 0, owner: null, initiativeId: null, position: 0,
  createdAt: new Date("2026-06-25T00:00:00Z"), updatedAt: new Date("2026-06-25T00:00:00Z"), ...over,
})
```

Replace the "groups tasks into the four ordered columns" test (lines 11-17) with:

```ts
it("groups tasks into the four ordered columns", () => {
  const b = buildBoard([t({ id: "a", status: "TODO" }), t({ id: "b", status: "DONE" })])
  expect(b.columns.map((c) => c.status)).toEqual(["REQUESTED", "TODO", "IN_PROGRESS", "DONE"])
  expect(b.columns[1].count).toBe(1) // TODO
  expect(b.columns[3].count).toBe(1) // DONE
  expect(b.total).toBe(2)
})

it("folds a legacy BLOCKED task into In Progress and marks it blocked", () => {
  const b = buildBoard([t({ id: "b1", status: "BLOCKED" })])
  expect(b.columns.some((c) => c.status === "BLOCKED")).toBe(false)
  const ip = b.columns.find((c) => c.status === "IN_PROGRESS")!
  expect(ip.tasks.map((x) => x.id)).toContain("b1")
  expect(ip.tasks.find((x) => x.id === "b1")!.blocked).toBe(true)
})
```

In the "orders a column by priority desc" test, change `b.columns[0].tasks` (line 24) to
`b.columns[1].tasks` (TODO is now index 1):

```ts
  expect(b.columns[1].tasks.map((x) => x.id)).toEqual(["hi", "lo"])
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/tasks/types.test.ts tests/tasks/board.test.ts`
Expected: FAIL (`STATUS_ORDER` mismatch; `TASK_STATUS.REQUESTED` undefined; `blocked` not on TaskView).

- [ ] **Step 3: Prisma schema — additive enum value + blocked field**

In `prisma/schema.prisma`, change the `TaskStatus` enum (lines 1161-1166) to add `REQUESTED`:

```prisma
enum TaskStatus {
  REQUESTED
  TODO
  BLOCKED
  IN_PROGRESS
  DONE
}
```

In `model Task`, add the `blocked` field right after `blockerReason` (line 1204):

```prisma
  blockerReason String      @default("")
  blocked      Boolean      @default(false)
```

- [ ] **Step 4: Update `lib/tasks/types.ts`**

Line 1 — add `REQUESTED` to the union:

```ts
export type TaskStatus = "REQUESTED" | "TODO" | "BLOCKED" | "IN_PROGRESS" | "DONE"
```

In `interface TaskView`, add `blocked` next to `blockerReason` (line 26):

```ts
  blockerReason: string
  blocked: boolean
```

Line 72 — update the stale comment:

```ts
  columns: BoardColumn[] // always [REQUESTED, TODO, IN_PROGRESS, DONE]
```

Line 94 — update the column order (drop BLOCKED, add REQUESTED first):

```ts
export const STATUS_ORDER: TaskStatus[] = ["REQUESTED", "TODO", "IN_PROGRESS", "DONE"]
```

In the `TASK_STATUS` record (lines 98-103), add the `REQUESTED` entry and keep `BLOCKED`:

```ts
export const TASK_STATUS: Record<TaskStatus, { label: string; cls: string; dot: string }> = {
  REQUESTED: { label: "Requested Tasks", cls: "text-violet-300", dot: "bg-violet-400" },
  TODO: { label: "To do", cls: "text-zinc-400", dot: "bg-zinc-500" },
  BLOCKED: { label: "Blocked", cls: "text-rose-300", dot: "bg-rose-400" },
  IN_PROGRESS: { label: "In Progress", cls: "text-sky-300", dot: "bg-sky-400" },
  DONE: { label: "Done", cls: "text-emerald-300", dot: "bg-emerald-400" },
}
```

- [ ] **Step 5: Update `lib/tasks/store.ts`**

In `type TaskRow` (line 14), add `blocked`:

```ts
  labels: string[]; blockerReason: string; blocked: boolean; color: string; colorLabel: string; checklist: unknown
```

In `mapTask` (line 37), add `blocked` (tolerant of mocks/rows missing it):

```ts
    labels: r.labels, blockerReason: r.blockerReason, blocked: r.blocked ?? false, color: r.color, colorLabel: r.colorLabel,
```

In `interface UpdateTaskPatch` (line 92), add `blocked?: boolean`:

```ts
  initiativeId?: string | null; blockerReason?: string; blocked?: boolean; checklist?: ChecklistItem[]
```

In `updateTask`, after the `blockerReason` line (line 114), add:

```ts
  if (patch.blockerReason !== undefined) data.blockerReason = patch.blockerReason.trim()
  if (patch.blocked !== undefined) data.blocked = patch.blocked
```

- [ ] **Step 6: Update `actions/tasks/board.ts`**

Line 43 — add `REQUESTED` to `StatusEnum` (keep `BLOCKED` to tolerate legacy values):

```ts
const StatusEnum = z.enum(["REQUESTED", "TODO", "BLOCKED", "IN_PROGRESS", "DONE"])
```

In `UpdateTaskSchema`, after the `blockerReason` line (line 84), add:

```ts
  blockerReason: z.string().optional(),
  blocked: z.boolean().optional(),
```

- [ ] **Step 7: Update `lib/tasks/board.ts` — safety net**

Replace the `buildBoard` column mapping (lines 22-27) with:

```ts
export function buildBoard(tasks: TaskView[], filter: BoardFilter = {}): BoardData {
  const filtered = applyFilter(tasks, filter)
  const columns: BoardColumn[] = STATUS_ORDER.map((status) => {
    const colTasks = filtered
      // Legacy safety net: a task still in the removed BLOCKED status renders in the
      // In Progress column, surfaced as blocked, so nothing ever disappears from the board.
      .filter((t) => t.status === status || (status === "IN_PROGRESS" && t.status === "BLOCKED"))
      .map((t) => (t.status === "BLOCKED" ? { ...t, blocked: true } : t))
      .sort(byColumnOrder)
    return { status, title: TASK_STATUS[status].label, tasks: colTasks, count: colTasks.length }
  })
  return { columns, total: filtered.length }
}
```

- [ ] **Step 8: Add the store `blocked` persistence test**

In `tests/tasks/store.test.ts`, after the "updateTask persists a trimmed blockerReason"
test (line 119), add:

```ts
it("updateTask persists the blocked flag", async () => {
  client.task.update.mockResolvedValue({
    id: "t1", title: "x", description: "", status: "IN_PROGRESS", priority: "LOW",
    labels: [], blockerReason: "", blocked: true, color: "", colorLabel: "", checklist: [], initiativeId: null, position: 0, deletedAt: null, owner: null, createdAt: new Date(), updatedAt: new Date(),
  })
  const v = await updateTask("t1", { blocked: true })
  expect(client.task.update).toHaveBeenCalledWith(expect.objectContaining({ data: expect.objectContaining({ blocked: true }) }))
  expect(v.blocked).toBe(true)
})
```

- [ ] **Step 9: Keep the component-test fixtures compiling**

In `tests/tasks/board-client.test.tsx`, update the `task` factory (line 28) to add `blocked`:

```ts
  labels: ["subfrost-app"], blockerReason: "", blocked: false, color: "", colorLabel: "", checklist: [], commentCount: 0, owner: null, initiativeId: "i1", position: 0,
```

Replace the "renders the four columns including Blocked" test (lines 46-51) with:

```ts
it("renders the four columns including Requested Tasks", () => {
  const { getAllByText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  // "Requested Tasks"/"In Progress" appear as a column header AND as a status <option>, so match >= 1
  expect(getAllByText("Requested Tasks").length).toBeGreaterThan(0)
  expect(getAllByText("In Progress").length).toBeGreaterThan(0)
})
```

In `tests/tasks/initiatives-client.test.tsx`, update the `task` factory (line 18) to add `blocked`:

```ts
  labels: [], blockerReason: "", blocked: false, color: "", colorLabel: "", checklist: [], commentCount: 0, owner: null, initiativeId: "i1", position: 0, createdAt: new Date(), updatedAt: new Date(), ...over,
```

- [ ] **Step 10: Regenerate the Prisma client**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec prisma generate`
Expected: client regenerated with `blocked` on `Task` and `REQUESTED` in `TaskStatus`.

- [ ] **Step 11: Run the suite + typecheck**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm test && pnpm exec tsc --noEmit`
Expected: All task-board tests PASS. tsc: 0 errors. (Pre-existing ~8 RPC-offline integration
failures, if any, are unrelated/expected.)

- [ ] **Step 12: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add prisma/schema.prisma lib/tasks/types.ts lib/tasks/store.ts actions/tasks/board.ts lib/tasks/board.ts tests/tasks/
git commit -m "feat(board): add REQUESTED status + blocked flag (additive), fold legacy BLOCKED into In Progress"
```

---

### Task 2: TaskCard — Blocked tag UI + priority dropdown fix

**Files:**
- Modify: `components/cms/board/TaskCard.tsx`
- Test: `tests/tasks/board-client.test.tsx`

**Interfaces:**
- Consumes: `TaskView.blocked`, `updateTaskAction(id, { blocked?, blockerReason? })`, `TASK_PRIORITY[p].color`.
- Produces: card renders a red "Blocked" chip + reason input when `task.blocked`; a "Block/Blocked"
  toggle button (editor) calling `updateTaskAction(id, { blocked: !task.blocked })`; priority
  `<option>`s render on the site's dark background.

- [ ] **Step 1: Update the blocker test to be flag-driven + add a toggle test**

In `tests/tasks/board-client.test.tsx`, replace the "shows the blocker input only for blocked
tasks and saves it on blur" test (lines 79-85) with:

```ts
it("shows the blocker input for blocked tasks and saves it on blur", async () => {
  const { getByLabelText } = render(<BoardClient tasks={[task({ blocked: true })]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  const input = getByLabelText("Blocker reason")
  await act(async () => { fireEvent.change(input, { target: { value: "waiting on flex" } }); fireEvent.blur(input) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { blockerReason: "waiting on flex" })
})

it("the Block toggle marks an unblocked task as blocked", async () => {
  const { getByRole } = render(<BoardClient tasks={[task({ blocked: false })]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.click(getByRole("button", { name: "Mark blocked" })) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { blocked: true })
})
```

- [ ] **Step 2: Run the tests to verify they fail**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/tasks/board-client.test.tsx -t "blocker input for blocked|Block toggle"`
Expected: FAIL (blocker input not shown for a `blocked` task yet; no "Mark blocked" button).

- [ ] **Step 3: Import the Ban icon**

In `components/cms/board/TaskCard.tsx`, line 5, add `Ban`:

```ts
import { Trash2, UserPlus, CheckSquare, MessageSquare, Ban } from "lucide-react"
```

- [ ] **Step 4: Fix the priority dropdown (dark option background, drop optgroup)**

Replace the editable priority `<select>` block (lines 112-124) with:

```tsx
          {canEdit ? (
            <select
              aria-label="Priority"
              title="Priority"
              value={task.priority}
              onChange={(e) => run(() => updateTaskAction(task.id, { priority: e.target.value as TaskPriority }))}
              className={`shrink-0 rounded px-1 py-0.5 text-[11px] font-medium focus:outline-none ${pr.cls}`}
              style={{ colorScheme: "dark" }}
            >
              {PRIORITY_ORDER.map((p) => (
                <option key={p} value={p} style={{ color: TASK_PRIORITY[p].color, backgroundColor: "#18181b" }}>{TASK_PRIORITY[p].label}</option>
              ))}
            </select>
          ) : (
```

(The closing `) : (` continues into the existing non-editable `<span>` branch — leave that branch unchanged.)

- [ ] **Step 5: Replace the status-based blocker block with the blocked tag UI**

Replace the two blocks gated on `task.status === "BLOCKED"` (lines 181-194) with:

```tsx
      {task.blocked && (
        <div className="mt-2 space-y-1">
          <span className="inline-flex items-center gap-1 rounded bg-rose-500/15 px-1.5 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">
            <Ban size={10} /> Blocked
          </span>
          {canEdit ? (
            <input
              aria-label="Blocker reason"
              defaultValue={task.blockerReason}
              onBlur={(e) => { if (e.target.value !== task.blockerReason) run(() => updateTaskAction(task.id, { blockerReason: e.target.value })) }}
              placeholder="What's blocking this?"
              className="w-full rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1 text-[11px] text-rose-200 placeholder:text-rose-400/50 focus:outline-none"
            />
          ) : task.blockerReason ? (
            <p className="text-[11px] text-rose-300/80">{task.blockerReason}</p>
          ) : null}
        </div>
      )}
```

- [ ] **Step 6: Add the Block toggle button to the footer**

In the footer row (lines 196-213), add the toggle button right after the status `<select>`
block (after line 206, before the age `<span>`):

```tsx
        {canEdit && (
          <button
            onClick={() => run(() => updateTaskAction(task.id, { blocked: !task.blocked }))}
            aria-label={task.blocked ? "Unmark blocked" : "Mark blocked"}
            title={task.blocked ? "Unmark blocked" : "Mark blocked"}
            className={`inline-flex items-center gap-1 rounded border px-1.5 py-1 text-[11px] ${task.blocked ? "border-rose-500/40 text-rose-300 hover:bg-rose-500/10" : "border-zinc-700 text-zinc-400 hover:bg-zinc-800"}`}
          >
            <Ban size={12} /> {task.blocked ? "Blocked" : "Block"}
          </button>
        )}
```

- [ ] **Step 7: Run the tests + typecheck**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/tasks/board-client.test.tsx && pnpm exec tsc --noEmit`
Expected: All board-client tests PASS. tsc: 0 errors.

- [ ] **Step 8: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add components/cms/board/TaskCard.tsx tests/tasks/board-client.test.tsx
git commit -m "feat(board): Blocked tag (chip+toggle+reason) on cards; fix priority dropdown popup background"
```

---

### Task 3: TaskDetail blocked toggle (any status) + TaskRow indicator

**Files:**
- Modify: `components/cms/board/TaskDetail.tsx`
- Modify: `components/cms/board/TaskRow.tsx`
- Test: `tests/tasks/board-client.test.tsx`

**Interfaces:**
- Consumes: `TaskView.blocked`, `updateTaskAction(id, { blocked?, blockerReason? })`.
- Produces: detail panel exposes a `Blocked` checkbox (aria-label "Blocked") + reason input,
  decoupled from status; list rows show a "Blocked" chip when `task.blocked`.

- [ ] **Step 1: Add a detail blocked-toggle test**

In `tests/tasks/board-client.test.tsx`, after the "picking a color in the detail saves it
with a seeded name" test (line 160), add:

```ts
it("toggling Blocked in the detail marks the task blocked", async () => {
  const { getByText, getByLabelText } = render(<BoardClient tasks={[task({})]} deletedTasks={[]} initiatives={[init]} members={members} meId="u1" canEdit />)
  await act(async () => { fireEvent.click(getByText("Audit mint path")) })
  await act(async () => { fireEvent.click(getByLabelText("Blocked")) })
  const { updateTaskAction } = await import("@/actions/tasks/board")
  expect(updateTaskAction).toHaveBeenCalledWith("t1", { blocked: true })
})
```

- [ ] **Step 2: Run the test to verify it fails**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/tasks/board-client.test.tsx -t "toggling Blocked in the detail"`
Expected: FAIL (no control labelled "Blocked" in the detail panel).

- [ ] **Step 3: Replace the detail Blocker section with a status-independent toggle**

In `components/cms/board/TaskDetail.tsx`, replace the `{task.status === "BLOCKED" && ( ... )}`
block (lines 166-176) with:

```tsx
          {/* Blocked tag (independent of column/status) */}
          <div>
            <label className="text-[11px] font-medium uppercase tracking-wide text-rose-400">Blocked</label>
            {canEdit ? (
              <div className="mt-1 space-y-2">
                <label className="inline-flex items-center gap-2 text-sm text-zinc-200">
                  <input
                    type="checkbox"
                    aria-label="Blocked"
                    checked={task.blocked}
                    onChange={(e) => run(() => updateTaskAction(task.id, { blocked: e.target.checked }))}
                    className="h-3.5 w-3.5 rounded border-zinc-600 bg-zinc-900 text-rose-500 focus:ring-0"
                  />
                  Mark this task as blocked
                </label>
                {task.blocked && (
                  <input
                    aria-label="Blocker reason"
                    defaultValue={task.blockerReason}
                    onBlur={(e) => { if (e.target.value !== task.blockerReason) run(() => updateTaskAction(task.id, { blockerReason: e.target.value })) }}
                    placeholder="What's blocking this?"
                    className="w-full rounded border border-rose-500/30 bg-rose-500/5 px-2 py-1.5 text-sm text-rose-200 placeholder:text-rose-400/50 focus:outline-none"
                  />
                )}
              </div>
            ) : task.blocked ? (
              <p className="mt-1 text-sm text-rose-300/80">{task.blockerReason || "Blocked"}</p>
            ) : (
              <p className="mt-1 text-sm text-zinc-600">Not blocked</p>
            )}
          </div>
```

- [ ] **Step 4: Add a Blocked chip to the list row**

In `components/cms/board/TaskRow.tsx`, replace the title cell (lines 9-14) with:

```tsx
      <td className="px-3 py-2 text-zinc-100">
        <span className="flex items-center gap-1.5">
          {task.color && <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: task.color }} title={task.colorLabel || undefined} />}
          {task.title}
          {task.blocked && <span className="rounded bg-rose-500/15 px-1 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-rose-300">Blocked</span>}
        </span>
      </td>
```

- [ ] **Step 5: Run the tests + typecheck**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && pnpm exec vitest run tests/tasks/board-client.test.tsx && pnpm exec tsc --noEmit`
Expected: All board-client tests PASS (incl. the new detail toggle). tsc: 0 errors.

- [ ] **Step 6: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add components/cms/board/TaskDetail.tsx components/cms/board/TaskRow.tsx tests/tasks/board-client.test.tsx
git commit -m "feat(board): blocked toggle in task detail (any status) + blocked chip in list view"
```

---

### Task 4: Migration script + full gates

**Files:**
- Create: `scripts/migrate-blocked-tasks.mjs`

**Interfaces:**
- Produces: an idempotent one-off that sets `status='IN_PROGRESS', blocked=true` for every
  `status='BLOCKED'` task. Run locally against prod via cloud-sql-proxy (like
  `scripts/migrate-compliance-data.ts`).

- [ ] **Step 1: Write the migration script**

Create `scripts/migrate-blocked-tasks.mjs`:

```js
/**
 * One-off: migrate legacy BLOCKED tasks to the new model.
 * status BLOCKED -> IN_PROGRESS, blocked=true. Idempotent (re-runs match 0 rows).
 * Run locally against prod via cloud-sql-proxy (DATABASE_URL set), mirroring
 * scripts/migrate-compliance-data.ts. Usage:
 *   node scripts/migrate-blocked-tasks.mjs
 */
import { PrismaClient } from "@prisma/client"

const prisma = new PrismaClient()
try {
  const r = await prisma.task.updateMany({
    where: { status: "BLOCKED" },
    data: { status: "IN_PROGRESS", blocked: true },
  })
  console.log(`[migrate-blocked] ${r.count} task(s): BLOCKED -> IN_PROGRESS + blocked=true`)
} finally {
  await prisma.$disconnect()
}
```

- [ ] **Step 2: Verify the script parses**

Run: `cd "C:/Alkanes Geral Dev/subfrost.io" && node --check scripts/migrate-blocked-tasks.mjs`
Expected: no output (syntax OK). Do NOT run it against a DB here — it runs in prod post-merge.

- [ ] **Step 3: Full gate — generate, typecheck, test, build**

Run:
```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
pnpm exec prisma generate
pnpm exec tsc --noEmit
pnpm test
pnpm build
```
Expected: prisma generate OK; tsc 0 errors; vitest green (pre-existing ~8 RPC-offline
integration failures, if present, are unrelated); `next build` completes. Confirm the violet
Requested column classes and the rose Blocked chip survive the build (not purged).

- [ ] **Step 4: Commit**

```bash
cd "C:/Alkanes Geral Dev/subfrost.io"
git add scripts/migrate-blocked-tasks.mjs
git commit -m "chore(board): one-off script to migrate legacy BLOCKED tasks to blocked flag"
```

---

## Deploy (after the plan, human-owned)

1. Push branch → open PR → review (opus) → merge to `main`.
2. Bump `newTag` **with quotes** in the k8s kustomization (gotcha: a SHA like `\d+e\d+` parses
   as a YAML float → `Init:InvalidImageName`).
3. Flux reconciles (annotate the GitRepository/source before the Kustomization). Wait for
   Cloud Build (~3-5 min). The init-container runs `prisma db push --skip-generate` (additive).
4. Run the migration against prod (cloud-sql-proxy + `DATABASE_URL`):
   `node scripts/migrate-blocked-tasks.mjs`
5. Verify live at `/admin/board`: 4 columns (Requested Tasks · To do · In Progress · Done),
   no Blocked column, the Block toggle + red chip work and persist, the priority dropdown opens
   on the dark site background, and any previously-blocked task shows in In Progress with the chip.

## Self-Review

- **Spec coverage:** (1) Requested column → Task 1 (STATUS_ORDER/TASK_STATUS) + auto-render in
  BoardClient. (2) Blocked column removed → Task 1 (STATUS_ORDER). (3) Blocked as tag → Task 1
  (schema/types/store/actions) + Task 2 (card) + Task 3 (detail/list). (4) Additive/migration-safe
  → Task 1 (keep BLOCKED enum) + board safety net + Task 4 (migration). (5) Priority dropdown fix →
  Task 2. (6) Gates → Task 4. All spec sections map to a task.
- **Placeholder scan:** none — every step has concrete code/commands.
- **Type consistency:** `blocked: boolean` consistent across `TaskView` (types) → `TaskRow`/`mapTask`/
  `UpdateTaskPatch` (store) → `UpdateTaskSchema` (actions) → `updateTaskAction(id, { blocked })`
  (card/detail). `STATUS_ORDER` (4 entries) drives `buildBoard`, the card status `<select>`, and the
  detail status `<select>` — no per-component column lists to drift. `TASK_STATUS.REQUESTED.label`
  ("Requested Tasks") matches the test assertion and the column header.
