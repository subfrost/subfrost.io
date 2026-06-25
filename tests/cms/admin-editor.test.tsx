import { describe, it, expect, beforeEach, vi } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { AdminEditor, type EditorInitial } from "@/components/cms/AdminEditor"

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

describe("AdminEditor -- sources field", () => {
  it("shows a Sources field bound to the active locale", () => {
    const { getByText, getByDisplayValue } = render(<AdminEditor initial={initial} canPublish />)
    expect(getByText(/Sources/i)).toBeTruthy()
    expect(getByDisplayValue("BBSW #29")).toBeTruthy()
  })

  it("shows a Ghost-style feature image action and plain primary language controls", () => {
    const { getByText, queryByRole } = render(<AdminEditor initial={{ ...initial, id: undefined }} canPublish />)

    expect(getByText("Add feature image")).toBeTruthy()
    expect(getByText("Primary language")).toBeTruthy()
    expect(queryByRole("combobox", { name: /Primary language/i })).toBeNull()
  })
})
