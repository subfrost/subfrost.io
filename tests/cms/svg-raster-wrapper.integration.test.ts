import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { extractRasterWrapper } from "@/lib/cms/svg-raster-wrapper"
import { processRaster } from "@/lib/cms/image-process"

// End-to-end (no mocks): the raster we pull out of a Figma wrapper must be a real
// image that sharp can decode and transcode, otherwise the "unwrap" path just
// moves the breakage from render-time to upload-time.
describe("extractRasterWrapper → processRaster", () => {
  it("produces a valid avif/webp/png set from a Figma wrapper SVG", async () => {
    const png = (
      await sharp({
        create: { width: 32, height: 32, channels: 4, background: { r: 200, g: 30, b: 30, alpha: 1 } },
      })
        .png()
        .toBuffer()
    ).toString("base64")
    const svg = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect width="32" height="32" fill="url(#p)"/><defs><pattern id="p" patternContentUnits="objectBoundingBox" width="1" height="1"><use xlink:href="#i"/></pattern><image id="i" width="32" height="32" xlink:href="data:image/png;base64,${png}"/></defs></svg>`

    const wrapped = extractRasterWrapper(svg)
    expect(wrapped).not.toBeNull()
    expect(wrapped!.contentType).toBe("image/png")

    const set = await processRaster(wrapped!.contentType, wrapped!.data)
    expect(set).not.toBeNull()
    expect(set!.ext).toBe("png")
    expect(set!.avif.byteLength).toBeGreaterThan(0)
    expect(set!.webp.byteLength).toBeGreaterThan(0)
    expect(set!.fallback.byteLength).toBeGreaterThan(0)

    // The fallback really is a PNG and preserved the 32x32 dimensions.
    const meta = await sharp(set!.fallback).metadata()
    expect(meta.format).toBe("png")
    expect(meta.width).toBe(32)
    expect(meta.height).toBe(32)
  })
})
