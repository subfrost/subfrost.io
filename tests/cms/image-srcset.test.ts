import { describe, it, expect } from "vitest"
import { pictureSources } from "@/lib/cms/image-srcset"

const B = "https://storage.googleapis.com/subfrost-cms"

describe("pictureSources", () => {
  it("derives avif/webp/fallback for an .opt. bucket url", () => {
    const s = pictureSources(`${B}/inline/foo-ab12cd34.opt.png`)
    expect(s).toEqual({
      avif: `${B}/inline/foo-ab12cd34.opt.avif`,
      webp: `${B}/inline/foo-ab12cd34.opt.webp`,
      fallback: `${B}/inline/foo-ab12cd34.opt.png`,
    })
  })
  it("returns null for non-.opt. urls", () => {
    expect(pictureSources(`${B}/inline/foo-16394.png`)).toBeNull()
  })
  it("returns null for svg and external urls", () => {
    expect(pictureSources(`${B}/inline/chart.svg`)).toBeNull()
    expect(pictureSources(`https://imgur.com/x.opt.png`)).toBeNull()
  })
})
