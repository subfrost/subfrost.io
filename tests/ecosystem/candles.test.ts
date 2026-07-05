// tests/ecosystem/candles.test.ts
import { describe, it, expect, vi, beforeEach } from "vitest"

vi.mock("next/cache", () => ({ unstable_cache: (fn: unknown) => fn }))
vi.mock("@/lib/prisma", () => ({
  prisma: { ecosystemProject: { findFirst: vi.fn() } },
}))

import { prisma } from "@/lib/prisma"
import { fetchDailyCandles, resolveDailyCandles, getEcosystemPriceSeries } from "@/lib/ecosystem/candles"

// Fixture REAL (probe 2026-07-05, pool 2:0-usd, timeframe 1d): newest-first, USD = close/1e16.
const espoCandles = [
  { close: "412823201468700598", ts: 1783209600 },
  { close: "412051905620438636", ts: 1783123200 },
  { close: "407722114691735040", ts: 1783036800 },
]

function espoOk(candles: unknown[]) {
  return {
    ok: true,
    json: async () => ({ jsonrpc: "2.0", result: { candles, ok: true }, id: 1 }),
  } as unknown as Response
}

beforeEach(() => vi.clearAllMocks())

describe("fetchDailyCandles", () => {
  it("parses, scales by 1e16 and sorts oldest→newest", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(espoOk(espoCandles))
    const points = await fetchDailyCandles("2:0-usd", fetchImpl as never)
    expect(points.map((p) => p.t)).toEqual([1783036800, 1783123200, 1783209600])
    expect(points[2].usd).toBeCloseTo(41.28232, 4)
    const body = JSON.parse(fetchImpl.mock.calls[0][1].body)
    expect(body.method).toBe("ammdata.get_candles")
    expect(body.params).toMatchObject({ pool: "2:0-usd", timeframe: "1d", side: "base", limit: 90, page: 1 })
  })

  it("skips candles with a missing/non-numeric close or missing ts", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(espoOk([
      { close: "not-a-number", ts: 1783036800 },
      { close: "412823201468700598" }, // sem ts
      { close: "412823201468700598", ts: 1783209600 },
    ]))
    const points = await fetchDailyCandles("2:0-usd", fetchImpl as never)
    expect(points).toHaveLength(1)
    expect(points[0].t).toBe(1783209600)
    expect(points[0].usd).toBeCloseTo(41.28232, 4)
  })

  it("throws on a non-2xx answer", async () => {
    const fetchImpl = vi.fn().mockResolvedValue({ ok: false, status: 502 } as never)
    await expect(fetchDailyCandles("2:0-usd", fetchImpl as never)).rejects.toThrow("502")
  })
})

describe("resolveDailyCandles", () => {
  it("uses the direct pool when it has candles", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(espoOk(espoCandles))
    const points = await resolveDailyCandles("2:0", fetchImpl as never)
    expect(points).toHaveLength(3)
    expect(fetchImpl).toHaveBeenCalledTimes(1)
    expect(JSON.parse(fetchImpl.mock.calls[0][1].body).params.pool).toBe("2:0-usd")
  })

  it("falls back to the DIESEL-derived pool when the direct one is empty", async () => {
    const fetchImpl = vi.fn()
      .mockResolvedValueOnce(espoOk([]))
      .mockResolvedValueOnce(espoOk(espoCandles))
    const points = await resolveDailyCandles("2:25349", fetchImpl as never)
    expect(points).toHaveLength(3)
    expect(JSON.parse(fetchImpl.mock.calls[1][1].body).params.pool).toBe("2:25349-derived_2:0-usd")
  })

  it("returns null when both pools are empty (project without a pool)", async () => {
    const fetchImpl = vi.fn().mockResolvedValue(espoOk([]))
    await expect(resolveDailyCandles("9:9", fetchImpl as never)).resolves.toBeNull()
    expect(fetchImpl).toHaveBeenCalledTimes(2)
  })

  it("returns null instead of throwing on network failure", async () => {
    const fetchImpl = vi.fn().mockRejectedValue(new Error("boom"))
    await expect(resolveDailyCandles("2:0", fetchImpl as never)).resolves.toBeNull()
  })
})

describe("getEcosystemPriceSeries", () => {
  it("returns null without touching the RPC when the project has no alkaneId", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce({ alkaneId: null } as never)
    await expect(getEcosystemPriceSeries("clockin")).resolves.toBeNull()
  })

  it("returns null for an unknown/unpublished slug", async () => {
    vi.mocked(prisma.ecosystemProject.findFirst).mockResolvedValueOnce(null as never)
    await expect(getEcosystemPriceSeries("nope")).resolves.toBeNull()
  })
})
