import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"

const navigationState = vi.hoisted(() => ({ pathname: "/admin" }))

vi.mock("next/navigation", () => ({ usePathname: () => navigationState.pathname }))
vi.mock("@/actions/cms/auth", () => ({ logout: vi.fn() }))

import { AdminShell } from "@/components/cms/AdminShell"

const user = { name: "Vitor", email: "v@s.io", role: "ADMIN", privileges: [] as string[] }

beforeEach(() => {
  cleanup()
  localStorage.clear()
  navigationState.pathname = "/admin"
})

describe("AdminShell", () => {
  it("renders the brand, the nav tree and its children", () => {
    const { getAllByAltText, getByText } = render(
      <AdminShell user={user}>
        <p>page body</p>
      </AdminShell>,
    )
    // brand appears in desktop sidebar + mobile top bar
    expect(getAllByAltText("subfrost").length).toBeGreaterThanOrEqual(1)
    // pathname is /admin -> the Overview group is active/expanded, rendering Dashboard.
    // The nav renders in both the desktop sidebar and the always-mounted mobile
    // drawer, so Dashboard can appear more than once.
    expect(getAllByText("Dashboard").length).toBeGreaterThanOrEqual(1)
    expect(getByText("page body")).toBeTruthy()
  })

  it("renders the user button (name + role) via UserMenu", () => {
    const { getAllByText } = render(
      <AdminShell user={user}>
        <span>x</span>
      </AdminShell>,
    )
    expect(getAllByText("Vitor").length).toBeGreaterThanOrEqual(1)
    expect(getAllByText("ADMIN").length).toBeGreaterThanOrEqual(1)
  })

  it("uses the immersive shell for article editing", () => {
    navigationState.pathname = "/admin/articles/article-id"

    const { getByText, queryByText, queryAllByText } = render(
      <AdminShell user={user}>
        <p>editor body</p>
      </AdminShell>,
    )

    expect(getByText("editor body")).toBeTruthy()
    expect(queryByText("Dashboard")).toBeNull()
    expect(queryAllByText("SUBFROST")).toHaveLength(0)
  })
})
