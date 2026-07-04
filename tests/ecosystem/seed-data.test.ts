// tests/ecosystem/seed-data.test.ts
import { describe, it, expect } from "vitest"
import seed from "../../scripts/data/ecosystem-seed.json"
import contracts from "../../scripts/data/ecosystem-contracts-seed.json"
import {
  isValidCategory,
  isValidStatus,
  isValidHttpUrl,
  isValidOptionalHttpUrl,
  isValidKind,
  isValidOptionalAlkaneId,
} from "@/lib/ecosystem/constants"

describe("ecosystem seed data", () => {
  it("has 20 entries with unique slugs", () => {
    expect(seed.length).toBe(20)
    expect(new Set(seed.map((p) => p.slug)).size).toBe(20)
  })

  it("every entry is valid", () => {
    for (const p of seed) {
      expect(p.slug, p.slug).toMatch(/^[a-z0-9-]+$/)
      expect(p.name.trim().length, p.slug).toBeGreaterThan(0)
      expect(isValidCategory(p.category), `${p.slug} category`).toBe(true)
      expect(isValidStatus(p.status), `${p.slug} status`).toBe(true)
      expect(isValidHttpUrl(p.url), `${p.slug} url`).toBe(true)
      expect(isValidOptionalHttpUrl(p.xUrl), `${p.slug} xUrl`).toBe(true)
      expect(isValidOptionalHttpUrl(p.docsUrl), `${p.slug} docsUrl`).toBe(true)
      expect(p.descriptionEn.length, `${p.slug} en`).toBeGreaterThan(20)
      expect(p.descriptionZh.length, `${p.slug} zh`).toBeGreaterThan(5)
    }
  })

  it("features exactly SUBFROST and Oyl Wallet", () => {
    expect(seed.filter((p) => p.featured).map((p) => p.slug).sort()).toEqual(["oyl-wallet", "subfrost"])
  })
})

describe("ecosystem contracts seed", () => {
  it("has 8 unique published Contract entries with valid fields", () => {
    expect(contracts.length).toBe(8)
    expect(new Set(contracts.map((p) => p.slug)).size).toBe(8)
    const appSlugs = new Set(seed.map((p) => p.slug))
    for (const p of contracts) {
      expect(appSlugs.has(p.slug), `${p.slug} collides with apps seed`).toBe(false)
      expect(p.kind).toBe("Contract")
      expect(isValidKind(p.kind)).toBe(true)
      expect(isValidOptionalAlkaneId(p.alkaneId), `${p.slug} alkaneId`).toBe(true)
      expect(p.published).toBe(true)
      expect(isValidCategory(p.category), `${p.slug} category`).toBe(true)
      expect(isValidStatus(p.status), `${p.slug} status`).toBe(true)
      expect(isValidHttpUrl(p.url), `${p.slug} url`).toBe(true)
      expect(p.descriptionEn.length, `${p.slug} en`).toBeGreaterThan(20)
      expect(p.descriptionZh.length, `${p.slug} zh`).toBeGreaterThan(5)
    }
  })
  it("pins the canonical alkane ids", () => {
    const ids = Object.fromEntries(contracts.map((p) => [p.slug, p.alkaneId]))
    expect(ids["diesel"]).toBe("2:0")
    expect(ids["frbtc"]).toBe("32:0")
    expect(ids["fire"]).toBe("2:77623")
    expect(ids["busd"]).toBe("2:56801")
    expect(ids["amm-factory"]).toBe("4:65522")
    expect(ids["wunsch-vault"]).toBe("4:777")
    expect(ids["arbuz"]).toBe("2:25349")
    expect(ids["free-mint-factory"]).toBeNull() // id pending research — fill via admin later
  })
})
