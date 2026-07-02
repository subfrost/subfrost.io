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

beforeEach(() => vi.clearAllMocks())

describe("handleUpload", () => {
  it("sanitizes + stores svg", async () => {
    const r = await handleUpload("inline", "image/svg+xml", Buffer.from("<svg><script/></svg>"), "c")
    expect(sanitizeSvg).toHaveBeenCalled()
    expect(uploadSvg).toHaveBeenCalledWith("inline", "c", "<svg/>")
    expect(r.url).toContain(".svg")
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
})
