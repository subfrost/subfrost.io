import { describe, it, expect } from "vitest"
import { visibleNav, isItemActive, NAV_GROUPS } from "@/lib/cms/admin-nav"
import { ALL_PRIVILEGES } from "@/lib/cms/privileges"

describe("visibleNav", () => {
  it("shows Overview + Articles (both ungated) when there are no privileges", () => {
    const groups = visibleNav([])
    expect(groups.map((g) => g.key)).toEqual(["overview", "articles"])
    expect(groups.find((g) => g.key === "articles")!.items.map((i) => i.href)).toEqual([
      "/admin/articles", "/admin/articles/new",
    ])
    expect(groups.find((g) => g.key === "overview")!.items.map((i) => i.href)).toEqual(["/admin"])
  })

  it("shows Overview + Articles + Compliance for an AML_VIEW-only user", () => {
    const groups = visibleNav(["AML_VIEW"])
    expect(groups.map((g) => g.key)).toEqual(["overview", "articles", "compliance"])
    const compliance = groups.find((g) => g.key === "compliance")!
    expect(compliance.items.map((i) => i.href)).toEqual([
      "/admin/kyc", "/admin/fincen", "/admin/mtl",
    ])
  })

  it("shows all 6 groups for ADMIN (all privileges)", () => {
    const groups = visibleNav([...ALL_PRIVILEGES])
    expect(groups.map((g) => g.key)).toEqual([
      "overview", "articles", "community", "compliance", "billing", "settings",
    ])
    expect(groups.find((g) => g.key === "billing")!.items).toHaveLength(10)
  })

  it("never returns a group with zero items", () => {
    for (const g of visibleNav(["FUEL_VIEW"])) {
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
  it("matches the dashboard exactly on /admin", () => {
    expect(isItemActive("/admin", "/admin")).toBe(true)
    expect(isItemActive("/admin", "/admin/articles/abc123")).toBe(false)
  })
  it("keeps the articles list active while editing an article", () => {
    expect(isItemActive("/admin/articles", "/admin/articles/abc123")).toBe(true)
    expect(isItemActive("/admin/articles", "/admin/articles")).toBe(true)
  })
  it("does not mark the articles list active on the new-article page", () => {
    expect(isItemActive("/admin/articles", "/admin/articles/new")).toBe(false)
    expect(isItemActive("/admin/articles/new", "/admin/articles/new")).toBe(true)
  })
  it("matches billing overview exactly, not its sub-pages", () => {
    expect(isItemActive("/admin/billing", "/admin/billing")).toBe(true)
    expect(isItemActive("/admin/billing", "/admin/billing/treasury")).toBe(false)
    expect(isItemActive("/admin/billing/treasury", "/admin/billing/treasury")).toBe(true)
  })
})
