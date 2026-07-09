import { describe, it, expect, vi, afterEach } from "vitest"
import { copyImageToClipboard } from "@/lib/share"

const g = globalThis as unknown as { fetch: unknown; ClipboardItem?: unknown }
const originalFetch = g.fetch
const originalClipboardItem = g.ClipboardItem

afterEach(() => {
  g.fetch = originalFetch
  g.ClipboardItem = originalClipboardItem
  vi.restoreAllMocks()
})

function setClipboardWrite(write: unknown) {
  Object.defineProperty(navigator, "clipboard", { configurable: true, value: { write } })
}

describe("copyImageToClipboard", () => {
  it("returns false when ClipboardItem is unavailable", async () => {
    delete g.ClipboardItem
    setClipboardWrite(vi.fn())
    expect(await copyImageToClipboard("https://x/i.png")).toBe(false)
  })

  it("fetches the PNG and writes it to the clipboard", async () => {
    g.ClipboardItem = class {
      constructor(public data: unknown) {}
    }
    const write = vi.fn().mockResolvedValue(undefined)
    setClipboardWrite(write)
    const blob = new Blob(["x"], { type: "image/png" })
    g.fetch = vi.fn().mockResolvedValue({ ok: true, blob: () => Promise.resolve(blob) })

    expect(await copyImageToClipboard("https://x/i.png")).toBe(true)
    expect(g.fetch).toHaveBeenCalledWith("https://x/i.png")
    expect(write).toHaveBeenCalledTimes(1)
  })

  it("returns false on a failed image fetch and never writes", async () => {
    g.ClipboardItem = class {
      constructor(public data: unknown) {}
    }
    const write = vi.fn().mockResolvedValue(undefined)
    setClipboardWrite(write)
    g.fetch = vi.fn().mockResolvedValue({ ok: false, status: 404 })

    expect(await copyImageToClipboard("https://x/i.png")).toBe(false)
    expect(write).not.toHaveBeenCalled()
  })
})
