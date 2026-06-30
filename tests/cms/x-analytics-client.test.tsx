// tests/cms/x-analytics-client.test.tsx
import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { XAnalyticsClient } from "@/components/cms/marketing/XAnalyticsClient"
import type { XPostTableRow, AttributionRow, XCurvePoint } from "@/lib/marketing/x-series"
import type { SeriesPoint } from "@/lib/marketing/protocol-series"

const post: XPostTableRow = {
  tweetId: "999", url: "https://x.com/subfrost_news/status/999", postedAt: "2026-06-29T00:00:00Z",
  text: "Alkanes by the numbers", metrics: { impressions: 1000, likes: 50, reposts: 10, replies: 5, quotes: 2, bookmarks: 8 },
  engagementRate: 0.075, capturedAt: "2026-06-30T00:05:00Z",
}
const attribution: AttributionRow[] = [{
  tweetId: "999", url: post.url, postedAt: post.postedAt, text: post.text, engagementRate: 0.075, impressions: 1000,
  holders: { d1: 5, d3: 12, d7: 30 }, btcLocked: { d1: 1, d3: 2, d7: 4 },
}]
const curves: Record<string, XCurvePoint[]> = { "999": [{ date: "2026-06-29", impressions: 800, likes: 40, reposts: 8, replies: 4, quotes: 1, bookmarks: 5 }] }
const series: SeriesPoint[] = []

describe("XAnalyticsClient", () => {
  it("shows the not-configured banner and empty state when no posts", () => {
    render(<XAnalyticsClient posts={[]} curves={{}} attribution={[]} protocolSeries={series} configured={false} />)
    expect(screen.getByText(/X API não configurada/i)).toBeInTheDocument()
  })

  it("renders the post table in the Performance view", () => {
    render(<XAnalyticsClient posts={[post]} curves={curves} attribution={attribution} protocolSeries={series} configured />)
    expect(screen.getByText("Alkanes by the numbers")).toBeInTheDocument()
    expect(screen.getAllByText("1,000")).toHaveLength(3)
  })

  it("switches to the Attribution view and shows the caveat + deltas", () => {
    render(<XAnalyticsClient posts={[post]} curves={curves} attribution={attribution} protocolSeries={series} configured />)
    fireEvent.click(screen.getByRole("button", { name: /Atribuição/i }))
    expect(screen.getByText(/sinal, não prova/i)).toBeInTheDocument()
    expect(screen.getByText("+12")).toBeInTheDocument() // holders d3
  })
})
