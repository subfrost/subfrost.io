// tests/ecosystem/seed-data.test.ts
import { describe, it, expect } from "vitest"
import seed from "../../scripts/data/ecosystem-seed.json"
import { isValidCategory, isValidStatus, isValidHttpUrl, isValidOptionalHttpUrl } from "@/lib/ecosystem/constants"

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
