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
  expect(VIEW_GATES["/admin/board/products"].view).toBe("tasks.view")
})

it("shows the Board nav group (Tasks + Issue intake + Initiatives + Products) for a tasks.view user", () => {
  const group = visibleNav(["tasks.view"]).find((g) => g.key === "board")
  expect(group).toBeTruthy()
  expect(group!.items.map((i) => i.href)).toEqual(["/admin/board", "/admin/board/intake", "/admin/board/initiatives", "/admin/board/products"])
})
