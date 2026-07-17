import { describe, it, expect } from "vitest"
import { render } from "@testing-library/react"
import { HealthPanel } from "@/components/cms/DashboardClient"

// Regression for the prod "Application error: Cannot read properties of undefined
// (reading 'map')": a network-health payload that reached the client without an
// endpoints[] array once crashed the whole /admin dashboard. The panel must be
// defensive even if the parent guard ever regresses.
describe("HealthPanel defensive render", () => {
  it("renders without throwing when endpoints is missing", () => {
    const health = { timestamp: "t", comparison: null, healthy: false } as never
    const { container } = render(<HealthPanel health={health} />)
    expect(container.querySelector("table")).toBeTruthy() // renders the empty table, no crash
  })

  it("renders the endpoint rows when endpoints is a normal array", () => {
    const health = {
      timestamp: "t",
      healthy: true,
      comparison: null,
      endpoints: [
        { id: "a", name: "Indexer A", status: "ok", height: 100 },
        { id: "b", name: "Indexer B", status: "ok", height: 99 },
      ],
    } as never
    const { getByText } = render(<HealthPanel health={health} />)
    expect(getByText("Indexer A")).toBeTruthy()
    expect(getByText("Indexer B")).toBeTruthy()
  })
})
