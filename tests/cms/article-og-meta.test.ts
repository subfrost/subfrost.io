import { describe, it, expect, vi } from "vitest"

const getPublishedArticle = vi.fn(async () => ({
  slug: "why-x", title: "Why X", excerpt: "e", coverImage: "https://x/c.png",
  author: { id: "a", name: "A" }, coAuthors: [], tags: [], availableLocales: ["en"],
  publishedAt: null, updatedAt: null,
}))
vi.mock("@/lib/cms/articles", () => ({
  getPublishedArticle: (...args: unknown[]) => getPublishedArticle(...(args as [])),
}))
vi.mock("next/headers", () => ({
  headers: async () => new Map([["host", "subfrost.io"]]),
  cookies: async () => ({ get: () => undefined }),
}))

import { generateMetadata } from "@/app/articles/[slug]/page"
import OgImage from "@/app/articles/[slug]/opengraph-image"

describe("article OG metadata", () => {
  it("points og/twitter image at the per-article opengraph-image route", async () => {
    const meta: any = await generateMetadata({ params: Promise.resolve({ slug: "why-x" }), searchParams: Promise.resolve({}) })
    expect(meta.openGraph.images[0].url).toContain("/articles/why-x/opengraph-image")
    expect(meta.twitter.images[0].url).toContain("/articles/why-x/opengraph-image")
  })
})

describe("article OG image route", () => {
  it("queries the real DB (previewFallback: false) on a production host, not the hardcoded seed fallback", async () => {
    getPublishedArticle.mockClear()
    await OgImage({ params: Promise.resolve({ slug: "why-x" }) })
    expect(getPublishedArticle).toHaveBeenCalledWith("why-x", "en", { previewFallback: false })
  })
})
