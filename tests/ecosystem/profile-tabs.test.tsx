import { describe, it, expect } from "vitest"
import { render, screen, fireEvent } from "@testing-library/react"
import { ProfileTabs } from "@/components/ecosystem/ProfileTabs"

describe("ProfileTabs", () => {
  const tabs = [
    { key: "overview", label: "Overview" },
    { key: "products", label: "Products" },
  ]
  const panels = [<p key="a">panel A</p>, <p key="b">panel B</p>]

  it("renders a tablist with the first tab active", () => {
    render(<ProfileTabs tabs={tabs} panels={panels} />)
    expect(screen.getByRole("tab", { name: "Overview" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("panel A")).toBeInTheDocument()
    expect(screen.queryByText("panel B")).toBeNull()
  })

  it("switches panel on click", () => {
    render(<ProfileTabs tabs={tabs} panels={panels} />)
    fireEvent.click(screen.getByRole("tab", { name: "Products" }))
    expect(screen.getByRole("tab", { name: "Products" })).toHaveAttribute("aria-selected", "true")
    expect(screen.getByText("panel B")).toBeInTheDocument()
    expect(screen.queryByText("panel A")).toBeNull()
  })
})
