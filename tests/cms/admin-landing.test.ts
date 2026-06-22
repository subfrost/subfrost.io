import { describe, it, expect } from "vitest"
import { firstNonArticleLeaf } from "@/lib/cms/admin-nav"

describe("firstNonArticleLeaf", () => {
  it("retorna a 1ª folha não-Articles visível", () => {
    expect(firstNonArticleLeaf(["AML_VIEW"])).toBe("/admin/kyc")
    expect(firstNonArticleLeaf(["FUEL_VIEW"])).toBe("/admin/fuel")
  })
  it("retorna null quando só há Articles", () => {
    expect(firstNonArticleLeaf([])).toBeNull()
  })
})
