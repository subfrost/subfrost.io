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
import { isValidKind, isValidOptionalAlkaneId, ECOSYSTEM_KINDS, alkaneExplorerUrl } from "@/lib/ecosystem/constants"

describe("ecosystem constants", () => {
  it("has the curated category list", () => {
    expect(ECOSYSTEM_CATEGORIES).toEqual([
      "DeFi", "Wallet", "Marketplace", "Tooling", "Launchpad", "NFT", "Gaming", "Social", "Other",
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

describe("kind & alkaneId validators", () => {
  it("accepts exactly App and Contract", () => {
    expect(ECOSYSTEM_KINDS).toEqual(["App", "Contract"])
    expect(isValidKind("App")).toBe(true)
    expect(isValidKind("Contract")).toBe(true)
    expect(isValidKind("Token")).toBe(false)
    expect(isValidKind("")).toBe(false)
  })
  it("builds the explorer URL for an alkane id, colon unescaped", () => {
    expect(alkaneExplorerUrl("2:0")).toBe("https://explorer.subfrost.io/alkane/2:0")
    expect(alkaneExplorerUrl("32:0")).toBe("https://explorer.subfrost.io/alkane/32:0")
    // Guards the one thing a future refactor is likely to "fix": percent-encoding the
    // id would still resolve, but stops matching the explorer's canonical link.
    expect(alkaneExplorerUrl("2:21219")).not.toContain("%3A")
  })

  it("accepts block:tx alkane ids and empty values", () => {
    expect(isValidOptionalAlkaneId("2:0")).toBe(true)
    expect(isValidOptionalAlkaneId("4:65522")).toBe(true)
    expect(isValidOptionalAlkaneId(null)).toBe(true)
    expect(isValidOptionalAlkaneId(undefined)).toBe(true)
    expect(isValidOptionalAlkaneId("")).toBe(true)
    expect(isValidOptionalAlkaneId("2:0x")).toBe(false)
    expect(isValidOptionalAlkaneId("2-0")).toBe(false)
    expect(isValidOptionalAlkaneId("abc")).toBe(false)
    expect(isValidOptionalAlkaneId(" 2:0")).toBe(false)
  })
})
