// tests/ecosystem/integration.test.ts
import { describe, it, expect } from "vitest"
import { readFileSync } from "node:fs"
import { join } from "node:path"

// These are wiring assertions on source: cheap, but they catch silent regressions
// (e.g. someone removing the nav link) without rendering the whole shell.
const root = process.cwd()
const read = (p: string) => readFileSync(join(root, p), "utf8")

// The Ecosystem page is soft-launched: reachable via a shared /ecosystem link and now
// linked from both site footers (under "Product"), but still absent from the nav and
// the sitemap until the directory content is finalized. These assertions lock in that
// state; when the page goes fully public, flip the nav/sitemap ones back to `toContain`
// and restore those links too.
describe("ecosystem soft-launch (footer-linked, nav-hidden)", () => {
  it("sticky nav does not link /ecosystem", () => {
    expect(read("components/StickyNav.tsx")).not.toContain('href="/ecosystem"')
  })
  it("homepage footer links /ecosystem", () => {
    expect(read("components/Footer.tsx")).toContain('href="/ecosystem"')
  })
  it("editorial SiteHeader has no ecosystem nav item", () => {
    expect(read("components/articles/SiteHeader.tsx")).not.toContain('id: "ecosystem"')
  })
  it("editorial SiteFooter links /ecosystem", () => {
    expect(read("components/articles/SiteFooter.tsx")).toContain("/ecosystem")
  })
  it("sitemap omits /ecosystem", () => {
    expect(read("app/sitemap.ts")).not.toContain('absoluteUrl("/ecosystem")')
  })
  it("middleware still treats /ecosystem as an editorial locale path (shared ?lang links work)", () => {
    expect(read("middleware.ts")).toContain('pathname === "/ecosystem"')
  })
})
