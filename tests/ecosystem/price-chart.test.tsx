import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { PriceChart, formatUsd } from "@/components/ecosystem/PriceChart"

const copy = { title: "Price (90d)" }
const points = [
  { t: 1783036800, usd: 40.77 },
  { t: 1783123200, usd: 41.2 },
  { t: 1783209600, usd: 41.28 },
]

describe("PriceChart", () => {
  it("renders the section title and a recharts container", () => {
    const { container, getByText } = render(<PriceChart points={points} copy={copy} locale="en" />)
    expect(getByText("Price (90d)")).toBeInTheDocument()
    expect(container.querySelector(".recharts-responsive-container")).toBeTruthy()
  })

  it("renders nothing with fewer than 2 points", () => {
    const { container } = render(<PriceChart points={points.slice(0, 1)} copy={copy} locale="en" />)
    expect(container.firstChild).toBeNull()
  })
})

describe("formatUsd", () => {
  it("formats large, mid and sub-dollar values", () => {
    expect(formatUsd(1234.5)).toBe("$1,235")
    expect(formatUsd(41.283)).toBe("$41.28")
    expect(formatUsd(0.00123456)).toBe("$0.001235")
  })
})
