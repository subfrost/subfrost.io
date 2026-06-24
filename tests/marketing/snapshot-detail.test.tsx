import { describe, it, expect, vi, beforeEach } from "vitest"
import { render, cleanup, fireEvent } from "@testing-library/react"

vi.mock("@/actions/marketing/snapshots", () => ({ liveSnapshotAction: vi.fn() }))

import { SnapshotDetail } from "@/components/cms/marketing/SnapshotDetail"
import type { SnapshotRow } from "@/lib/marketing/snapshot-store"
import type { SnapshotPayload } from "@/lib/marketing/types"

const payload = (holders: number): SnapshotPayload => ({
  capturedAt: "t", partial: false,
  protocol: { totalBtcLocked: 100, alkanesBtcLocked: null, brc20BtcLocked: null, btcUsd: 62000, btcHeight: null, metashrewHeight: null, source: "store" },
  tokens: {
    diesel: { id: "2:0", name: "DIESEL", symbol: "DIESEL", holders, priceUsd: 67, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null },
    fire: { id: "2:77623", name: "FIRE", symbol: "FIRE", holders: 955, priceUsd: 53, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null },
    frbtc: { id: "32:0", name: "frBTC", symbol: "frBTC", holders: 2246, priceUsd: 51881, supply: "1", marketcapUsd: null, fdvUsd: null, volume24hUsd: null, priceChange24h: null, priceChange7d: null, priceChange30d: null },
  },
  ratios: { btcDiesel: 885, btcFire: 1127 },
})

const row = (id: string, holders: number): SnapshotRow => ({
  id, createdAt: new Date("2026-06-24T12:00:00Z"), label: `snap ${id}`, context: "GENERAL",
  refUrl: null, articleId: null, note: null, createdByName: "Vitor", articleSlug: null, payload: payload(holders),
})

beforeEach(() => cleanup())

it("renders DIESEL holders for the current snapshot", () => {
  const { getByText } = render(<SnapshotDetail snapshot={row("s1", 7891)} others={[]} />)
  expect(getByText("7,891")).toBeTruthy()
})

it("shows deltas when comparing to another snapshot", () => {
  const { getByLabelText, getByText } = render(
    <SnapshotDetail snapshot={row("s1", 7891)} others={[row("s0", 7000)]} />,
  )
  fireEvent.change(getByLabelText("Compare with"), { target: { value: "s0" } })
  // delta on DIESEL holders = 7891 - 7000 = +891
  expect(getByText("+891")).toBeTruthy()
})
