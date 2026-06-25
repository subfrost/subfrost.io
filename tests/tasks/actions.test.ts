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
