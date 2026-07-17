import { describe, it, expect } from "vitest"
import { dwellBySlug, articleSlug } from "@/lib/analytics/dwell"

describe("dwell", () => {
  it("articleSlug extracts the slug", () => {
    expect(articleSlug("/articles/hello-world?x=1")).toBe("hello-world")
    expect(articleSlug("/about")).toBeNull()
  })
  it("dwell = gap to next hit; last hit is a bounce; clamps", () => {
    const t = 1_000_000_000_000
    const session = [
      { path: "/", ts: t },
      { path: "/articles/a", ts: t + 10_000 },        // dwell 5s → b
      { path: "/articles/b", ts: t + 15_000 },        // dwell huge → clamp 1800s
      { path: "/articles/c", ts: t + 9_999_999 },     // last → bounce, skipped
    ]
    const m = dwellBySlug([session])
    expect(m.get("a")).toEqual({ totalMs: 5_000, count: 1 })
    expect(m.get("b")!.totalMs).toBe(1_800_000)
    expect(m.has("c")).toBe(false)
  })
})
