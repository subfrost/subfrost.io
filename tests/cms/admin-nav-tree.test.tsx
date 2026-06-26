import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, fireEvent, cleanup } from "@testing-library/react"

const pathnameMock = vi.fn(() => "/admin/kyc")
vi.mock("next/navigation", () => ({ usePathname: () => pathnameMock() }))

import { AdminNav } from "@/components/cms/AdminNav"
import { ALL_PRIVILEGES } from "@/lib/cms/privileges"

// Every active privilege → every nav group visible. Sourced from the canonical
// list so the test stays in sync as the privilege model evolves (e.g. the
// MANAGE_* → X_VIEW split).
const ALL = [...ALL_PRIVILEGES]

beforeEach(() => {
  cleanup()
  localStorage.clear()
  pathnameMock.mockReturnValue("/admin/kyc")
})

describe("AdminNav", () => {
  it("auto-expands the active group and marks the active leaf with aria-current", () => {
    const { getByText } = render(<AdminNav privileges={ALL} />)
    const kyc = getByText("KYC review")
    expect(kyc.closest("a")?.getAttribute("aria-current")).toBe("page")
  })

  it("keeps non-active groups collapsed (their leaves not rendered)", () => {
    const { queryByText } = render(<AdminNav privileges={ALL} />)
    expect(queryByText("Treasury")).toBeNull()
  })

  it("toggles a group open on header click and sets aria-expanded", () => {
    const { getByRole, queryByText } = render(<AdminNav privileges={ALL} />)
    const billing = getByRole("button", { name: /Billing/ })
    expect(billing.getAttribute("aria-expanded")).toBe("false")
    fireEvent.click(billing)
    expect(billing.getAttribute("aria-expanded")).toBe("true")
    expect(queryByText("Treasury")).not.toBeNull()
  })

  it("persists an explicit toggle and restores it on remount", () => {
    const first = render(<AdminNav privileges={ALL} />)
    fireEvent.click(first.getByRole("button", { name: /Billing/ }))
    expect(JSON.parse(localStorage.getItem("subfrost.adminNav.open")!).billing).toBe(true)
    cleanup()
    const second = render(<AdminNav privileges={ALL} />)
    expect(second.queryByText("Treasury")).not.toBeNull()
  })

  it("calls onNavigate on a leaf click but not on a group toggle", () => {
    const onNavigate = vi.fn()
    const { getByText, getByRole } = render(<AdminNav privileges={ALL} onNavigate={onNavigate} />)
    fireEvent.click(getByRole("button", { name: /Community/ }))
    expect(onNavigate).not.toHaveBeenCalled()
    fireEvent.click(getByText("FUEL"))
    expect(onNavigate).toHaveBeenCalledTimes(1)
  })

  it("marks a collapsed-but-active group header with the active marker", () => {
    const { getByRole } = render(<AdminNav privileges={ALL} />)
    // /admin/kyc lives under Compliance, which auto-expands, so no marker is needed while open.
    const compliance = getByRole("button", { name: /Compliance/ })
    expect(compliance.querySelector("[data-active-marker='true']")).toBeNull()
    // Explicitly collapse the active group: the header surfaces the active marker.
    fireEvent.click(compliance)
    expect(compliance.querySelector("[data-active-marker='true']")).not.toBeNull()
  })
})
