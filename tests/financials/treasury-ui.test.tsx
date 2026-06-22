import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TreasuryManager } from "@/components/cms/financials/TreasuryManager"
import type { TreasuryResult } from "@/actions/cms/financials"

vi.mock("@/actions/cms/financials", () => ({ treasuryOverviewAction: vi.fn() }))

const ok: TreasuryResult = {
  ok: true,
  snapshot: {
    grandTotalUsd: 2900,
    fetchedAt: "2026-06-22T00:00:00Z",
    wallets: [
      { address: "0xAAA", label: "Main", totalUsd: 2900, tokens: [
        { contract: "0xusdt", symbol: "USDT", name: "Tether", amount: 2000, usd: 2000, isNative: false },
        { contract: "0xnative", symbol: "BNB", name: "BNB", amount: 1.5, usd: 900, isNative: true },
      ] },
    ],
  },
}

describe("TreasuryManager", () => {
  it("renders the grand total and the wallet's tokens", () => {
    render(<TreasuryManager initial={ok} />)
    expect(screen.getByText(/\$2,900/)).toBeTruthy()
    expect(screen.getByText("USDT")).toBeTruthy()
    expect(screen.getByText("BNB")).toBeTruthy()
  })

  it("shows the not-configured state", () => {
    render(<TreasuryManager initial={{ ok: false, error: "not_configured" }} />)
    expect(screen.getByText(/not configured/i)).toBeTruthy()
  })

  it("shows the upstream-error state", () => {
    render(<TreasuryManager initial={{ ok: false, error: "upstream" }} />)
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })
})
