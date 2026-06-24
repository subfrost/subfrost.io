import { describe, it, expect } from "vitest"
import { visibleNav } from "@/lib/cms/admin-nav"

it("shows the Marketing group only with marketing.view", () => {
  const without = visibleNav([]).find((g) => g.key === "marketing")
  expect(without).toBeUndefined()
  const withPriv = visibleNav(["marketing.view"]).find((g) => g.key === "marketing")
  expect(withPriv).toBeDefined()
  expect(withPriv!.items[0].href).toBe("/admin/marketing/snapshots")
})
