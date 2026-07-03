import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"

vi.mock("@/actions/cms/auth", () => ({ logout: vi.fn() }))

import { UserMenu } from "@/components/cms/UserMenu"

beforeEach(() => cleanup())

describe("UserMenu", () => {
  it("shows the user name, role and computed initials", () => {
    const { getByText } = render(<UserMenu name="Vitor Souza" email="v@s.io" role="ADMIN" />)
    expect(getByText("Vitor Souza")).toBeTruthy()
    expect(getByText("ADMIN")).toBeTruthy()
    expect(getByText("VS")).toBeTruthy()
  })

  it("falls back to email initials when name is null", () => {
    const { getByText } = render(<UserMenu name={null} email="rwp@subfrost.io" role="EDITOR" />)
    expect(getByText("RW")).toBeTruthy()
  })

  it("opens the popover with the three account items on click", () => {
    const { getByRole, queryByText, getByText } = render(
      <UserMenu name="Vitor" email="v@s.io" role="ADMIN" />,
    )
    expect(queryByText("Profile")).toBeNull()
    fireEvent.click(getByRole("button", { name: /Vitor/ }))
    expect(getByText("Profile")).toBeTruthy()
    expect(getByText("View articles")).toBeTruthy()
    expect(getByText("Sign out")).toBeTruthy()
  })

  it("prefers status over role when present", () => {
    const { getByText, queryByText } = render(<UserMenu name="Vitor" email="v@s.io" role="ADMIN" status="Shipping articles" />)
    expect(getByText("Shipping articles")).toBeTruthy()
    expect(queryByText("ADMIN")).toBeNull()
  })

  it("renders Sign out as a submit button inside a form", () => {
    const { getByRole, getByText } = render(<UserMenu name="Vitor" email="v@s.io" role="ADMIN" />)
    fireEvent.click(getByRole("button", { name: /Vitor/ }))
    const signOut = getByText("Sign out").closest("button")
    expect(signOut?.getAttribute("type")).toBe("submit")
    expect(signOut?.closest("form")).not.toBeNull()
  })

  it("closes the popover on an outside mousedown", () => {
    const { getByRole, queryByText } = render(<UserMenu name="Vitor" email="v@s.io" role="ADMIN" />)
    fireEvent.click(getByRole("button", { name: /Vitor/ }))
    expect(queryByText("Profile")).not.toBeNull()
    fireEvent.mouseDown(document.body)
    expect(queryByText("Profile")).toBeNull()
  })

  it("closes the popover on Escape", () => {
    const { getByRole, queryByText } = render(<UserMenu name="Vitor" email="v@s.io" role="ADMIN" />)
    fireEvent.click(getByRole("button", { name: /Vitor/ }))
    expect(queryByText("Profile")).not.toBeNull()
    fireEvent.keyDown(document, { key: "Escape" })
    expect(queryByText("Profile")).toBeNull()
  })
})
