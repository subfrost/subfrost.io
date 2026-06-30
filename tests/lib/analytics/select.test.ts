import { describe, it, expect, vi, afterEach } from "vitest"

vi.mock("@/lib/analytics/es", () => ({ esSource: { __kind: "es", getDashboard: vi.fn() } }))
vi.mock("@/lib/analytics/ga4", () => ({ ga4Source: { __kind: "ga4", getDashboard: vi.fn() } }))

import { getAnalyticsSource } from "@/lib/analytics/select"

describe("getAnalyticsSource", () => {
  afterEach(() => { vi.unstubAllEnvs() })
  it("defaults to es", () => {
    expect((getAnalyticsSource() as any).__kind).toBe("es")
  })
  it("uses ga4 when ANALYTICS_SOURCE=ga4", () => {
    vi.stubEnv("ANALYTICS_SOURCE", "ga4")
    expect((getAnalyticsSource() as any).__kind).toBe("ga4")
  })
})
