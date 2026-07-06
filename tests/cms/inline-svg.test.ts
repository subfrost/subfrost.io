import { describe, it, expect } from "vitest"
import { isChartSvg } from "@/lib/cms/image-srcset"

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
