import { describe, it, expect } from "vitest"
import { loadOgLogomark, loadOgFont } from "@/lib/og-assets"

describe("og-assets", () => {
  it("loads the logomark as an svg data url", async () => {
    const url = await loadOgLogomark()
    expect(url.startsWith("data:image/svg+xml;base64,")).toBe(true)
    expect(url.length).toBeGreaterThan(100)
  })
  it("loads the Geist Medium font bytes", async () => {
    const font = await loadOgFont()
    expect(font.byteLength).toBeGreaterThan(10_000)
  })
})
