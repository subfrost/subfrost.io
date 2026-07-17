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
  it("renders the title, excerpt, and body", async () => {
    const { getByText, getByRole } = render(await ArticleView({ article: base, locale: "en" }))
    expect(getByRole("heading", { level: 1 }).textContent).toContain("Liquidity Weekly")
    expect(getByText("A field briefing.")).toBeTruthy()
    expect(getByText("Body text here.")).toBeTruthy()
  })
  it("omits the sources section when sources is empty", async () => {
    const { queryByText } = render(await ArticleView({ article: base, locale: "en" }))
    expect(queryByText("Sources")).toBeNull()
  })
  it("renders an English Sources section when present", async () => {
    const { getByText } = render(await ArticleView({ article: { ...base, sources: "Bitcoin Block Space Weekly, Issue #29" }, locale: "en" }))
    expect(getByText("Sources")).toBeTruthy()
    expect(getByText("Bitcoin Block Space Weekly, Issue #29")).toBeTruthy()
  })
  it("renders a localized label in Chinese", async () => {
    const { getByText } = render(await ArticleView({ article: { ...base, sources: "来源说明" }, locale: "zh" }))
    expect(getByText("来源")).toBeTruthy()
  })

  const author = { id: "u1", name: "Vitor", avatarUrl: null, bio: "Builder of Bitcoin-native things.", twitter: null }

  it("renders the author byline linking to the author page when an author is provided", async () => {
    const { container, getAllByText } = render(await ArticleView({ article: { ...base, author, readingMinutes: 4 }, locale: "en" }))
    expect(container.querySelector('a[href="/authors/u1"]')).toBeTruthy()
    expect(getAllByText("Vitor").length).toBeGreaterThan(0)
  })

  it("renders the author bio card when the author has a bio", async () => {
    const { getByText } = render(await ArticleView({ article: { ...base, author, readingMinutes: 4 }, locale: "en" }))
    expect(getByText("Builder of Bitcoin-native things.")).toBeTruthy()
  })

  it("omits the bio card when the author has no bio but keeps the byline", async () => {
    const { container, queryByText } = render(await ArticleView({ article: { ...base, author: { ...author, bio: null }, readingMinutes: 4 }, locale: "en" }))
    expect(queryByText("Builder of Bitcoin-native things.")).toBeNull()
    expect(container.querySelector('a[href="/authors/u1"]')).toBeTruthy()
  })

  it("renders no author UI when no author is provided (back-compat)", async () => {
    const { container } = render(await ArticleView({ article: base, locale: "en" }))
    expect(container.querySelector('a[href^="/authors/"]')).toBeNull()
  })

  const coAuthor = { id: "u2", name: "Gabe", avatarUrl: null, bio: "Ops and growth.", twitter: null }

  it("renders co-authors in the byline linking to their author pages", async () => {
    const { container, getAllByText } = render(
      await ArticleView({ article: { ...base, author, coAuthors: [coAuthor], readingMinutes: 4 }, locale: "en" }),
    )
    expect(getAllByText("Gabe").length).toBeGreaterThan(0)
    expect(container.querySelector('a[href="/authors/u2"]')).toBeTruthy()
  })

  it("renders a bio card per author and co-author that has a bio", async () => {
    const { getByText } = render(
      await ArticleView({ article: { ...base, author, coAuthors: [coAuthor], readingMinutes: 4 }, locale: "en" }),
    )
    expect(getByText("Builder of Bitcoin-native things.")).toBeTruthy()
    expect(getByText("Ops and growth.")).toBeTruthy()
  })

  it("skips a co-author with no bio but still bylines them", async () => {
    const { container, getByText, queryByText } = render(
      await ArticleView({ article: { ...base, author, coAuthors: [{ ...coAuthor, bio: null }], readingMinutes: 4 }, locale: "en" }),
    )
    expect(getByText("Builder of Bitcoin-native things.")).toBeTruthy()
    expect(queryByText("Ops and growth.")).toBeNull()
    expect(container.querySelector('a[href="/authors/u2"]')).toBeTruthy()
  })
})
