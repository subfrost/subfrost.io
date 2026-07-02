import { describe, it, expect } from "vitest"
import { sanitizeSvg } from "@/lib/cms/svg-sanitize"

describe("sanitizeSvg", () => {
  it("keeps legit shapes, text and gradients", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><defs><linearGradient id="g"/></defs><rect width="10" height="10" fill="url(#g)"/><text x="1" y="2">A</text></svg>`
    const out = sanitizeSvg(svg)
    expect(out).toContain("<svg")
    expect(out).toContain("<rect")
    expect(out).toContain("<text")
    expect(out).toContain("linearGradient")
  })
  it("strips <script>, event handlers and foreignObject", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect onload="alert(2)" width="1" height="1"/><foreignObject><body/></foreignObject></svg>`
    const out = sanitizeSvg(svg)
    expect(out).not.toMatch(/<script/i)
    expect(out).not.toMatch(/onload/i)
    expect(out).not.toMatch(/foreignObject/i)
  })
  it("accepts a Buffer", () => {
    const out = sanitizeSvg(Buffer.from(`<svg xmlns="http://www.w3.org/2000/svg"><rect/></svg>`))
    expect(out).toContain("<rect")
  })
})
