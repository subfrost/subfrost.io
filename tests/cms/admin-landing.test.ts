import { describe, it, expect } from "vitest"
import { firstNonArticleLeaf } from "@/lib/cms/admin-nav"

describe("firstNonArticleLeaf", () => {
  it("retorna a 1ª folha não-Articles visível", () => {
    expect(firstNonArticleLeaf(["aml.read"])).toBe("/admin/kyc")
    expect(firstNonArticleLeaf(["fuel.read"])).toBe("/admin/fuel")
  })
  it("retorna null quando só há Articles", () => {
    expect(firstNonArticleLeaf([])).toBeNull()
  })
})
