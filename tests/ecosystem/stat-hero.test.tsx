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

  it("caps at 4 cards even with >4 custom stats and keeps keys stable", () => {
    const many: ProjectStats = {
      generic: {},
      custom: [1, 2, 3, 4, 5].map((i) => ({ key: `c${i}`, label: `Card ${i}`, value: String(i) })),
    }
    render(<StatHero stats={many} mainAlkaneId={null} copy={copy} locale="en" />)
    expect(screen.getAllByTestId("stat-label")).toHaveLength(4)
    expect(screen.queryByText("Card 5")).toBeNull()
  })

  it("drops generic cards whose value is zero or absent", () => {
    // Real production data: wunsch-vault 4:777 reported holders 0 / supply "0" / priceUsd 0,
    // and rendered "HOLDERS 0 / SUPPLY 0 / PRICE $0.0000".
    const { container } = render(
      <StatHero
        stats={{
          generic: { "4:777": { name: null, symbol: null, holders: 0, supply: "0", priceUsd: 0, marketcapUsd: null, volume24hUsd: null } },
          custom: [],
        }}
        mainAlkaneId="4:777"
        copy={copy}
        locale="en"
      />
    )
    expect(container.innerHTML).toBe("")
  })

  it("never renders $0.0000 — a zero price means untraded, not worthless", () => {
    render(
      <StatHero
        stats={{
          generic: { "2:614": { name: null, symbol: null, holders: 12, supply: "10", priceUsd: 0, marketcapUsd: null, volume24hUsd: null } },
          custom: [],
        }}
        mainAlkaneId="2:614"
        copy={copy}
        locale="en"
      />
    )
    const labels = screen.getAllByTestId("stat-label").map((n) => n.textContent)
    expect(labels).toEqual(["Holders", "Supply"])
    expect(screen.queryByText("$0.0000")).not.toBeInTheDocument()
  })

  it("keeps custom cards with a legitimate zero — the guard must not leak into curated stats", () => {
    render(
      <StatHero
        stats={{ generic: {}, custom: [{ key: "jackpot", label: "Tier-5 jackpot", value: "0", unit: "DIESEL" }] }}
        mainAlkaneId={null}
        copy={copy}
        locale="en"
      />
    )
    expect(screen.getByText("0 DIESEL")).toBeInTheDocument()
  })
})

describe("StatHero — trend deltas", () => {
  const genBase = { name: "ARBUZ", symbol: "ARBUZ", priceUsd: 0.01, marketcapUsd: 2500, volume24hUsd: 19 }
  const cur = (): ProjectStats => ({
    generic: { "2:25349": { ...genBase, holders: 1234, supply: "90000" } },
    custom: [
      { key: "jackpot", label: "Tier-5 jackpot", value: "15.04", unit: "DIESEL" },
      { key: "tickets", label: "Tickets (round / all-time)", value: "42 / 1337" },
    ],
  })
  const base = (): ProjectStats => ({
    generic: { "2:25349": { ...genBase, holders: 1000, supply: "100000" } },
    custom: [
      { key: "jackpot", label: "Tier-5 jackpot", value: "12.00", unit: "DIESEL" },
      { key: "tickets", label: "Tickets (round / all-time)", value: "40 / 1300" },
    ],
  })

  it("marks up/down direction and the right % on the comparable cards", () => {
    render(<StatHero stats={cur()} baseline={base()} periodLabel="24h" mainAlkaneId="2:25349" copy={copy} locale="en" />)
    const rows = screen.getAllByTestId("stat-delta")
    const byPct = (pct: string) => rows.find((r) => r.textContent?.includes(pct))
    expect(byPct("23.4%")?.getAttribute("data-direction")).toBe("up")   // holders 1234 vs 1000
    expect(byPct("10.0%")?.getAttribute("data-direction")).toBe("down") // supply 90000 vs 100000
    expect(byPct("25.3%")?.getAttribute("data-direction")).toBe("up")   // jackpot 15.04 vs 12.00
  })

  it("renders a delta row only for numeric cards (tickets excluded)", () => {
    render(<StatHero stats={cur()} baseline={base()} periodLabel="24h" mainAlkaneId="2:25349" copy={copy} locale="en" />)
    // jackpot + holders + supply = 3 rows; tickets ("42 / 1337" → NaN) has none.
    expect(screen.getAllByTestId("stat-delta")).toHaveLength(3)
  })

  it("shows the period label in every delta row", () => {
    render(<StatHero stats={cur()} baseline={base()} periodLabel="24h" mainAlkaneId="2:25349" copy={copy} locale="en" />)
    expect(screen.getAllByTestId("stat-delta").every((r) => r.textContent?.includes("24h"))).toBe(true)
  })

  it("renders no delta rows at all when baseline is absent", () => {
    render(<StatHero stats={cur()} baseline={null} periodLabel={null} mainAlkaneId="2:25349" copy={copy} locale="en" />)
    expect(screen.queryAllByTestId("stat-delta")).toHaveLength(0)
  })
})
