import { describe, it, expect, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { ArticleView } from "@/components/cms/ArticleView"

beforeEach(() => cleanup())

describe("ArticleView", () => {
  const base = {
    title: "Liquidity Weekly",
    excerpt: "A field briefing.",
    body: "Body text here.",
    sources: "",
    publishedAt: "2026-06-22T12:00:00.000Z",
    tags: [{ slug: "research", name: "Research" }],
  }
  it("renders the title, excerpt, and body", () => {
    const { getByText, getByRole } = render(<ArticleView article={base} locale="en" />)
    expect(getByRole("heading", { level: 1 }).textContent).toContain("Liquidity Weekly")
    expect(getByText("A field briefing.")).toBeTruthy()
    expect(getByText("Body text here.")).toBeTruthy()
  })
  it("omits the sources section when sources is empty", () => {
    const { queryByText } = render(<ArticleView article={base} locale="en" />)
    expect(queryByText("Sources")).toBeNull()
  })
  it("renders an English Sources section when present", () => {
    const { getByText } = render(<ArticleView article={{ ...base, sources: "Bitcoin Block Space Weekly, Issue #29" }} locale="en" />)
    expect(getByText("Sources")).toBeTruthy()
    expect(getByText("Bitcoin Block Space Weekly, Issue #29")).toBeTruthy()
  })
  it("renders a localized label in Chinese", () => {
    const { getByText } = render(<ArticleView article={{ ...base, sources: "来源说明" }} locale="zh" />)
    expect(getByText("来源")).toBeTruthy()
  })

  const author = { id: "u1", name: "Vitor", avatarUrl: null, bio: "Builder of Bitcoin-native things.", twitter: null }

  it("renders the author byline linking to the author page when an author is provided", () => {
    const { container, getAllByText } = render(<ArticleView article={{ ...base, author, readingMinutes: 4 }} locale="en" />)
    expect(container.querySelector('a[href="/authors/u1"]')).toBeTruthy()
    expect(getAllByText("Vitor").length).toBeGreaterThan(0)
  })

  it("renders the author bio card when the author has a bio", () => {
    const { getByText } = render(<ArticleView article={{ ...base, author, readingMinutes: 4 }} locale="en" />)
    expect(getByText("Builder of Bitcoin-native things.")).toBeTruthy()
  })

  it("omits the bio card when the author has no bio but keeps the byline", () => {
    const { container, queryByText } = render(<ArticleView article={{ ...base, author: { ...author, bio: null }, readingMinutes: 4 }} locale="en" />)
    expect(queryByText("Builder of Bitcoin-native things.")).toBeNull()
    expect(container.querySelector('a[href="/authors/u1"]')).toBeTruthy()
  })

  it("renders no author UI when no author is provided (back-compat)", () => {
    const { container } = render(<ArticleView article={base} locale="en" />)
    expect(container.querySelector('a[href^="/authors/"]')).toBeNull()
  })
})
