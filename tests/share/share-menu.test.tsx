import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { ShareMenu } from "@/components/share/ShareMenu"

describe("ShareMenu", () => {
  let writeText: ReturnType<typeof vi.fn>
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    // navigator.clipboard is a getter-only prop in happy-dom — defineProperty, not assign
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
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

  it("localizes to zh", () => {
    const { getByRole, getByText } = render(<ShareMenu url="u" text="t" locale="zh" />)
    fireEvent.click(getByRole("button", { name: /分享/ }))
    expect(getByText("发到 X")).toBeTruthy()
    expect(getByText("复制链接")).toBeTruthy()
  })
})
