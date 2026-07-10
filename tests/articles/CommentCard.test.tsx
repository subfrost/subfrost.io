import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { CommentCard } from "@/components/cms/articles/CommentCard"
import type { Thread } from "@/lib/cms/comment-layout"

function thread(): Thread {
  return {
    root: {
      id: "c1", articleId: "a", versionId: null, locale: "en",
      author: { id: "u", name: "Ada Lovelace", avatarUrl: null },
      anchor: { quote: "the trecho", prefix: "", suffix: "", blockIndex: 0, start: 0, end: 10 },
      body: "needs a citation", status: "OPEN", parentId: null,
      createdAt: "2026-01-01T00:00:00.000Z", updatedAt: "2026-01-01T00:00:00.000Z",
    },
    replies: [],
  }
}

const noop = () => {}

describe("CommentCard", () => {
  it("shows quote + body and, when focused, the resolve composer", () => {
    render(
      <CommentCard thread={thread()} focused dimmed={false} canComment busy={false}
        onFocus={noop} onReply={vi.fn()} onResolve={vi.fn()} onReopen={noop} />,
    )
    expect(screen.getByText(/the trecho/)).toBeInTheDocument()
    expect(screen.getByText("needs a citation")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Resolve" })).toBeInTheDocument()
  })

  it("hides the composer when not focused and applies the focus slide when focused", () => {
    const { rerender, container } = render(
      <CommentCard thread={thread()} focused={false} dimmed canComment busy={false}
        onFocus={noop} onReply={vi.fn()} onResolve={vi.fn()} onReopen={noop} />,
    )
    expect(screen.queryByRole("button", { name: "Resolve" })).toBeNull()
    expect(container.querySelector("[data-comment-card]")?.className).toContain("opacity-60")

    rerender(
      <CommentCard thread={thread()} focused dimmed={false} canComment busy={false}
        onFocus={noop} onReply={vi.fn()} onResolve={vi.fn()} onReopen={noop} />,
    )
    expect(container.querySelector("[data-comment-card]")?.className).toContain("-translate-x-2")
  })
})
