import { describe, it, expect } from "vitest"
import { classifyChannel } from "@/lib/analytics/channel"

describe("classifyChannel", () => {
  it("direct when no referer/utm", () => expect(classifyChannel(null, null, null)).toBe("direct"))
  it("organic for search engines", () => expect(classifyChannel("https://www.google.com/search?q=x", null, null)).toBe("organic"))
  it("social for x.com / t.co", () => {
    expect(classifyChannel("https://x.com/sub", null, null)).toBe("social")
    expect(classifyChannel("https://t.co/abc", null, null)).toBe("social")
  })
  it("referral for other hosts", () => expect(classifyChannel("https://news.ycombinator.com/", null, null)).toBe("referral"))
  it("utm overrides", () => {
    expect(classifyChannel("https://x.com/s", "twitter", "social")).toBe("social")
    expect(classifyChannel(null, "newsletter", null)).toBe("referral:newsletter")
  })
})
