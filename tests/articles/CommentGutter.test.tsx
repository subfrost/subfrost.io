import { describe, it, expect, vi } from "vitest"
import { render, screen, within } from "@testing-library/react"
import { CommentGutter } from "@/components/cms/articles/CommentGutter"
import type { Thread } from "@/lib/cms/comment-layout"

function thread(id: string, start: number | null, status: Thread["root"]["status"] = "OPEN", body = id): Thread {
  return {
    root: {
      id, articleId: "a", versionId: null, locale: "en",
      author: { id: "u", name: "U", avatarUrl: null },
      anchor: (start == null ? undefined : { quote: id, prefix: "", suffix: "", blockIndex: 0, start, end: start + 1 }) as Thread["root"]["anchor"],
      body, status, parentId: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
    replies: [],
  }
}

const base = {
  focusedId: null,
  onToggleResolved: vi.fn(),
  // Every open thread is measurable; Y mirrors anchor.start for the test.
  measureTop: (id: string) => ({ b: 100, a: 10, c: 40 } as Record<string, number>)[id] ?? null,
  reflowKey: 0,
  canComment: true,
  busy: false,
  onFocus: vi.fn(),
  onReply: vi.fn(),
  onResolve: vi.fn(),
  onReopen: vi.fn(),
}

describe("CommentGutter", () => {
  it("renders open cards in document order", () => {
    render(<CommentGutter {...base} threads={[thread("b", 100), thread("a", 10), thread("c", 40)]} showResolved={false} />)
    const ids = Array.from(document.querySelectorAll("[data-comment-card]")).map((el) => el.getAttribute("data-comment-card"))
    expect(ids).toEqual(["a", "c", "b"])
  })

  it("hides resolved by default and shows them when toggled", () => {
    const threads = [thread("a", 10), thread("r", 5, "RESOLVED", "resolved body")]
    const { rerender } = render(<CommentGutter {...base} threads={threads} showResolved={false} />)
    expect(screen.queryByText("resolved body")).toBeNull()
    rerender(<CommentGutter {...base} threads={threads} showResolved />)
    expect(screen.getByText("resolved body")).toBeInTheDocument()
  })

  it("puts orphaned threads in an Unanchored top section", () => {
    render(<CommentGutter {...base} threads={[thread("a", 10), thread("orph", null, "ORPHANED", "lost body")]} showResolved={false} />)
    const section = screen.getByTestId("gutter-unanchored")
    expect(within(section).getByText("lost body")).toBeInTheDocument()
  })
})
