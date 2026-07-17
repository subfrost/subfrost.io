import { describe, it, expect } from "vitest"
import { selectArticleIndexSections } from "@/lib/cms/articleIndexLayout"

const six = ["a1", "a2", "a3", "a4", "a5", "a6"]

describe("selectArticleIndexSections", () => {
  it("All tab: the grid is the full archive minus the featured lead (old articles must appear)", () => {
    const { featuredLead, latest, feedArticles } = selectArticleIndexSections(six, null)
    expect(featuredLead).toBe("a1")
    expect(latest).toEqual(["a2", "a3", "a4"])
    // regression: pre-fix slice(0, 3) hid a5/a6 (the oldest published articles) forever
    expect(feedArticles).toEqual(["a2", "a3", "a4", "a5", "a6"])
  })

  it("All tab: the featured lead is never duplicated inside the grid", () => {
    const { featuredLead, feedArticles } = selectArticleIndexSections(six, null)
    expect(feedArticles).not.toContain(featuredLead)
  })

  it("topic tabs: the grid is the topic-filtered list", () => {
    const filtered = ["a2", "a5"]
    const { feedArticles } = selectArticleIndexSections(six, filtered)
    expect(feedArticles).toEqual(filtered)
  })

  it("topic tabs: the featured lead is not repeated when the filter includes it", () => {
    const filtered = ["a1", "a2", "a5"] // a1 = featured (renders in the hero above)
    const { feedArticles } = selectArticleIndexSections(six, filtered)
    expect(feedArticles).toEqual(["a2", "a5"])
  })

  it("degrades cleanly with few or no articles", () => {
    expect(selectArticleIndexSections([], null)).toEqual({ featuredLead: null, latest: [], feedArticles: [] })
    expect(selectArticleIndexSections(["only"], null)).toEqual({ featuredLead: "only", latest: [], feedArticles: [] })
  })
})
