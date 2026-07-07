import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/gcs", () => ({
  uploadOptimizedSet: vi.fn(async () => ({ url: "https://x/covers/base.opt.png" })),
  uploadSvg: vi.fn(async () => ({ url: "https://x/inline/c-10.svg" })),
  uploadImage: vi.fn(async () => ({ url: "https://x/inline/g-3.gif" })),
}))
vi.mock("@/lib/cms/svg-sanitize", () => ({ sanitizeSvg: vi.fn(() => "<svg/>") }))
vi.mock("@/lib/cms/image-process", () => ({
  optBaseName: vi.fn(() => "base"),
  processRaster: vi.fn(async (ct: string) => (ct === "image/gif" ? null : { ext: "png", fallback: Buffer.from(""), avif: Buffer.from(""), webp: Buffer.from("") })),
}))

import { handleUpload } from "@/lib/cms/handle-upload"
import { uploadOptimizedSet, uploadSvg, uploadImage } from "@/lib/cms/gcs"
import { sanitizeSvg } from "@/lib/cms/svg-sanitize"
import { processRaster } from "@/lib/cms/image-process"

beforeEach(() => vi.clearAllMocks())

describe("handleUpload", () => {
  it("sanitizes + stores svg", async () => {
    const r = await handleUpload("inline", "image/svg+xml", Buffer.from("<svg><script/></svg>"), "c")
    expect(sanitizeSvg).toHaveBeenCalled()
    expect(uploadSvg).toHaveBeenCalledWith("inline", "c", "<svg/>")
    expect(r.url).toContain(".svg")
  })
  it("routes a Figma raster-wrapper SVG through the optimized raster set", async () => {
    const png = "iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAAC0lEQVR42mP8z8BQDwAEhQGAhKmMIQAAAABJRU5ErkJggg=="
    const wrapper = `<svg xmlns="http://www.w3.org/2000/svg" xmlns:xlink="http://www.w3.org/1999/xlink"><rect fill="url(#p)"/><defs><pattern id="p" width="1" height="1"><use xlink:href="#i"/></pattern><image id="i" xlink:href="data:image/png;base64,${png}"/></defs></svg>`
    const r = await handleUpload("ecosystem", "image/svg+xml", Buffer.from(wrapper), "logo")
    expect(processRaster).toHaveBeenCalledWith("image/png", expect.any(Buffer))
    expect(uploadOptimizedSet).toHaveBeenCalled()
    expect(sanitizeSvg).not.toHaveBeenCalled()
    expect(uploadSvg).not.toHaveBeenCalled()
    expect(r.url).toBe("https://x/covers/base.opt.png")
  })
  it("transcodes + stores an optimized set for png", async () => {
    const r = await handleUpload("cover", "image/png", Buffer.from("x"), "c")
    expect(uploadOptimizedSet).toHaveBeenCalled()
    expect(r.url).toBe("https://x/covers/base.opt.png")
  })
  it("falls back to raw upload for gif", async () => {
    await handleUpload("inline", "image/gif", Buffer.from("x"), "c")
    expect(uploadImage).toHaveBeenCalled()
  })
  it("rejects buffers over 8MB before any sanitize/transcode/upload call", async () => {
    const big = Buffer.alloc(8 * 1024 * 1024 + 1)
    await expect(handleUpload("cover", "image/png", big, "c")).rejects.toThrow("Image exceeds 8MB limit")
    expect(sanitizeSvg).not.toHaveBeenCalled()
    expect(processRaster).not.toHaveBeenCalled()
    expect(uploadOptimizedSet).not.toHaveBeenCalled()
    expect(uploadSvg).not.toHaveBeenCalled()
    expect(uploadImage).not.toHaveBeenCalled()
  })
})
