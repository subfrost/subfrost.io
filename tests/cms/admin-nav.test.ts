import { describe, it, expect } from "vitest"
import { visibleNav, isItemActive, NAV_GROUPS } from "@/lib/cms/admin-nav"
import { ALL_PRIVILEGES } from "@/lib/cms/privileges"

describe("visibleNav", () => {
  it("shows Overview + Articles (both ungated) when there are no privileges", () => {
    const groups = visibleNav([])
    expect(groups.map((g) => g.key)).toEqual(["overview", "articles", "ops"])
    expect(groups.find((g) => g.key === "articles")!.items.map((i) => i.href)).toEqual([
      "/admin/articles", "/admin/articles/new",
    ])
    expect(groups.find((g) => g.key === "overview")!.items.map((i) => i.href)).toEqual(["/admin"])
  })

  it("shows Overview + Articles + Compliance for an AML_VIEW-only user", () => {
    const groups = visibleNav(["aml.read"])
    expect(groups.map((g) => g.key)).toEqual(["overview", "articles", "compliance", "ops"])
    const compliance = groups.find((g) => g.key === "compliance")!
    expect(compliance.items.map((i) => i.href)).toEqual([
      "/admin/kyc", "/admin/fincen", "/admin/mtl",
    ])
  })

  it("shows all 14 groups for ADMIN (all privileges)", () => {
    const groups = visibleNav([...ALL_PRIVILEGES])
    expect(groups.map((g) => g.key)).toEqual([
      "overview", "articles", "board", "documents", "community", "marketing", "ecosystem", "compliance", "billing", "financials", "entities", "legal", "ops", "settings",
    ])
    expect(groups.find((g) => g.key === "board")!.items.map((i) => i.href)).toEqual([
      "/admin/board", "/admin/board/intake", "/admin/board/initiatives", "/admin/board/products",
    ])
    expect(groups.find((g) => g.key === "documents")!.items.map((i) => i.href)).toEqual([
      "/admin/files",
    ])
    expect(groups.find((g) => g.key === "billing")!.items).toHaveLength(10)
    expect(groups.find((g) => g.key === "financials")!.items.map((i) => i.href)).toEqual([
      "/admin/financials/treasury", "/admin/financials/accounting",
      "/admin/financials/cap-table", "/admin/financials/safes", "/admin/financials/balance-sheet",
      "/admin/financials/reconciliation",
    ])
    expect(groups.find((g) => g.key === "entities")!.items.map((i) => i.href)).toEqual(["/admin/entities"])
    expect(groups.find((g) => g.key === "legal")!.items.map((i) => i.href)).toEqual(["/admin/legal"])
  })

  it("never returns a group with zero items", () => {
    for (const g of visibleNav(["fuel.read"])) {
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
  it("keeps Accounting active on a payee profile route", () => {
    expect(isItemActive("/admin/financials/accounting", "/admin/financials/payees/abc123")).toBe(true)
    expect(isItemActive("/admin/financials/accounting", "/admin/financials/accounting")).toBe(true)
    expect(isItemActive("/admin/financials/treasury", "/admin/financials/payees/abc123")).toBe(false)
  })
})
