import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, waitFor } from "@testing-library/react"
import { AnnotatedArticle } from "@/components/cms/articles/AnnotatedArticle"
import { addComment } from "@/actions/cms/articles-review"

vi.mock("@/actions/cms/articles-review", () => ({
  addComment: vi.fn(),
  resolveComment: vi.fn(),
  reopenComment: vi.fn(),
}))

// happy-dom's Range has no layout; the popover only uses the rect for placement.
if (!Range.prototype.getBoundingClientRect) {
  Range.prototype.getBoundingClientRect = () =>
    ({ top: 120, left: 80, width: 40, height: 16, right: 120, bottom: 136, x: 80, y: 120, toJSON: () => ({}) }) as DOMRect
}

function renderArticle() {
  return render(
    <AnnotatedArticle articleId="a1" locale="en" versionId="v1" canComment initialComments={[]} versions={[]}>
      <p>The quick brown fox jumps over the lazy dog</p>
    </AnnotatedArticle>,
  )
}

/** Put a real window selection over `quote` inside the rendered paragraph. */
function selectQuote(container: HTMLElement, quote: string) {
  const textNode = container.querySelector("p")!.firstChild as Text
  const idx = textNode.data.indexOf(quote)
  const range = document.createRange()
  range.setStart(textNode, idx)
  range.setEnd(textNode, idx + quote.length)
  const sel = window.getSelection()!
  sel.removeAllRanges()
  sel.addRange(range)
}

describe("AnnotatedArticle comment popover", () => {
  beforeEach(() => {
    vi.mocked(addComment).mockImplementation(async (input) => ({
      ok: true as const,
      comment: {
        id: "c1",
        articleId: input.articleId,
        versionId: input.versionId ?? null,
        locale: input.locale,
        author: { id: "u1", name: "Reviewer", avatarUrl: null },
        anchor: input.anchor,
        body: input.body,
        status: "OPEN" as const,
        parentId: input.parentId ?? null,
        createdAt: new Date().toISOString(),
        updatedAt: new Date().toISOString(),
      },
    }))
  })

  it("shows the comment popover when article text is selected", () => {
    const { container, queryByPlaceholderText } = renderArticle()
    selectQuote(container, "brown fox")
    fireEvent.mouseUp(document)
    expect(queryByPlaceholderText("Add a comment…")).not.toBeNull()
  })

  it("keeps the popover open while clicking inside it and submits the comment", async () => {
    const { container, getByPlaceholderText, queryByPlaceholderText, getByRole } = renderArticle()
    selectQuote(container, "brown fox")
    fireEvent.mouseUp(document)

    fireEvent.change(getByPlaceholderText("Add a comment…"), { target: { value: "typo here" } })

    // A real click on the "Comment" button starts with a mousedown, which
    // collapses the article selection BEFORE mouseup/click fire. The popover
    // must survive that mouseup or the click never lands.
    const submit = getByRole("button", { name: "Comment" })
    window.getSelection()!.removeAllRanges()
    fireEvent.mouseDown(submit)
    fireEvent.mouseUp(submit)
    expect(queryByPlaceholderText("Add a comment…")).not.toBeNull()

    fireEvent.click(submit)
    await waitFor(() => expect(addComment).toHaveBeenCalledTimes(1))
    expect(vi.mocked(addComment).mock.calls[0][0]).toMatchObject({
      articleId: "a1",
      locale: "en",
      body: "typo here",
      anchor: expect.objectContaining({ quote: "brown fox" }),
    })
    // Popover closes after a successful submit; thread shows up in the panel.
    await waitFor(() => expect(queryByPlaceholderText("Add a comment…")).toBeNull())
  })

  it("dismisses the popover when the selection collapses outside it", () => {
    const { container, queryByPlaceholderText } = renderArticle()
    selectQuote(container, "brown fox")
    fireEvent.mouseUp(document)
    expect(queryByPlaceholderText("Add a comment…")).not.toBeNull()

    window.getSelection()!.removeAllRanges()
    fireEvent.mouseUp(document)
    expect(queryByPlaceholderText("Add a comment…")).toBeNull()
  })
})
