import { describe, it, expect } from "vitest"
import fs from "node:fs"
import path from "node:path"

const dataDir = path.join(process.cwd(), "scripts", "data")
const seed = JSON.parse(fs.readFileSync(path.join(dataDir, "ecosystem-profiles.json"), "utf8")) as Array<{
  slug: string
  profileMd?: string
  profileMdZh?: string
  descriptionEn?: string
  descriptionZh?: string
  contracts?: Array<{ label: string; alkaneId: string; noteEn?: string; noteZh?: string }>
}>

describe("ecosystem-profiles seed data", () => {
  it("has unique non-empty slugs", () => {
    const slugs = seed.map((e) => e.slug)
    expect(slugs.every((s) => s && /^[a-z0-9-]+$/.test(s))).toBe(true)
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it("contract rows have labels and canonical alkane ids", () => {
    for (const e of seed) for (const c of e.contracts ?? []) {
      expect(c.label.trim().length).toBeGreaterThan(0)
      expect(c.alkaneId).toMatch(/^\d+:\d+$/)
    }
  })

  it("referenced markdown files exist and are non-trivial", () => {
    for (const e of seed) for (const f of [e.profileMd, e.profileMdZh]) {
      if (!f) continue
      const md = fs.readFileSync(path.join(dataDir, f), "utf8")
      expect(md.length).toBeGreaterThan(500)
      expect(md).not.toMatch(/^# /m) // sem H1 — o header da página já tem o nome
    }
  })

  it("arbuzino entry carries the 6 contracts", () => {
    const arb = seed.find((e) => e.slug === "arbuzino")
    expect(arb?.contracts).toHaveLength(6)
    expect(arb?.contracts?.map((c) => c.alkaneId)).toContain("4:777")
  })
})
