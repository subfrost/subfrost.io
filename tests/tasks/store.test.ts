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
