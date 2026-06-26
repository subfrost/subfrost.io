import { it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/authz", () => ({ currentUser: vi.fn() }))
vi.mock("@/lib/cms/audit", () => ({ audit: vi.fn() }))
vi.mock("next/cache", () => ({ revalidatePath: vi.fn() }))
vi.mock("next/headers", () => ({ headers: async () => ({ get: () => null }) }))
vi.mock("@/lib/tasks/store", () => ({
  createTask: vi.fn(), createInitiativeWithSeed: vi.fn(), moveTask: vi.fn(),
  assignTask: vi.fn(), bulkCreateTasks: vi.fn(), moveInitiative: vi.fn(),
  TaskError: class extends Error {},
}))

import { createTaskAction, createInitiativeAction, moveTaskAction, assignTaskAction, bulkCreateTasksAction, moveInitiativeAction } from "@/actions/tasks/board"
import { currentUser } from "@/lib/cms/authz"
import { createTask, createInitiativeWithSeed, assignTask, bulkCreateTasks, moveInitiative } from "@/lib/tasks/store"

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
