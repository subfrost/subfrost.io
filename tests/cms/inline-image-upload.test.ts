import { describe, it, expect, vi } from "vitest"
import { uploadInlineImage } from "@/lib/cms/inline-image-upload"

const file = new File([new Uint8Array([1, 2, 3])], "shot.png", { type: "image/png" })

describe("uploadInlineImage", () => {
  it("POSTs to /api/admin/upload with kind=inline and returns the url", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ url: "https://x/img.png" }), { status: 200 })) as unknown as typeof fetch
    const url = await uploadInlineImage(file, fetchImpl)
    expect(url).toBe("https://x/img.png")
    const [path, init] = vi.mocked(fetchImpl).mock.calls[0]
    expect(path).toBe("/api/admin/upload")
    const body = (init as RequestInit).body as FormData
    expect(body.get("kind")).toBe("inline")
    expect(body.get("file")).toBeInstanceOf(File)
  })
  it("throws the server error message on a non-2xx response", async () => {
    const fetchImpl = vi.fn(async () => new Response(JSON.stringify({ error: "Image exceeds 8MB limit" }), { status: 400 })) as unknown as typeof fetch
    await expect(uploadInlineImage(file, fetchImpl)).rejects.toThrow("Image exceeds 8MB limit")
  })
})
