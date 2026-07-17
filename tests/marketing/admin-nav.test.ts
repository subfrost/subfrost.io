import { describe, it, expect } from "vitest"
import { visibleNav } from "@/lib/cms/admin-nav"

describe("marketing nav", () => {
  it("includes the Schedule leaf for marketing.view", () => {
    const groups = visibleNav(["marketing.view"])
    const marketing = groups.find((g) => g.key === "marketing")
    expect(marketing?.items.map((i) => i.href)).toContain("/admin/marketing/schedule")
  })

  it("hides marketing entirely without the privilege", () => {
    const groups = visibleNav([])
    expect(groups.find((g) => g.key === "marketing")).toBeUndefined()
  })
})
