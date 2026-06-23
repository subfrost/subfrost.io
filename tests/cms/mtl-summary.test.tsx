import { describe, it, expect, beforeEach } from "vitest"
import { render, cleanup } from "@testing-library/react"
import { mtlStatusCounts } from "@/lib/mtl/schema"
import { MtlStatusSummary } from "@/components/cms/MtlStatusSummary"
import type { MtlRow } from "@/lib/mtl/admin"

const row = (over: Partial<MtlRow>): MtlRow => ({
  state: "CA", name: "California", status: "NOT_YET_NEEDED", nextFilingDue: null,
  portalUrl: null, notes: null, updatedAt: "2026-01-01T00:00:00.000Z", ...over,
})

beforeEach(() => cleanup())

describe("mtlStatusCounts", () => {
  it("zero-fills every status and counts a mixed set", () => {
    const c = mtlStatusCounts([{ status: "REGISTERED" }, { status: "REGISTERED" }, { status: "NEEDS_FILING" }, { status: "EXEMPT" }])
    expect(c.REGISTERED).toBe(2)
    expect(c.NEEDS_FILING).toBe(1)
    expect(c.EXEMPT).toBe(1)
    expect(c.AGENT_OF_STRIPE).toBe(0)
    expect(c.NOT_YET_NEEDED).toBe(0)
    expect(c.FILED_PENDING).toBe(0)
  })
  it("counts an unknown status too", () => {
    expect(mtlStatusCounts([{ status: "WEIRD" }]).WEIRD).toBe(1)
  })
})

describe("MtlStatusSummary", () => {
  it("renders a chip per status with its count", () => {
    const { getByText } = render(
      <MtlStatusSummary entries={[row({ status: "REGISTERED" }), row({ status: "REGISTERED" }), row({ status: "NEEDS_FILING" })]} />,
    )
    // all six labels present
    for (const label of ["Agent of Stripe", "Registered", "Filed — pending", "Exempt", "Not yet needed", "Needs filing"]) {
      expect(getByText(label)).toBeTruthy()
    }
    expect(getByText("2")).toBeTruthy() // REGISTERED count
    expect(getByText("1")).toBeTruthy() // NEEDS_FILING count
  })
})
