import { describe, it, expect } from "vitest"
import { render, screen } from "@testing-library/react"
import { StatHero } from "@/components/ecosystem/StatHero"
import type { ProjectStats } from "@/lib/ecosystem/stats-types"

const copy = { holders: "Holders", supply: "Supply", price: "Price" }
const stats = (over: Partial<ProjectStats>): ProjectStats => ({
  generic: {
    "2:25349": { name: "ARBUZ", symbol: "ARBUZ", holders: 1234, supply: "100000", priceUsd: 0.0102, marketcapUsd: 2500, volume24hUsd: 19 },
  },
  custom: [
    { key: "jackpot", label: "Tier-5 jackpot", labelZh: "五中头奖池", value: "15.04", unit: "DIESEL" },
    { key: "tickets", label: "Tickets (round / all-time)", value: "42 / 1337" },
  ],
  ...over,
})

describe("StatHero", () => {
  it("renders custom cards first, then generic fill up to 4 cards", () => {
    render(<StatHero stats={stats({})} mainAlkaneId="2:25349" copy={copy} locale="en" />)
    const labels = screen.getAllByTestId("stat-label").map((n) => n.textContent)
    expect(labels).toEqual(["Tier-5 jackpot", "Tickets (round / all-time)", "Holders", "Supply"])
    expect(screen.getByText("15.04 DIESEL")).toBeInTheDocument()
    expect(screen.getByText("1.2k")).toBeInTheDocument() // holders compacto
  })

  it("uses zh labels when locale=zh and labelZh exists", () => {
    render(<StatHero stats={stats({})} mainAlkaneId="2:25349" copy={{ holders: "持有者", supply: "供应量", price: "价格" }} locale="zh" />)
    expect(screen.getByText("五中头奖池")).toBeInTheDocument()
    expect(screen.getByText("Tickets (round / all-time)")).toBeInTheDocument() // sem labelZh → EN
  })

  it("renders nothing when stats null or no cards derivable", () => {
    const { container } = render(<StatHero stats={null} mainAlkaneId="2:25349" copy={copy} locale="en" />)
    expect(container.innerHTML).toBe("")
    const { container: c2 } = render(<StatHero stats={{ generic: {}, custom: [] }} mainAlkaneId={null} copy={copy} locale="en" />)
    expect(c2.innerHTML).toBe("")
  })
})
