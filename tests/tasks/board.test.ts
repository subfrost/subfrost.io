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
