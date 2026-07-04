import { describe, it, expect } from "vitest"
import { PRIVILEGES, CATEGORIES, VIEW_GATES, expand } from "@/lib/cms/iam/registry"
import { visibleNav } from "@/lib/cms/admin-nav"

describe("ecosystem IAM", () => {
  it("registers ecosystem.view and ecosystem.edit with implication", () => {
    const codes = PRIVILEGES.map((p) => p.code)
    expect(codes).toContain("ecosystem.view")
    expect(codes).toContain("ecosystem.edit")
    expect(expand(["ecosystem.edit"])).toContain("ecosystem.view")
  })

  it("has an Ecosystem category", () => {
    expect(CATEGORIES.some((c) => c.key === "ecosystem")).toBe(true)
  })

  it("gates /admin/ecosystem", () => {
    expect(VIEW_GATES["/admin/ecosystem"]).toEqual({ view: "ecosystem.view", edit: "ecosystem.edit" })
  })

  it("shows the Ecosystem nav group only with the privilege", () => {
    const without = visibleNav([])
    expect(without.some((g) => g.key === "ecosystem")).toBe(false)
    const withPriv = visibleNav(["ecosystem.view"])
    expect(withPriv.some((g) => g.key === "ecosystem")).toBe(true)
  })
})
