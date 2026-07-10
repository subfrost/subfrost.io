import { describe, it, expect } from "vitest"
import { render, screen, fireEvent, within } from "@testing-library/react"
import { ZoomableFigure } from "@/components/articles/ZoomableFigure"

function renderFig() {
  return render(
    <ZoomableFigure alt="the chart">
      <span>FIGURE</span>
    </ZoomableFigure>,
  )
}

const openIt = () => fireEvent.click(screen.getByRole("button", { name: "Enlarge image" }))

describe("ZoomableFigure", () => {
  it("renders the figure with an Enlarge trigger and no overlay initially", () => {
    renderFig()
    expect(screen.getByRole("button", { name: "Enlarge image" })).toBeInTheDocument()
    expect(screen.queryByRole("dialog")).toBeNull()
    // figure rendered once, inside the trigger
    expect(screen.getAllByText("FIGURE")).toHaveLength(1)
  })

  it("opens an overlay dialog on click, showing the same figure enlarged", () => {
    renderFig()
    openIt()
    const dialog = screen.getByRole("dialog", { name: "the chart" })
    expect(dialog).toBeInTheDocument()
    // the figure now exists in both the trigger and the overlay
    expect(screen.getAllByText("FIGURE")).toHaveLength(2)
    expect(within(dialog).getByText("FIGURE")).toBeInTheDocument()
    expect(screen.getByRole("button", { name: "Close enlarged image" })).toBeInTheDocument()
  })

  it("closes on Escape, on a backdrop click, and on the close button", () => {
    renderFig()

    openIt()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(screen.queryByRole("dialog")).toBeNull()

    openIt()
    fireEvent.click(screen.getByRole("dialog"))
    expect(screen.queryByRole("dialog")).toBeNull()

    openIt()
    fireEvent.click(screen.getByRole("button", { name: "Close enlarged image" }))
    expect(screen.queryByRole("dialog")).toBeNull()
  })

  it("stays open when the enlarged figure itself is clicked", () => {
    renderFig()
    openIt()
    const dialog = screen.getByRole("dialog")
    fireEvent.click(within(dialog).getByText("FIGURE"))
    expect(screen.queryByRole("dialog")).not.toBeNull()
  })
})
