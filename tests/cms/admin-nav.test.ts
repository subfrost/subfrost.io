import { describe, it, expect } from "vitest"
import { visibleNav, isItemActive, NAV_GROUPS } from "@/lib/cms/admin-nav"
import { ALL_PRIVILEGES } from "@/lib/cms/privileges"

describe("visibleNav", () => {
  it("shows only the Articles group when there are no privileges", () => {
    const groups = visibleNav([])
    expect(groups.map((g) => g.key)).toEqual(["articles"])
    expect(groups[0].items.map((i) => i.href)).toEqual(["/admin", "/admin/articles/new"])
  })

  it("shows Articles + Compliance (3 items) for a MANAGE_AML-only user", () => {
    const groups = visibleNav(["MANAGE_AML"])
    expect(groups.map((g) => g.key)).toEqual(["articles", "compliance"])
    const compliance = groups.find((g) => g.key === "compliance")!
    expect(compliance.items.map((i) => i.href)).toEqual([
      "/admin/kyc", "/admin/fincen", "/admin/mtl",
    ])
  })

  it("shows all 5 groups for ADMIN (all privileges)", () => {
    const groups = visibleNav([...ALL_PRIVILEGES])
    expect(groups.map((g) => g.key)).toEqual([
      "articles", "community", "compliance", "billing", "settings",
    ])
    expect(groups.find((g) => g.key === "billing")!.items).toHaveLength(8)
  })

  it("never returns a group with zero items", () => {
    for (const g of visibleNav(["MANAGE_FUEL"])) {
      expect(g.items.length).toBeGreaterThan(0)
    }
  })

  it("does not mutate NAV_GROUPS", () => {
    const before = NAV_GROUPS.find((g) => g.key === "billing")!.items.length
    visibleNav([])
    expect(NAV_GROUPS.find((g) => g.key === "billing")!.items.length).toBe(before)
  })
})

describe("isItemActive", () => {
  it("matches the articles list exactly on /admin", () => {
    expect(isItemActive("/admin", "/admin")).toBe(true)
  })
  it("keeps the articles list active while editing an article", () => {
    expect(isItemActive("/admin", "/admin/articles/abc123")).toBe(true)
  })
  it("does not mark the articles list active on the new-article page", () => {
    expect(isItemActive("/admin", "/admin/articles/new")).toBe(false)
    expect(isItemActive("/admin/articles/new", "/admin/articles/new")).toBe(true)
  })
  it("matches billing overview exactly, not its sub-pages", () => {
    expect(isItemActive("/admin/billing", "/admin/billing")).toBe(true)
    expect(isItemActive("/admin/billing", "/admin/billing/treasury")).toBe(false)
    expect(isItemActive("/admin/billing/treasury", "/admin/billing/treasury")).toBe(true)
  })
})
