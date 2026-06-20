import { describe, it, expect, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { ReaderThemeToggle } from "@/components/articles/ReaderThemeToggle"

describe("ReaderThemeToggle", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ed-root" data-ed-theme="light"></div>'
    document.cookie = "ed-theme=; max-age=0; path=/"
  })

  it("renders a single sun-icon button", () => {
    const { container } = render(<ReaderThemeToggle initial="light" />)
    expect(container.querySelectorAll("button")).toHaveLength(1)
    expect(container.querySelector("svg")).toBeTruthy()
  })

  it("toggles #ed-root data-ed-theme and persists a cookie", () => {
    const { getByRole } = render(<ReaderThemeToggle initial="light" />)
    fireEvent.click(getByRole("button"))
    expect(document.getElementById("ed-root")!.dataset.edTheme).toBe("dark")
    expect(document.cookie).toContain("ed-theme=dark")
  })

  it("toggles back to light on a second click", () => {
    const { getByRole } = render(<ReaderThemeToggle initial="light" />)
    fireEvent.click(getByRole("button"))
    fireEvent.click(getByRole("button"))
    expect(document.getElementById("ed-root")!.dataset.edTheme).toBe("light")
  })
})
