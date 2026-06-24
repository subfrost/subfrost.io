import { describe, it, expect } from "vitest"
import { diffSnapshots } from "@/lib/marketing/diff"
import type { SnapshotPayload, SnapshotTokenBlock } from "@/lib/marketing/types"

const tb = (over: Partial<SnapshotTokenBlock>): SnapshotTokenBlock => ({
  id: "2:0", name: "X", symbol: "X", holders: null, priceUsd: null, supply: null,
  marketcapUsd: null, fdvUsd: null, volume24hUsd: null,
  priceChange24h: null, priceChange7d: null, priceChange30d: null, ...over,
})
const pay = (dieselHolders: number | null, btcLocked: number | null): SnapshotPayload => ({
  capturedAt: "t", partial: false,
  protocol: { totalBtcLocked: btcLocked, alkanesBtcLocked: null, brc20BtcLocked: null, btcUsd: null, btcHeight: null, metashrewHeight: null, source: "store" },
  tokens: { diesel: tb({ holders: dieselHolders }), fire: tb({}), frbtc: tb({}) },
  ratios: { btcDiesel: null, btcFire: null },
})

it("computes absolute and percentage deltas", () => {
  const rows = diffSnapshots(pay(100, 50), pay(150, 60))
  const holders = rows.find((r) => r.path === "tokens.diesel.holders")!
  expect(holders.deltaAbs).toBe(50)
  expect(holders.deltaPct).toBeCloseTo(50, 6) // (150-100)/100*100
})

it("is null-safe and avoids divide-by-zero", () => {
  const rows = diffSnapshots(pay(null, 0), pay(10, 5))
  const holders = rows.find((r) => r.path === "tokens.diesel.holders")!
  expect(holders.deltaAbs).toBeNull()  // before null
  expect(holders.deltaPct).toBeNull()
  const locked = rows.find((r) => r.path === "protocol.totalBtcLocked")!
  expect(locked.deltaAbs).toBe(5)
  expect(locked.deltaPct).toBeNull()   // before 0 → no %
})
