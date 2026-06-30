import { describe, it, expect } from "vitest"
import { resolvePushAnalytics } from "@/lib/cms/marketing-analytics"
import type { ArticleEngagementRow } from "@/lib/analytics/source"

const ga4: ArticleEngagementRow[] = [
  { slug: "eth-on-btc", title: "ETH", path: "/articles/eth-on-btc", pageViews: 2140, avgEngagementSeconds: 104 },
]

describe("resolvePushAnalytics", () => {
  it("uses GA4 for an article push matched by slug", () => {
    const a = resolvePushAnalytics({ channel: "ARTICLE", articleSlug: "eth-on-btc", metrics: null }, ga4)
    expect(a.source).toBe("ga4")
    expect(a.pageViews).toBe(2140)
    expect(a.avgEngagementSeconds).toBe(104)
  })

  it("falls back to manual metrics for an X push", () => {
    const a = resolvePushAnalytics({ channel: "X", articleSlug: null, metrics: { impressions: 38000, likes: 412 } }, ga4)
    expect(a.source).toBe("manual")
    expect(a.impressions).toBe(38000)
    expect(a.likes).toBe(412)
  })

  it("is 'none' when an article push has no GA4 match and no metrics", () => {
    const a = resolvePushAnalytics({ channel: "ARTICLE", articleSlug: "missing", metrics: null }, ga4)
    expect(a.source).toBe("none")
    expect(a.pageViews).toBeNull()
  })

  it("keeps manual metrics alongside GA4 on an article push", () => {
    const a = resolvePushAnalytics({ channel: "ARTICLE", articleSlug: "eth-on-btc", metrics: { likes: 9 } }, ga4)
    expect(a.source).toBe("ga4")
    expect(a.pageViews).toBe(2140)
    expect(a.likes).toBe(9)
  })
})
