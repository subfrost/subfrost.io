import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup, waitFor } from "@testing-library/react"
import LatestArticles from "@/components/articles/LatestArticles"

beforeEach(() => cleanup())

const article = {
  slug: "a",
  title: "Liquidity Weekly",
  excerpt: "Brief.",
  coverImage: null,
  publishedAt: "2026-06-22T12:00:00.000Z",
  readingMinutes: 4,
  author: { name: "Vitor", avatarUrl: null },
  coAuthors: [{ name: "Gabe", avatarUrl: null }],
  tags: [{ slug: "research", name: "Research" }],
}

describe("LatestArticles — co-authors", () => {
  it("renders the author and co-author together", async () => {
    vi.stubGlobal("fetch", vi.fn(async () => ({ ok: true, json: async () => ({ articles: [article] }) })) as never)
    const { getByText } = render(<LatestArticles />)
    await waitFor(() => expect(getByText(/Vitor and Gabe/)).toBeTruthy())
  })
})
