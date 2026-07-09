import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"

// Keep tweetIntentUrl real; stub the image-copy so we can assert it's invoked.
vi.mock("@/lib/share", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/share")>()
  return { ...actual, copyImageToClipboard: vi.fn().mockResolvedValue(true) }
})

import { ShareMenu } from "@/components/share/ShareMenu"
import { copyImageToClipboard } from "@/lib/share"

describe("ShareMenu", () => {
  let writeText: ReturnType<typeof vi.fn>
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    // navigator.clipboard is a getter-only prop in happy-dom — defineProperty, not assign
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
    vi.mocked(copyImageToClipboard).mockClear()
  })

  it("is closed until the trigger is clicked", () => {
    const { queryByRole, getByRole } = render(
      <ShareMenu url="https://subfrost.io/articles/foo" text="Foo @subfrost_news" locale="en" />,
    )
    expect(queryByRole("menu")).toBeNull()
    fireEvent.click(getByRole("button", { name: /share/i }))
    expect(queryByRole("menu")).not.toBeNull()
  })

  it("Post on X links to an intent url carrying the text and page url", () => {
    const { getByRole, getByText } = render(
      <ShareMenu url="https://subfrost.io/articles/foo" text="Foo @subfrost_news" locale="en" />,
    )
    fireEvent.click(getByRole("button", { name: /share/i }))
    const href = getByText("Post on X").closest("a")!.getAttribute("href") ?? ""
    expect(href).toContain("https://twitter.com/intent/tweet")
    expect(href).toContain(encodeURIComponent("Foo @subfrost_news"))
    expect(href).toContain(encodeURIComponent("https://subfrost.io/articles/foo"))
  })

  it("Copy link writes the url to the clipboard", () => {
    const { getByRole, getByText } = render(<ShareMenu url="https://subfrost.io/x" text="t" locale="en" />)
    fireEvent.click(getByRole("button", { name: /share/i }))
    fireEvent.click(getByText("Copy link"))
    expect(writeText).toHaveBeenCalledWith("https://subfrost.io/x")
  })

  it("article variant has no Copy image", () => {
    const { getByRole, queryByText } = render(<ShareMenu url="u" text="t" locale="en" />)
    fireEvent.click(getByRole("button", { name: /share/i }))
    expect(queryByText("Copy image")).toBeNull()
  })

  it("card variant (imageUrl) adds Copy image which copies the PNG", () => {
    const img = "https://subfrost.io/metrics/card/btc-locked"
    const { getByRole, getByText } = render(
      <ShareMenu url={img} imageUrl={img} text="BTC locked: 94.74 BTC @subfrost_news" locale="en" />,
    )
    fireEvent.click(getByRole("button", { name: /share/i }))
    fireEvent.click(getByText("Copy image"))
    expect(copyImageToClipboard).toHaveBeenCalledWith(img)
  })

  it("card Post on X also copies the image (so it can be pasted)", () => {
    const { getByRole, getByText } = render(
      <ShareMenu url="https://subfrost.io/metrics" imageUrl="IMG" text="t @subfrost_news" locale="en" />,
    )
    fireEvent.click(getByRole("button", { name: /share/i }))
    fireEvent.click(getByText("Post on X"))
    expect(copyImageToClipboard).toHaveBeenCalledWith("IMG")
  })

  it("localizes to zh", () => {
    const { getByRole, getByText } = render(<ShareMenu url="u" text="t" locale="zh" />)
    fireEvent.click(getByRole("button", { name: /分享/ }))
    expect(getByText("发到 X")).toBeTruthy()
    expect(getByText("复制链接")).toBeTruthy()
  })
})
