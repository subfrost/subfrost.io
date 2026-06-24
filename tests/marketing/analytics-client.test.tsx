import { it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

const push = vi.fn()
vi.mock("next/navigation", () => ({
  useRouter: () => ({ push }),
  useSearchParams: () => new URLSearchParams("range=28d"),
  usePathname: () => "/admin/marketing/analytics",
}))

import { AnalyticsClient } from "@/components/cms/marketing/AnalyticsClient"
import type { AnalyticsDashboard } from "@/lib/analytics/source"

const base: AnalyticsDashboard = {
  range: { start: "28daysAgo", end: "today", preset: "28d" },
  visitors: { points: [{ date: "20260601", activeUsers: 100, sessions: 120, pageViews: 300 }], totals: { activeUsers: 100, sessions: 120, pageViews: 300 } },
  topPages: [{ path: "/articles/foo", title: "Foo", pageViews: 42 }],
  trafficSources: [{ channel: "Organic Search", source: "google", campaign: null, sessions: 200 }],
  articleEngagement: [{ slug: "foo", title: "Foo Article", path: "/articles/foo", pageViews: 40, avgEngagementSeconds: 5 }],
  configured: true,
}

beforeEach(() => { cleanup(); push.mockClear() })

it("renders the four sections with data", () => {
  const { getByText } = render(<AnalyticsClient dashboard={base} />)
  expect(getByText("100")).toBeTruthy()              // active users total chip
  expect(getByText("Organic Search")).toBeTruthy()   // traffic source row
  expect(getByText("Foo")).toBeTruthy()              // top-page title
  expect(getByText("Foo Article")).toBeTruthy()      // article-engagement title
})

it("shows the not-configured banner when configured is false", () => {
  const { getByText } = render(<AnalyticsClient dashboard={{ ...base, configured: false }} />)
  expect(getByText(/not configured/i)).toBeTruthy()
})

it("pushes a new range to the URL when a preset is clicked", () => {
  const { getByText } = render(<AnalyticsClient dashboard={base} />)
  fireEvent.click(getByText("7d"))
  expect(push).toHaveBeenCalledWith("/admin/marketing/analytics?range=7d")
})
