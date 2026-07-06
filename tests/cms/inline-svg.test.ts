import { describe, it, expect } from "vitest"
import { isChartSvg } from "@/lib/cms/image-srcset"
import { extractChartSvgUrls, prepareInlineSvg, buildInlineSvgMap } from "@/lib/cms/inline-svg"
import { vi, beforeEach, afterEach } from "vitest"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("isChartSvg", () => {
  it("accepts our-bucket .svg", () => {
    expect(isChartSvg(`${B}/inline/fig-13-x.svg`)).toBe(true)
    expect(isChartSvg(`${B}/inline/fig-13-x.SVG`)).toBe(true)
  })
  it("rejects our-bucket raster + external svg", () => {
    expect(isChartSvg(`${B}/inline/fig-13-x.opt.png`)).toBe(false)
    expect(isChartSvg("https://imgur.com/x.svg")).toBe(false)
    expect(isChartSvg("")).toBe(false)
  })
})

const SVG = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="currentColor">hi</text></svg>'

describe("extractChartSvgUrls", () => {
  it("returns only our-bucket .svg urls, de-duplicated", () => {
    const md = `![a](${B}/inline/one.svg)\n![b](${B}/inline/two.svg)\n![c](${B}/inline/one.svg)\n![d](${B}/inline/r.opt.png)\n![e](https://x.com/y.svg)`
    expect(extractChartSvgUrls(md)).toEqual([`${B}/inline/one.svg`, `${B}/inline/two.svg`])
  })
})

describe("prepareInlineSvg", () => {
  afterEach(() => vi.restoreAllMocks())
  it("returns sanitized svg on success", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SVG) }))
    const out = await prepareInlineSvg(`${B}/inline/ok.svg`)
    expect(out).toContain("<svg")
    expect(out).toContain("currentColor")
  })
  it("strips <script> from the svg", async () => {
    const evil = '<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script><rect/></svg>'
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(evil) }))
    const out = await prepareInlineSvg(`${B}/inline/evil.svg`)
    expect(out).not.toBeNull()
    expect(out).not.toContain("<script")
  })
  it("returns null when the body is not an svg", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve("<html>nope</html>") }))
    expect(await prepareInlineSvg(`${B}/inline/nope.svg`)).toBeNull()
  })
  it("returns null (never throws) when fetch fails", async () => {
    vi.stubGlobal("fetch", vi.fn().mockRejectedValue(new Error("down")))
    expect(await prepareInlineSvg(`${B}/inline/fail-once.svg`)).toBeNull()
  })
})

describe("buildInlineSvgMap", () => {
  afterEach(() => vi.restoreAllMocks())
  it("resolves each chart svg in the markdown", async () => {
    vi.stubGlobal("fetch", vi.fn().mockResolvedValue({ ok: true, text: () => Promise.resolve(SVG) }))
    const md = `![a](${B}/inline/m1.svg)\n![b](${B}/inline/m2.svg)`
    const map = await buildInlineSvgMap(md)
    expect([...map.keys()].sort()).toEqual([`${B}/inline/m1.svg`, `${B}/inline/m2.svg`])
    expect(map.get(`${B}/inline/m1.svg`)).toContain("<svg")
  })
})
