import { describe, it, expect, vi } from "vitest"

vi.mock("@/lib/cms/articles", () => ({
  getPublishedArticle: vi.fn(async () => ({
    slug: "why-x", title: "Why X", excerpt: "e", coverImage: "https://x/c.png",
    author: { id: "a", name: "A" }, coAuthors: [], tags: [], availableLocales: ["en"],
    publishedAt: null, updatedAt: null,
  })),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", "subfrost.io"]]),
  cookies: async () => ({ get: () => undefined }),
}))

import { generateMetadata } from "@/app/articles/[slug]/page"

describe("article OG metadata", () => {
  it("points og/twitter image at the per-article opengraph-image route", async () => {
    const meta: any = await generateMetadata({ params: Promise.resolve({ slug: "why-x" }), searchParams: Promise.resolve({}) })
    expect(meta.openGraph.images[0].url).toContain("/articles/why-x/opengraph-image")
    expect(meta.twitter.images[0].url).toContain("/articles/why-x/opengraph-image")
  })
})
