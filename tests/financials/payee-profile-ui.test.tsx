import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("@/actions/cms/accounting", () => ({
  payeeProfileAction: vi.fn(),
  updatePayeeAction: vi.fn(),
}))

import { PayeeProfile } from "@/components/cms/financials/PayeeProfile"
import type { PayeeProfile as PayeeProfileData } from "@/lib/financials/accounting/shapes"
import type { LinkableUser } from "@/actions/cms/accounting"

const base: PayeeProfileData = {
  payee: { id: "pe1", name: "Ada", type: "PERSON", kycIntakeId: null, kycCustomerName: null, notes: "vip", userId: null, agreementUrl: null, createdAt: "2026-01-01T00:00:00.000Z" },
  user: null,
  kyc: null,
  invoices: [],
  payments: [],
  totals: { payeeId: "pe1", payeeName: "Ada", invoiceCount: 0, totalUsd: 0, totalDiesel: 0 },
}
const users: LinkableUser[] = [{ id: "u1", name: "Ada Dev", email: "ada@x.io", avatarUrl: null, role: "AUTHOR" }]

beforeEach(() => cleanup())

describe("PayeeProfile", () => {
  it("renders the payee name and the link-user control when unlinked", () => {
    const { getByText, getByRole } = render(<PayeeProfile profile={base} linkableUsers={users} />)
    expect(getByText("Ada")).toBeTruthy()
    expect(getByText(/Link to a team member/i)).toBeTruthy()
    expect(getByRole("link", { name: /Back to Accounting/i })).toBeTruthy()
  })

  it("shows the linked user's details when linked", () => {
    const linked: PayeeProfileData = { ...base, user: { id: "u1", name: "Ada Dev", email: "ada@x.io", avatarUrl: null, bio: "math", twitter: null, status: null, role: "AUTHOR" } }
    const { getByText } = render(<PayeeProfile profile={linked} linkableUsers={users} />)
    expect(getByText("Ada Dev")).toBeTruthy()
    expect(getByText(/Unlink/i)).toBeTruthy()
  })

  it("reveals the edit form when Edit is clicked", () => {
    const { getByText } = render(<PayeeProfile profile={base} linkableUsers={users} />)
    fireEvent.click(getByText("Edit"))
    expect(getByText("Save")).toBeTruthy()
  })
})
