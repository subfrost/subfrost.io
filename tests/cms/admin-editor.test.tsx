import { describe, it, expect, beforeEach, afterEach, vi } from "vitest"
import { render, cleanup, fireEvent, waitFor } from "@testing-library/react"
import { AdminEditor, type EditorInitial } from "@/components/cms/AdminEditor"
import { saveArticle, translateArticleAction } from "@/actions/cms/articles"

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

describe("AdminEditor -- upload errors", () => {
  afterEach(() => vi.unstubAllGlobals())

  it("surfaces a cover upload failure next to the feature-image control, not only in the footer", async () => {
    const fetchMock = vi.fn().mockRejectedValue(new Error("Upload endpoint unreachable"))
    vi.stubGlobal("fetch", fetchMock)

    const { container, getByText, getByRole } = render(
      <AdminEditor initial={{ ...initial, id: undefined, coverImage: "" }} canPublish />,
    )

    // Selecting a file drives the hidden cover input -> uploadCover -> failing fetch.
    const coverInput = container.querySelector('input[type="file"]') as HTMLInputElement
    const file = new File(["x"], "cover.png", { type: "image/png" })
    fireEvent.change(coverInput, { target: { files: [file] } })

    await waitFor(() =>
      expect(fetchMock).toHaveBeenCalledWith("/api/admin/upload", expect.anything()),
    )

    // The error must render as an alert sitting with the cover control (top of the
    // page), not off-screen in the article footer.
    const alert = await waitFor(() => getByRole("alert"))
    expect(alert).toHaveTextContent("Upload endpoint unreachable")
    expect(getByText("Add feature image").closest("div")).toContainElement(alert)
  })
})

describe("AdminEditor -- AI translation", () => {
  it("saves, translates the active locale into the other, and fills its tab", async () => {
    vi.mocked(saveArticle).mockResolvedValue({ ok: true, slug: "s", id: "a1", authorId: "u1" } as never)
    vi.mocked(translateArticleAction).mockResolvedValue({
      ok: true,
      translation: { title: "标题", excerpt: "摘要", body: "正文", sources: "来源" },
    } as never)

    const { getByRole, findByDisplayValue } = render(<AdminEditor initial={initial} canPublish />)

    fireEvent.click(getByRole("button", { name: /Translate to 中文/i }))

    await waitFor(() => expect(translateArticleAction).toHaveBeenCalledWith("a1", "en", "zh"))
    // the zh tab is now active and shows the translated title
    expect(await findByDisplayValue("标题")).toBeTruthy()
  })

  it("does not offer translation when the active locale has no content", () => {
    const empty: EditorInitial = { ...initial, en: { title: "", excerpt: "", body: "", sources: "" } }
    const { queryByRole } = render(<AdminEditor initial={empty} canPublish />)
    expect(queryByRole("button", { name: /Translate to/i })).toBeNull()
  })

  it("does not offer translation on an unsaved (idless) article", () => {
    const { queryByRole } = render(<AdminEditor initial={{ ...initial, id: undefined }} canPublish />)
    expect(queryByRole("button", { name: /Translate to/i })).toBeNull()
  })

  it("hides the translate button when the translation service is disabled", () => {
    const { queryByRole } = render(<AdminEditor initial={initial} canPublish translationEnabled={false} />)
    expect(queryByRole("button", { name: /Translate to/i })).toBeNull()
  })
})
