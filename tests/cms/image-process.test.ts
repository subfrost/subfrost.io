import { describe, it, expect } from "vitest"
import sharp from "sharp"
import { processRaster, optBaseName } from "@/lib/cms/image-process"

async function pngOf(w: number, h: number): Promise<Buffer> {
  return sharp({ create: { width: w, height: h, channels: 3, background: { r: 10, g: 20, b: 40 } } }).png().toBuffer()
}

describe("processRaster", () => {
  it("emits avif+webp+fallback for a png, capping width without upscale", async () => {
    const src = await pngOf(2400, 1000)
    const set = await processRaster("image/png", src)
    expect(set).not.toBeNull()
    expect(set!.ext).toBe("png")
    expect(set!.avif.byteLength).toBeGreaterThan(0)
    expect(set!.webp.byteLength).toBeGreaterThan(0)
    const meta = await sharp(set!.avif).metadata()
    expect(meta.width).toBe(1920) // capped
  })
  it("does not upscale a small image", async () => {
    const src = await pngOf(600, 400)
    const set = await processRaster("image/png", src)
    const meta = await sharp(set!.webp).metadata()
    expect(meta.width).toBe(600)
  })
  it("returns null for gif and svg", async () => {
    expect(await processRaster("image/gif", Buffer.from("x"))).toBeNull()
    expect(await processRaster("image/svg+xml", Buffer.from("x"))).toBeNull()
  })
})

describe("optBaseName", () => {
  it("is stable for the same bytes and sanitizes the hint", async () => {
    const buf = await pngOf(10, 10)
    const a = optBaseName("user-1/My Shot!.png", buf)
    const b = optBaseName("user-1/My Shot!.png", buf)
    expect(a).toBe(b)
    expect(a).toMatch(/^[a-z0-9-]+-[0-9a-f]{8}$/i)
  })
})
