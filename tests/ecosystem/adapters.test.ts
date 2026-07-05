import { describe, it, expect, vi } from "vitest"
import { arbuzinoStats } from "@/lib/ecosystem/adapters/arbuzino"
import { ECOSYSTEM_ADAPTERS } from "@/lib/ecosystem/adapters"

describe("arbuzino adapter", () => {
  it("maps pools/tickets/vault into ordered cards (jackpot = pool_5, feeVault = fee_pool)", async () => {
    const simulate = vi.fn(async (target: { block: string; tx: string }, inputs: string[]) => {
      if (target.tx === "257" && inputs[0] === "103") return [15870000n, 5133584000n, 1504966000n, 22218000n]
      if (target.tx === "257" && inputs[0] === "108") return [42n, 1337n]
      if (target.tx === "777" && inputs[0] === "101") return [1000n, 22218000n, 0n]
      return null
    })
    const cards = await arbuzinoStats(simulate as never)
    expect(cards.map((c) => c.key)).toEqual(["jackpot", "tickets", "feeVault"])
    expect(cards[0]).toMatchObject({ value: "15.04", unit: "DIESEL" }) // 1504966000/1e8, truncado 2 casas
    expect(cards[1].value).toBe("42 / 1337")
    expect(cards[2]).toMatchObject({ value: "0.22", unit: "DIESEL" })
    expect(cards.every((c) => c.label && c.labelZh)).toBe(true)
  })

  it("omits cards whose simulate failed; empty when all fail", async () => {
    const partial = vi.fn(async (_t: unknown, inputs: string[]) => (inputs[0] === "108" ? [1n, 2n] : null))
    const cards = await arbuzinoStats(partial as never)
    expect(cards.map((c) => c.key)).toEqual(["tickets"])
    const none = await arbuzinoStats(vi.fn(async () => null) as never)
    expect(none).toEqual([])
  })

  it("is registered by slug", () => {
    expect(ECOSYSTEM_ADAPTERS.arbuzino).toBe(arbuzinoStats)
  })
})
