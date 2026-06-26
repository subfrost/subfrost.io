import { it, expect, vi, beforeEach } from "vitest"

const client = vi.hoisted(() => ({
  task: { findMany: vi.fn(), create: vi.fn(), createMany: vi.fn(), update: vi.fn(), delete: vi.fn() },
  initiative: { findMany: vi.fn(), create: vi.fn(), update: vi.fn() },
  user: { findUnique: vi.fn(), findMany: vi.fn() },
}))
vi.mock("@/lib/prisma", () => ({ prisma: client, default: client }))

import { createTask, createInitiativeWithSeed, moveTask, claimTask, assignTask, listAssignableUsers, bulkCreateTasks, moveInitiative, updateTask, TaskError } from "@/lib/tasks/store"

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
    labels: [], blockerReason: "", initiativeId: null, position: 0, owner: null, createdAt: new Date(), updatedAt: new Date(),
  })
  await moveTask("t1", "DONE")
  expect(client.task.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t1" }, data: { status: "DONE" } }))
  await claimTask("t1", "u9")
  expect(client.task.update).toHaveBeenCalledWith(expect.objectContaining({ where: { id: "t1" }, data: { ownerId: "u9" } }))
})

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
  expect(client.user.findUnique).toHaveBeenCalledTimes(1)
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
