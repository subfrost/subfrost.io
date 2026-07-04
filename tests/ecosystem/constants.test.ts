// tests/ecosystem/constants.test.ts
import { describe, it, expect } from "vitest"
import {
  ECOSYSTEM_CATEGORIES,
  ECOSYSTEM_STATUSES,
  isValidCategory,
  isValidStatus,
  isValidHttpUrl,
  isValidOptionalHttpUrl,
  slugify,
} from "@/lib/ecosystem/constants"

describe("ecosystem constants", () => {
  it("has the curated category list", () => {
    expect(ECOSYSTEM_CATEGORIES).toEqual([
      "DeFi", "Wallet", "Tooling", "Launchpad", "NFT", "Gaming", "Social", "Other",
    ])
  })

  it("validates categories and statuses", () => {
    expect(isValidCategory("DeFi")).toBe(true)
    expect(isValidCategory("defi")).toBe(false)
    expect(isValidStatus("Live")).toBe(true)
    expect(isValidStatus("Dead")).toBe(false)
    expect(ECOSYSTEM_STATUSES).toContain("Building")
  })

  it("validates http(s) URLs only", () => {
    expect(isValidHttpUrl("https://subfrost.io")).toBe(true)
    expect(isValidHttpUrl("http://example.com/a?b=1")).toBe(true)
    expect(isValidHttpUrl("javascript:alert(1)")).toBe(false)
    expect(isValidHttpUrl("ftp://x.com")).toBe(false)
    expect(isValidHttpUrl("not a url")).toBe(false)
  })

  it("treats empty optional URLs as valid, junk as invalid", () => {
    expect(isValidOptionalHttpUrl(null)).toBe(true)
    expect(isValidOptionalHttpUrl(undefined)).toBe(true)
    expect(isValidOptionalHttpUrl("")).toBe(true)
    expect(isValidOptionalHttpUrl("https://x.com/foo")).toBe(true)
    expect(isValidOptionalHttpUrl("javascript:x")).toBe(false)
  })

  it("slugifies names", () => {
    expect(slugify("Oyl Wallet")).toBe("oyl-wallet")
    expect(slugify("alkanes.build")).toBe("alkanes-build")
    expect(slugify("  Pizza.fun!! ")).toBe("pizza-fun")
  })
})
