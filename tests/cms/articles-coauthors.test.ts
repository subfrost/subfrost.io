import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/prisma", () => ({
  default: { article: { findMany: vi.fn() } },
}))

import { getPublishedPreviews } from "@/lib/cms/articles"
import prisma from "@/lib/prisma"

const fn = (m: unknown) => vi.mocked(m as never as ReturnType<typeof vi.fn>)
beforeEach(() => vi.clearAllMocks())

const baseRow = {
  slug: "a",
  coverImage: null,
  publishedAt: new Date("2026-06-22T12:00:00.000Z"),
  updatedAt: new Date("2026-06-22T12:00:00.000Z"),
  primaryLocale: "en",
  author: { id: "auth1", name: "Vitor", email: "v@s.io", avatarUrl: null, bio: null, twitter: null },
  tags: [],
  translations: [{ locale: "en", title: "T", excerpt: "E", body: "B", sources: "" }],
}

describe("getPublishedPreviews — coAuthors", () => {
  it("maps coAuthors sorted by name, excluding the primary author", async () => {
    fn(prisma.article.findMany).mockResolvedValue([
      {
        ...baseRow,
        coAuthors: [
          { id: "u3", name: "Zara", email: "z@s.io", avatarUrl: null, bio: null, twitter: null },
          { id: "u2", name: "Gabe", email: "g@s.io", avatarUrl: "/g.png", bio: "bio", twitter: "gabe" },
          { id: "auth1", name: "Vitor", email: "v@s.io", avatarUrl: null, bio: null, twitter: null },
        ],
      },
    ])
    const [preview] = await getPublishedPreviews()
    expect(preview.coAuthors.map((c) => c.name)).toEqual(["Gabe", "Zara"])
    expect(preview.coAuthors[0]).toMatchObject({ id: "u2", avatarUrl: "/g.png", bio: "bio", twitter: "gabe" })
  })

  it("returns an empty coAuthors array when there are none", async () => {
    fn(prisma.article.findMany).mockResolvedValue([{ ...baseRow, coAuthors: [] }])
    const [preview] = await getPublishedPreviews()
    expect(preview.coAuthors).toEqual([])
  })
})
