import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { AdminEditor, type EditorInitial } from "@/components/cms/AdminEditor"
import { saveArticle } from "@/actions/cms/articles"

vi.mock("@/actions/cms/articles", () => ({
  saveArticle: vi.fn(),
  deleteArticle: vi.fn(),
  translateArticleAction: vi.fn(),
}))

beforeEach(() => cleanup())

const initial: EditorInitial = {
  id: "a1",
  slug: "s",
  coverImage: "",
  tags: [],
  featured: false,
  primaryLocale: "en",
  status: "DRAFT",
  en: { title: "T", excerpt: "", body: "B", sources: "BBSW #29" },
  zh: { title: "", excerpt: "", body: "", sources: "" },
}

describe("AdminEditor -- source controls", () => {
  it("keeps the removed Sources field out of the editor surface", () => {
    const { queryByText, queryByDisplayValue } = render(<AdminEditor initial={initial} canPublish />)
    expect(queryByText(/Sources/i)).toBeNull()
    expect(queryByDisplayValue("BBSW #29")).toBeNull()
  })

  it("shows a Ghost-style feature image action and plain primary language controls", () => {
    const { getByText, queryByRole } = render(<AdminEditor initial={{ ...initial, id: undefined }} canPublish />)

    expect(getByText("Add feature image")).toBeTruthy()
    expect(getByText("Primary language")).toBeTruthy()
    expect(queryByRole("combobox", { name: /Primary language/i })).toBeNull()
  })
})

describe("AdminEditor -- co-authors", () => {
  const members = [
    { id: "u2", name: "Gabe" },
    { id: "u3", name: "Brooks" },
  ]

  it("renders a chip per member and submits the toggled co-author ids", async () => {
    vi.mocked(saveArticle).mockResolvedValue({ ok: true, slug: "s", id: "a1" } as never)
    const { getAllByText, getByRole } = render(
      <AdminEditor initial={{ ...initial, coAuthorIds: [] }} members={members} canPublish />,
    )
    // toggle Gabe on
    fireEvent.click(getByRole("button", { name: "Gabe" }))
    // save draft (there are two "Save draft" buttons — header + sidebar; click the first)
    fireEvent.click(getAllByText("Save draft")[0])
    await waitFor(() => expect(saveArticle).toHaveBeenCalled())
    const payload = vi.mocked(saveArticle).mock.calls[0][0] as { coAuthorIds: string[] }
    expect(payload.coAuthorIds).toEqual(["u2"])
  })

  it("pre-selects existing co-authors from initial.coAuthorIds", () => {
    const { getByRole } = render(
      <AdminEditor initial={{ ...initial, coAuthorIds: ["u3"] }} members={members} canPublish />,
    )
    expect(getByRole("button", { name: "Brooks" }).getAttribute("aria-pressed")).toBe("true")
    expect(getByRole("button", { name: "Gabe" }).getAttribute("aria-pressed")).toBe("false")
  })
})
