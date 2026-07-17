import { describe, it, expect } from "vitest"
import { visibleNav, NAV_GROUPS } from "@/lib/cms/admin-nav"

it("shows the Marketing group only with marketing.view", () => {
  const without = visibleNav([]).find((g) => g.key === "marketing")
  expect(without).toBeUndefined()
  const withPriv = visibleNav(["marketing.view"]).find((g) => g.key === "marketing")
  expect(withPriv).toBeDefined()
  expect(withPriv!.items[0].href).toBe("/admin/marketing/snapshots")
})

it("exposes the Stat cards leaf under Marketing gated by marketing.view", () => {
  const mk = NAV_GROUPS.find((g) => g.key === "marketing")!
  const leaf = mk.items.find((i) => i.href === "/admin/marketing/cards")
  expect(leaf).toBeTruthy()
  expect(leaf!.privilege).toBe("marketing.view")
})
