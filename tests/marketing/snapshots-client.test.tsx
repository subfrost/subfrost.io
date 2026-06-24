import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("next/navigation", () => ({ useRouter: () => ({ refresh: vi.fn() }) }))
vi.mock("@/actions/marketing/snapshots", () => ({
  captureSnapshotAction: vi.fn().mockResolvedValue({ ok: true, value: { id: "s2" } }),
  deleteSnapshotAction: vi.fn().mockResolvedValue({ ok: true }),
}))

import { SnapshotsClient } from "@/components/cms/marketing/SnapshotsClient"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"

const row: SnapshotRow = {
  id: "s1", createdAt: new Date("2026-06-24T12:00:00Z"), label: "before X", context: "X_POST",
  refUrl: null, articleId: null, note: null, createdByName: "Vitor", articleSlug: null,
  payload: { capturedAt: "t", partial: false,
    protocol: { totalBtcLocked: 100.6, alkanesBtcLocked: null, brc20BtcLocked: null, btcUsd: 62000, btcHeight: null, metashrewHeight: null, source: "store" },
    tokens: { diesel: { id: "2:0", name: "DIESEL", symbol: "DIESEL", holders: 7891, priceUsd: 67.45, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null }, fire: { id: "2:77623", name: "FIRE", symbol: "FIRE", holders: 955, priceUsd: 53.7, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null }, frbtc: { id: "32:0", name: "frBTC", symbol: "frBTC", holders: 2246, priceUsd: 51881, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null } },
    ratios: { btcDiesel: 885, btcFire: 1127 } },
}

beforeEach(() => cleanup())

it("renders a row with the label and DIESEL holders", () => {
  const { getByText } = render(<SnapshotsClient snapshots={[row]} articles={[]} />)
  expect(getByText("before X")).toBeTruthy()
  expect(getByText("7,891")).toBeTruthy()
})

it("opens the capture form and submits", async () => {
  const { getByText, getByLabelText } = render(<SnapshotsClient snapshots={[]} articles={[]} />)
  fireEvent.click(getByText("Capture snapshot"))
  fireEvent.change(getByLabelText("Label"), { target: { value: "test" } })
  fireEvent.click(getByText("Capture"))
  const { captureSnapshotAction } = await import("@/actions/marketing/snapshots")
  expect(captureSnapshotAction).toHaveBeenCalled()
})
