import { describe, it, expect } from "vitest"
import { NAV_GROUPS, visibleNav } from "@/lib/cms/admin-nav"

describe("X analytics nav leaf", () => {
  it("is registered in the marketing group, gated by marketing.view", () => {
    const marketing = NAV_GROUPS.find((g) => g.key === "marketing")!
    const leaf = marketing.items.find((i) => i.href === "/admin/marketing/x")
    expect(leaf).toBeDefined()
    expect(leaf!.label).toBe("X analytics")
    expect(leaf!.privilege).toBe("marketing.view")
  })
  it("is visible with marketing.view and hidden without it", () => {
    const withPriv = visibleNav(["marketing.view"]).find((g) => g.key === "marketing")!
    expect(withPriv.items.some((i) => i.href === "/admin/marketing/x")).toBe(true)
    const without = visibleNav([]).find((g) => g.key === "marketing")
    expect(without).toBeUndefined()
  })
})
