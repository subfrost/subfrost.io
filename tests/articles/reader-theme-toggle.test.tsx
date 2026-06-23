import { describe, it, expect, beforeEach } from "vitest"
import { render, fireEvent } from "@testing-library/react"
import { ThemeToggle } from "@/components/articles/ThemeToggle"

describe("ThemeToggle", () => {
  beforeEach(() => {
    document.body.innerHTML = '<div id="ed-root" data-ed-theme="light"></div>'
    window.localStorage.clear()
  })

  it("renders a single theme toggle button", () => {
    const { container } = render(<ThemeToggle />)
    expect(container.querySelectorAll("button")).toHaveLength(1)
    expect(container.querySelector("svg")).toBeTruthy()
  })

  it("toggles #ed-root data-ed-theme and persists local preference", () => {
    const { getByRole } = render(<ThemeToggle />)
    fireEvent.click(getByRole("button"))
    expect(document.getElementById("ed-root")!.dataset.edTheme).toBe("dark")
    expect(window.localStorage.getItem("subfrost:editorial-theme")).toBe("dark")
  })

  it("toggles back to light on a second click", () => {
    const { getByRole } = render(<ThemeToggle />)
    fireEvent.click(getByRole("button"))
    fireEvent.click(getByRole("button"))
    expect(document.getElementById("ed-root")!.dataset.edTheme).toBe("light")
  })
})
