import { describe, it, expect } from "vitest"
import { extractRasterWrapper } from "@/lib/cms/svg-raster-wrapper"

// 1x1 red PNG.
const PNG_B64 =
  "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
const PNG_URI = `data:image/png;base64,${PNG_B64}`
const PNG_BYTES = Buffer.from(PNG_B64, "base64")

// Canonical Figma export: a rect filled by a <pattern> whose only child is a
// <use> pointing at an <image> that carries the base64 raster. DOMPurify strips
// the <use>, orphaning the pattern — this is the shape that renders blank.
const figmaUse = `<svg width="256" height="256" viewBox="0 0 256 256" fill="none" xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink">
<rect width="256" height="256" fill="url(#pat0)"/>
<defs>
<pattern id="pat0" patternContentUnits="objectBoundingBox" width="1" height="1">
<use xlink:href="#image0" transform="scale(0.00390625)"/>
</pattern>
<image id="image0" width="256" height="256" xlink:href="${PNG_URI}"/>
</defs>
</svg>`

// Variant where the <image> lives directly inside the <pattern> (survives
// sanitization, but is still a bloated base64 wrapper worth rasterizing).
const figmaImageInPattern = `<svg width="256" height="256" viewBox="0 0 256 256" xmlns="http://www.w3.org/2000/svg">
<rect width="256" height="256" fill="url(#pat0)"/>
<defs>
<pattern id="pat0" patternContentUnits="objectBoundingBox" width="1" height="1">
<image href="${PNG_URI}" width="1" height="1" preserveAspectRatio="none"/>
</pattern>
</defs>
</svg>`

describe("extractRasterWrapper", () => {
  it("extracts the raster from a Figma <use>+<image> wrapper", () => {
    const out = extractRasterWrapper(figmaUse)
    expect(out).not.toBeNull()
    expect(out!.contentType).toBe("image/png")
    expect(out!.data.equals(PNG_BYTES)).toBe(true)
  })

  it("extracts the raster from an <image>-in-<pattern> wrapper", () => {
    const out = extractRasterWrapper(figmaImageInPattern)
    expect(out).not.toBeNull()
    expect(out!.data.equals(PNG_BYTES)).toBe(true)
  })

  it("detects jpeg content type", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#p)"/><defs><pattern id="p"><image href="data:image/jpeg;base64,${PNG_B64}"/></pattern></defs></svg>`
    const out = extractRasterWrapper(svg)
    expect(out!.contentType).toBe("image/jpeg")
  })

  it("returns null for a pure vector SVG (no embedded raster)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 10 10"><rect width="10" height="10" fill="#123"/><path d="M0 0 L10 10"/></svg>`
    expect(extractRasterWrapper(svg)).toBeNull()
  })

  it("returns null when there is no pattern/use scaffolding", () => {
    // A bare <image> is not a Figma wrapper; the sanitizer already keeps it.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><image href="${PNG_URI}" width="1" height="1"/></svg>`
    expect(extractRasterWrapper(svg)).toBeNull()
  })

  it("returns null when the wrapper also carries real vector drawing", () => {
    // Rasterizing would silently drop the <path> — refuse and keep it an SVG.
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#p)"/><path d="M0 0 L5 5"/><defs><pattern id="p"><image href="${PNG_URI}"/></pattern></defs></svg>`
    expect(extractRasterWrapper(svg)).toBeNull()
  })

  it("returns null when more than one raster is embedded", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#p)"/><defs><pattern id="p"><image href="${PNG_URI}"/><image href="${PNG_URI}"/></pattern></defs></svg>`
    expect(extractRasterWrapper(svg)).toBeNull()
  })

  it("returns null for an unsupported embedded type (gif)", () => {
    const svg = `<svg xmlns="http://www.w3.org/2000/svg"><rect fill="url(#p)"/><defs><pattern id="p"><image href="data:image/gif;base64,${PNG_B64}"/></pattern></defs></svg>`
    expect(extractRasterWrapper(svg)).toBeNull()
  })

  it("returns null for non-SVG / garbage input", () => {
    expect(extractRasterWrapper("not an svg")).toBeNull()
    expect(extractRasterWrapper("")).toBeNull()
  })
})
