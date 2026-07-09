import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { EmbedDialog } from "@/components/share/EmbedDialog"

const IMG = "https://subfrost.io/metrics/card/opreturn?metric=alkanesTxShare&window=avg7&theme=dark"

describe("EmbedDialog", () => {
  let writeText: ReturnType<typeof vi.fn>
  beforeEach(() => {
    writeText = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, "clipboard", { configurable: true, value: { writeText } })
  })

  it("renders a dialog with the three snippet fields", () => {
    const { getByRole, getByDisplayValue } = render(
      <EmbedDialog imageUrl={IMG} alt="Alkanes tx share" locale="en" onClose={() => {}} />,
    )
    expect(getByRole("dialog")).toBeTruthy()
    expect(getByDisplayValue(`![Alkanes tx share](${IMG})`)).toBeTruthy()
    expect(getByDisplayValue(IMG)).toBeTruthy() // the raw-url field
  })

  it("copies the markdown snippet to the clipboard", () => {
    const { getByRole } = render(
      <EmbedDialog imageUrl={IMG} alt="Alkanes tx share" locale="en" onClose={() => {}} />,
    )
    fireEvent.click(getByRole("button", { name: /copy markdown/i }))
    expect(writeText).toHaveBeenCalledWith(`![Alkanes tx share](${IMG})`)
  })

  it("calls onClose on Escape", () => {
    const onClose = vi.fn()
    render(<EmbedDialog imageUrl={IMG} alt="x" locale="en" onClose={onClose} />)
    fireEvent.keyDown(document, { key: "Escape" })
    expect(onClose).toHaveBeenCalled()
  })

  it("localizes to zh", () => {
    const { getByText } = render(<EmbedDialog imageUrl={IMG} alt="x" locale="zh" onClose={() => {}} />)
    expect(getByText("嵌入")).toBeTruthy()
  })
})
