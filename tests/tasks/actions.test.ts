import { it, expect, vi, beforeEach } from "vitest"
import { Prisma } from "@prisma/client"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }))
vi.mock("@/lib/tasks/store", () => ({
  createTask: vi.fn(), createInitiativeWithSeed: vi.fn(), moveTask: vi.fn(),
  assignTask: vi.fn(), bulkCreateTasks: vi.fn(), moveInitiative: vi.fn(),
  restoreTask: vi.fn(), purgeTask: vi.fn(), addComment: vi.fn(), deleteComment: vi.fn(), listComments: vi.fn(),
  TaskError: class extends Error {},
}))

import { createTaskAction, createInitiativeAction, moveTaskAction, assignTaskAction, bulkCreateTasksAction, moveInitiativeAction, restoreTaskAction, addCommentAction } from "@/actions/tasks/board"
import { currentUser } from "@/lib/cms/authz"
import { createTask, createInitiativeWithSeed, assignTask, bulkCreateTasks, moveInitiative, moveTask, restoreTask, addComment } from "@/lib/tasks/store"

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

it("forwards a finite drag position to the store on move", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  vi.mocked(moveTask).mockResolvedValue({ id: "t1" } as never)
  await moveTaskAction("t1", "DONE", -3)
  expect(moveTask).toHaveBeenCalledWith("t1", "DONE", -3)
})

it("maps a P2025 (record gone — concurrent admin) to a friendly refresh message", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  const gone = new Prisma.PrismaClientKnownRequestError("not found", { code: "P2025", clientVersion: "5.22.0" })
  vi.mocked(moveTask).mockRejectedValue(gone as never)
  const r = await moveTaskAction("t1", "DONE")
  expect(r).toEqual({ ok: false, error: "That item no longer exists — refresh the board." })
})

it("restoreTaskAction is denied without tasks.edit", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.view"] } as never)
  const r = await restoreTaskAction("t1")
  expect(r).toEqual({ ok: false, error: "unauthorized" })
  expect(restoreTask).not.toHaveBeenCalled()
})

it("addCommentAction rejects an empty body and otherwise persists it", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  const bad = await addCommentAction({ taskId: "t1", body: "  " })
  expect(bad.ok).toBe(false)
  expect(addComment).not.toHaveBeenCalled()
  vi.mocked(addComment).mockResolvedValue({ id: "c1" } as never)
  const ok = await addCommentAction({ taskId: "t1", body: "looks good" })
  expect(ok).toEqual({ ok: true, value: { id: "c1" } })
  expect(addComment).toHaveBeenCalledWith("t1", "u1", "looks good")
})

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

it("moveInitiativeAction moves the initiative and returns the value", async () => {
  vi.mocked(currentUser).mockResolvedValue({ id: "u1", privileges: ["tasks.edit", "tasks.view"] } as never)
  vi.mocked(moveInitiative).mockResolvedValue({ id: "i1", status: "ON_HOLD" } as never)
  const r = await moveInitiativeAction("i1", "ON_HOLD")
  expect(r).toEqual({ ok: true, value: { id: "i1", status: "ON_HOLD" } })
  expect(moveInitiative).toHaveBeenCalledWith("i1", "ON_HOLD")
})
