import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/cms/articles", () => ({ getPublishedPreviews: vi.fn() }))
vi.mock("@/lib/cms/marketing-pushes", () => ({ getPublishedPushesForFeed: vi.fn() }))

import { GET } from "@/app/feed.xml/route"
import { getPublishedPreviews } from "@/lib/cms/articles"
import { getPublishedPushesForFeed } from "@/lib/cms/marketing-pushes"

beforeEach(() => vi.clearAllMocks())

describe("GET /feed.xml", () => {
  it("returns RSS XML with article + push items", async () => {
    vi.mocked(getPublishedPreviews).mockResolvedValueOnce([
      { slug: "hello", title: "Hello", excerpt: "Hi", publishedAt: "2026-06-27T00:00:00.000Z", coverImage: null } as never,
    ])
    vi.mocked(getPublishedPushesForFeed).mockResolvedValueOnce([
      { id: "p1", title: "Thread", channel: "X", refUrl: "https://x.com/s/1", publishedAt: new Date("2026-06-26T00:00:00Z"), notes: "n", article: null } as never,
    ])
    const res = await GET()
    expect(res.status).toBe(200)
    expect(res.headers.get("content-type")).toContain("application/rss+xml")
    const body = await res.text()
    expect(body).toContain("<title>Hello</title>")
    expect(body).toContain("<title>Thread</title>")
    expect(body).toContain("https://x.com/s/1")
  })
})
