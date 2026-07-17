import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("@/lib/marketing/alkane-details", () => ({ getAlkaneDetails: vi.fn() }))
vi.mock("@/lib/stats", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@/lib/stats")>()
  return { ...actual, getStats: vi.fn() }
})

import { captureSnapshot } from "@/lib/marketing/snapshot"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"
import { getStats, normalizeHomeStats } from "@/lib/stats"
import type { SnapshotTokenBlock } from "@/lib/marketing/types"

const block = (id: string, over: Partial<SnapshotTokenBlock> = {}): SnapshotTokenBlock => ({
  id, name: id, symbol: id, holders: 1, priceUsd: 1, supply: "1", marketcapUsd: 1,
  fdvUsd: 1, volume24hUsd: 1, priceChange24h: 0, priceChange7d: 0, priceChange30d: 0, ...over,
})

beforeEach(() => vi.clearAllMocks())

it("assembles protocol (from getStats) + 3 token blocks + ratios", async () => {
  vi.mocked(getStats).mockResolvedValue(normalizeHomeStats({
    metrics: { alkanesBtcLocked: 99.6, brc20BtcLocked: 1, alkanesBtcLockedAddress: null, brc20BtcLockedAddress: null, alkanesCirculating: null, brc20Circulating: null, alkanesTotalUnwraps: null, brc20TotalUnwraps: null, btcPrice: 62000 },
    marquee: { btcUsd: 62000, btcHeight: 955109, metashrewHeight: 955108, dieselUsd: 70, fireUsd: 55, btcDieselRatio: 885, btcFireRatio: 1127 },
  }))
  vi.mocked(getAlkaneDetails)
    .mockImplementation(async (id: string) => block(id, { holders: id === "2:0" ? 7891 : 955 }))

  const p = await captureSnapshot()
  expect(p.protocol.totalBtcLocked).toBe(100.6)
  expect(p.protocol.btcUsd).toBe(62000)
  expect(p.ratios).toEqual({ btcDiesel: 885, btcFire: 1127 })
  expect(p.tokens.diesel.holders).toBe(7891)
  expect(p.tokens.fire.holders).toBe(955)
  expect(p.tokens.frbtc.id).toBe("32:0")
  expect(p.partial).toBe(false)
  expect(typeof p.capturedAt).toBe("string")
})

it("degrades to a null protocol (partial) when getStats rejects, never throws", async () => {
  vi.mocked(getStats).mockRejectedValue(new Error("db down"))
  vi.mocked(getAlkaneDetails).mockImplementation(async (id: string) => block(id))
  const p = await captureSnapshot()
  expect(p.protocol.btcUsd).toBeNull()
  expect(p.protocol.totalBtcLocked).toBeNull()
  expect(p.ratios).toEqual({ btcDiesel: null, btcFire: null })
  expect(p.partial).toBe(true)
})

it("totalBtcLocked is null and partial true when a token block is all-null", async () => {
  vi.mocked(getStats).mockResolvedValue(normalizeHomeStats({
    metrics: { alkanesBtcLocked: null, brc20BtcLocked: 1, alkanesBtcLockedAddress: null, brc20BtcLockedAddress: null, alkanesCirculating: null, brc20Circulating: null, alkanesTotalUnwraps: null, brc20TotalUnwraps: null, btcPrice: null },
    marquee: { btcUsd: null, btcHeight: null, metashrewHeight: null, dieselUsd: null, fireUsd: null, btcDieselRatio: null, btcFireRatio: null },
  }))
  vi.mocked(getAlkaneDetails).mockImplementation(async (id: string) =>
    id === "2:0" ? block(id, { holders: null, priceUsd: null, name: null }) : block(id))

  const p = await captureSnapshot()
  expect(p.protocol.totalBtcLocked).toBeNull() // alkanes null
  expect(p.partial).toBe(true)                 // diesel block has nulls
})
