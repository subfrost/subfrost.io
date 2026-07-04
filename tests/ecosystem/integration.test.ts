// tests/ecosystem/integration.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// These are wiring assertions on source: cheap, but they catch silent regressions
// (e.g. someone removing the nav link) without rendering the whole shell.
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

describe("ecosystem site wiring", () => {
  it("sticky nav links /ecosystem", () => {
    expect(read("components/StickyNav.tsx")).toContain('href="/ecosystem"')
  })
  it("footer links /ecosystem", () => {
    expect(read("components/Footer.tsx")).toContain('href="/ecosystem"')
  })
  it("editorial SiteHeader links /ecosystem", () => {
    expect(read("components/articles/SiteHeader.tsx")).toContain("/ecosystem")
  })
  it("editorial SiteFooter links /ecosystem", () => {
    expect(read("components/articles/SiteFooter.tsx")).toContain("/ecosystem")
  })
  it("sitemap includes /ecosystem for both locales", () => {
    const src = read("app/sitemap.ts")
    expect(src).toContain('absoluteUrl("/ecosystem")')
    expect(src).toContain('absoluteUrl("/ecosystem?lang=zh")')
  })
  it("middleware treats /ecosystem as an editorial locale path", () => {
    expect(read("middleware.ts")).toContain('pathname === "/ecosystem"')
  })
})
