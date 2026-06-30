// tests/marketing/x-client-transform.test.ts
import { describe, it, expect } from "vitest"
import { extractTweetId, mapApiTweetToPayload, type ApiTweet } from "@/lib/marketing/x-client"

describe("extractTweetId", () => {
  it("extracts from x.com and twitter.com, with query strings", () => {
    expect(extractTweetId("https://x.com/subfrost_news/status/1790000000000000001")).toBe("1790000000000000001")
    expect(extractTweetId("https://twitter.com/foo/status/123?s=20")).toBe("123")
  })
  it("returns null for non-tweet urls and nullish", () => {
    expect(extractTweetId("https://x.com/subfrost_news")).toBeNull()
    expect(extractTweetId(null)).toBeNull()
    expect(extractTweetId(undefined)).toBeNull()
  })
})

describe("mapApiTweetToPayload", () => {
  const cap = "2026-06-30T00:05:00.000Z"
  it("maps public_metrics to our metric names and builds the canonical url", () => {
    const t: ApiTweet = {
      id: "999", text: "gm", created_at: "2026-06-29T12:00:00.000Z",
      public_metrics: { impression_count: 1000, like_count: 10, retweet_count: 3, reply_count: 2, quote_count: 1, bookmark_count: 4 },
    }
    const p = mapApiTweetToPayload(t, cap)
    expect(p.tweetId).toBe("999")
    expect(p.url).toBe("https://x.com/subfrost_news/status/999")
    expect(p.metrics).toEqual({ impressions: 1000, likes: 10, reposts: 3, replies: 2, quotes: 1, bookmarks: 4 })
    expect(p.partial).toBe(false)
    expect(p.capturedAt).toBe(cap)
  })
  it("flags partial when a metric or created_at is missing", () => {
    const t: ApiTweet = { id: "1", text: "x", public_metrics: { like_count: 5 } }
    const p = mapApiTweetToPayload(t, cap)
    expect(p.metrics.impressions).toBeNull()
    expect(p.partial).toBe(true)
    expect(p.postedAt).toBe("")
  })
  it("truncates text to 280 chars", () => {
    const t: ApiTweet = { id: "2", text: "a".repeat(500), created_at: "2026-06-29T00:00:00Z", public_metrics: { impression_count: 1, like_count: 1, retweet_count: 1, reply_count: 1, quote_count: 1, bookmark_count: 1 } }
    expect(mapApiTweetToPayload(t, cap).text).toHaveLength(280)
  })
})
