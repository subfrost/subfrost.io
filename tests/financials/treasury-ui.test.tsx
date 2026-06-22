import { describe, it, expect, vi } from "vitest"
import { render, screen } from "@testing-library/react"
import { TreasuryManager } from "@/components/cms/financials/TreasuryManager"
import type { TreasuryResult } from "@/actions/cms/financials"

vi.mock("@/actions/cms/financials", () => ({ treasuryOverviewAction: vi.fn() }))

const ok: TreasuryResult = {
  ok: true,
  snapshot: {
    grandTotalUsd: 3100,
    fetchedAt: "2026-06-22T00:00:00Z",
    wallets: [
      { address: "0xAAA", label: "Main", totalUsd: 2000, tokens: [
        { contract: "0xusdt", symbol: "USDT", name: "Tether", amount: 1500, usd: 1500, isNative: false },
        { contract: "0xnative", symbol: "BNB", name: "BNB", amount: 0.8, usd: 500, isNative: true },
      ] },
      { address: "0xBBB", label: "Cold", totalUsd: 1100, tokens: [
        { contract: "0xcake", symbol: "CAKE", name: "PancakeSwap", amount: 300, usd: 700, isNative: false },
        { contract: "0xxrp", symbol: "XRP", name: "XRP", amount: 100, usd: 400, isNative: false },
        { contract: "0xnp", symbol: "NOPR", name: "No Price", amount: 5, usd: null, isNative: false },
      ] },
    ],
  },
}

describe("TreasuryManager", () => {
  it("renders the grand total, per-wallet totals, tokens, and a no-price dash", () => {
    render(<TreasuryManager initial={ok} />)
    expect(screen.getByText(/\$3,100/)).toBeTruthy() // grand total (unique)
    expect(screen.getByText(/\$2,000/)).toBeTruthy() // Main wallet subtotal (per-wallet total restored)
    expect(screen.getByText("USDT")).toBeTruthy()
    expect(screen.getByText("CAKE")).toBeTruthy()
    expect(screen.getByText("Main")).toBeTruthy()
    expect(screen.getByText("Cold")).toBeTruthy()
    expect(screen.getByText("—")).toBeTruthy()       // no-price token rendered as a dash
  })

  it("shows the not-configured state", () => {
    render(<TreasuryManager initial={{ ok: false, error: "not_configured" }} />)
    expect(screen.getByText(/not configured/i)).toBeTruthy()
  })

  it("shows the upstream-error state", () => {
    render(<TreasuryManager initial={{ ok: false, error: "upstream" }} />)
    expect(screen.getByText(/unavailable/i)).toBeTruthy()
  })

  it("shows a cached badge on a stale snapshot", () => {
    const staleResult: TreasuryResult = {
      ok: true,
      stale: true,
      snapshot: { grandTotalUsd: 100, fetchedAt: "2026-06-22T00:00:00Z", wallets: [] },
    }
    render(<TreasuryManager initial={staleResult} />)
    expect(screen.getByText(/cached/i)).toBeTruthy()
  })

  it("shows the unauthorized state", () => {
    render(<TreasuryManager initial={{ ok: false, error: "unauthorized" }} />)
    expect(screen.getByText(/access/i)).toBeTruthy()
  })
})
