import { describe, it, expect, vi, afterEach } from "vitest"
import { render } from "@testing-library/react"

vi.mock("@/lib/cms/inline-svg", async (orig) => ({
  ...(await orig<typeof import("@/lib/cms/inline-svg")>()),
  buildInlineSvgMap: vi.fn(),
}))

import { ArticleView } from "@/components/cms/ArticleView"
import { buildInlineSvgMap } from "@/lib/cms/inline-svg"

const B = "https://storage.googleapis.com/subfrost-cms"
const SAMPLE = '<svg xmlns="http://www.w3.org/2000/svg"><text fill="currentColor">hi</text></svg>'

const article = {
  slug: "t", title: "T", body: `![c](${B}/inline/c.svg)`, sources: "",
  coverImage: null, publishedAt: new Date("2026-07-06"), author: null, tags: [], coAuthors: [],
} as unknown as Parameters<typeof ArticleView>[0]["article"]

describe("ArticleView inline svg", () => {
  afterEach(() => vi.restoreAllMocks())
  it("pre-fetches chart svgs and inlines them", async () => {
    ;(buildInlineSvgMap as unknown as ReturnType<typeof vi.fn>).mockResolvedValue(
      new Map([[`${B}/inline/c.svg`, SAMPLE]]),
    )
    const el = await ArticleView({ article, locale: "en" })
    const { container } = render(el)
    expect(container.querySelector("span.ed-figure svg")).not.toBeNull()
  })
})
