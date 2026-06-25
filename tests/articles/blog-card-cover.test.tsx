import { describe, it, expect } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { BlogCardCover } from "@/components/articles/BlogCardCover"

describe("BlogCardCover", () => {
  it("renders the cover image when a coverImage URL is provided", () => {
    const { container } = render(<BlogCardCover coverImage="https://storage.googleapis.com/subfrost-cms/covers/x.png" />)
    const img = container.querySelector("img")
    expect(img).toBeTruthy()
    expect(img!.getAttribute("src")).toBe("https://storage.googleapis.com/subfrost-cms/covers/x.png")
    // a healthy cover never shows the gradient fallback
    expect(container.querySelector("[data-cover-fallback]")).toBeNull()
  })

  it("falls back to the gradient placeholder when the image fails to load", () => {
    // e.g. an imgur album URL that is not a direct image and 404s as an <img>
    const { container } = render(<BlogCardCover coverImage="https://imgur.com/a/zITwwXs" />)
    const img = container.querySelector("img")
    expect(img).toBeTruthy()

    fireEvent.error(img!)

    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("[data-cover-fallback]")).toBeTruthy()
  })

  it("renders the gradient placeholder when coverImage is null", () => {
    const { container } = render(<BlogCardCover coverImage={null} />)
    expect(container.querySelector("img")).toBeNull()
    expect(container.querySelector("[data-cover-fallback]")).toBeTruthy()
  })
})
