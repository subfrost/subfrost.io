import { describe, it, expect } from "vitest"
import { firstNonArticleLeaf } from "@/lib/cms/admin-nav"

describe("firstNonArticleLeaf", () => {
  it("retorna a 1ª folha não-Articles visível", () => {
    // Compliance group now leads with an Overview leaf (/admin/compliance, aml.read).
    expect(firstNonArticleLeaf(["aml.read"])).toBe("/admin/compliance")
    expect(firstNonArticleLeaf(["fuel.read"])).toBe("/admin/fuel")
  })
  it("cai no Pager (ungated) quando não há outra folha visível", () => {
    // The Ops → Pager leaf is intentionally ungated (any admin may raise a page),
    // so a user with no other privileges lands there rather than nowhere.
    expect(firstNonArticleLeaf([])).toBe("/admin/pager")
  })
})
