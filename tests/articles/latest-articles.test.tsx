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
  author: { id: "u1", name: "Vitor", avatarUrl: null },
  coAuthors: [{ id: "u2", name: "Gabe", avatarUrl: null }],
  tags: [{ slug: "research", name: "Research" }],
}

describe("LatestArticles — co-authors", () => {
  it("renders the author and co-author together", async () => {
    const { getByText } = render(<LatestArticles articles={[article]} />)
    await waitFor(() => expect(getByText(/Vitor and Gabe/)).toBeTruthy())
  })
})
