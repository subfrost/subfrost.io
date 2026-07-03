import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"
import { ImportDocModal } from "@/components/cms/ImportDocModal"

beforeEach(() => cleanup())

const docHtml = `<b style="font-weight:normal" id="docs-internal-guid-x"><h2><span>Heading</span></h2><p><span style="font-weight:700">bold</span></p></b>`

function pasteInto(el: Element, html: string) {
  fireEvent.paste(el, {
    clipboardData: { getData: (t: string) => (t === "text/html" ? html : "") },
  })
}

describe("ImportDocModal", () => {
  it("renders nothing when closed", () => {
    const { queryByRole } = render(<ImportDocModal open={false} onClose={() => {}} onImport={() => {}} />)
    expect(queryByRole("dialog")).toBeNull()
  })

  it("converts pasted Google Docs html into a markdown preview", () => {
    const { getByLabelText, getByText } = render(
      <ImportDocModal open onClose={() => {}} onImport={() => {}} />,
    )
    pasteInto(getByLabelText("Paste your Google Doc here"), docHtml)
    // Preview renders the converted markdown; the heading text is present.
    expect(getByText("Heading")).toBeTruthy()
  })

  it("calls onImport with converted markdown and the chosen mode", () => {
    const onImport = vi.fn()
    const { getByLabelText, getByText } = render(
      <ImportDocModal open onClose={() => {}} onImport={onImport} />,
    )
    pasteInto(getByLabelText("Paste your Google Doc here"), docHtml)
    fireEvent.click(getByText("Replace body"))
    expect(onImport).toHaveBeenCalledWith("## Heading\n\n**bold**", "replace")
  })
})
