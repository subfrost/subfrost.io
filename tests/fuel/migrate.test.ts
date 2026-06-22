import { describe, it, expect, vi } from "vitest"
import { parseFuelDump, migrateFuelAllocations } from "@/lib/fuel/migrate"
import type { FuelEntry } from "@/lib/fuel/admin"

describe("parseFuelDump", () => {
  it("maps a JSON array of source rows to FuelEntry[] (ignoring id/timestamps)", () => {
    const json = JSON.stringify([
      { id: "x", address: "addrA", amount: 100, note: "hi", created_at: "2026-02-09T00:00:00.000Z", updated_at: null },
      { id: "y", address: "addrB", amount: 50.005, note: null },
    ])
    expect(parseFuelDump(json)).toEqual([
      { address: "addrA", amount: 100, note: "hi" },
      { address: "addrB", amount: 50.005, note: null },
    ])
  })

  it("treats a missing note as null", () => {
    expect(parseFuelDump(JSON.stringify([{ address: "a", amount: 1 }]))[0].note).toBeNull()
  })

  it("throws on non-array JSON", () => {
    expect(() => parseFuelDump(JSON.stringify({ address: "a" }))).toThrow()
  })

  it("throws on malformed JSON", () => {
    expect(() => parseFuelDump("{not json")).toThrow()
  })
})

describe("migrateFuelAllocations", () => {
  it("chunks entries into <=chunkSize and sums the upsert counts", async () => {
    const entries: FuelEntry[] = Array.from({ length: 1100 }, (_, i) => ({
      address: `addr${i}`, amount: i, note: null,
    }))
    const upsert = vi.fn(async (chunk: FuelEntry[]) => ({ count: chunk.length }))
    const res = await migrateFuelAllocations(entries, { chunkSize: 500, upsert })
    expect(upsert).toHaveBeenCalledTimes(3)
    expect(upsert.mock.calls.map((c) => c[0].length)).toEqual([500, 500, 100])
    expect(res).toEqual({ total: 1100, chunks: 3 })
  })

  it("returns zero and never calls upsert for empty input", async () => {
    const upsert = vi.fn(async (c: FuelEntry[]) => ({ count: c.length }))
    const res = await migrateFuelAllocations([], { chunkSize: 500, upsert })
    expect(upsert).not.toHaveBeenCalled()
    expect(res).toEqual({ total: 0, chunks: 0 })
  })

  it("passes entries through to upsert unchanged", async () => {
    const captured: FuelEntry[] = []
    const upsert = vi.fn(async (c: FuelEntry[]) => { captured.push(...c); return { count: c.length } })
    const entries: FuelEntry[] = [{ address: "a", amount: 1, note: "n" }]
    await migrateFuelAllocations(entries, { upsert })
    expect(captured).toEqual(entries)
  })
})
