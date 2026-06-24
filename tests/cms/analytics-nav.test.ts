import { describe, it, expect } from "vitest"
import { visibleNav } from "@/lib/cms/admin-nav"

it("adds the Site analytics leaf to the Marketing group (gated marketing.view)", () => {
  const groups = visibleNav(["marketing.view"])
  const marketing = groups.find((g) => g.key === "marketing")!
  const hrefs = marketing.items.map((i) => i.href)
  expect(hrefs).toContain("/admin/marketing/snapshots")
  expect(hrefs).toContain("/admin/marketing/analytics")
  expect(visibleNav([]).find((g) => g.key === "marketing")).toBeUndefined()
})
