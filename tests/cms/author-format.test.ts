import { describe, it, expect } from "vitest"
import { formatAuthorNames } from "@/lib/cms/author-format"

describe("formatAuthorNames", () => {
  it("returns empty string for no names", () => {
    expect(formatAuthorNames([], "en")).toBe("")
  })
  it("returns the single name unchanged", () => {
    expect(formatAuthorNames(["Vitor"], "en")).toBe("Vitor")
  })
  it("joins two names with 'and' in English", () => {
    expect(formatAuthorNames(["Vitor", "Gabe"], "en")).toBe("Vitor and Gabe")
  })
  it("uses an Oxford comma for three or more in English", () => {
    expect(formatAuthorNames(["A", "B", "C"], "en")).toBe("A, B, and C")
  })
  it("joins two names with 和 in Chinese", () => {
    expect(formatAuthorNames(["甲", "乙"], "zh")).toBe("甲 和 乙")
  })
  it("uses 、 separators and 和 before the last name in Chinese", () => {
    expect(formatAuthorNames(["甲", "乙", "丙"], "zh")).toBe("甲、乙 和 丙")
  })
  it("drops empty entries before joining", () => {
    expect(formatAuthorNames(["Vitor", ""], "en")).toBe("Vitor")
  })
})
