import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { PeriodReportChart } from "@/components/cms/financials/PeriodReportChart"

describe("PeriodReportChart", () => {
  it("renders nothing when there are no periods", () => {
    const { container } = render(<PeriodReportChart rows={[]} />)
    expect(container.firstChild).toBeNull()
  })
})
