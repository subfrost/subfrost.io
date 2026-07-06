import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import {
  getFrbtcVolumeRange,
  getFrbtcVolumeTip,
  __clearFrbtcIndexerCache,
} from "@/lib/financials/frbtc-indexer"

const RANGE_PAYLOAD = {
  daily: [
    { date: "2026-06-01", wrapped_sats: 100_000, unwrapped_sats: 50_000, wrap_count: 2, unwrap_count: 1 },
    { date: "2026-06-02", wrapped_sats: 0, unwrapped_sats: 200_000, wrap_count: 0, unwrap_count: 3 },
  ],
  totals: { wrapped_sats: 100_000, unwrapped_sats: 250_000, volume_sats: 350_000, fee_revenue_sats: 1_050 },
}

const hexOf = (obj: unknown) => "0x" + Buffer.from(JSON.stringify(obj), "utf8").toString("hex")

/** The real metashrew `export_bytes` framing: [u32-LE length][payload][NUL pad]. */
const framedHexOf = (obj: unknown) => {
  const json = Buffer.from(JSON.stringify(obj), "utf8")
  const len = Buffer.alloc(4)
  len.writeUInt32LE(json.length, 0)
  return "0x" + Buffer.concat([len, json, Buffer.alloc(16)]).toString("hex")
}

/** Stub fetch: assert the JSON-RPC envelope, then return `result`. */
function mockRpc(result: unknown, ok = true, status = 200) {
  const fn = vi.fn(async (_url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {}
    // Record the decoded view-input for assertions.
    ;(fn as any).lastCall = body
    return { ok, status, json: async () => (ok ? { jsonrpc: "2.0", id: 1, result } : {}) }
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

beforeEach(() => {
  __clearFrbtcIndexerCache()
  process.env.FRBTC_INDEXER_RPC_URL = "http://indexer.test/rpc"
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.FRBTC_INDEXER_RPC_URL
})

describe("getFrbtcVolumeRange (result decoding)", () => {
  it("decodes a hex-encoded JSON result and sends a well-formed metashrew_view call", async () => {
    const fn = mockRpc(hexOf(RANGE_PAYLOAD))
    const r = await getFrbtcVolumeRange("2026-06-01", "2026-06-02")

    // Request envelope: method + params [name, "0x"+hex(json), heightTag].
    const req = (fn as any).lastCall
    expect(req.method).toBe("metashrew_view")
    expect(req.params[0]).toBe("frbtc_volume_range")
    expect(req.params[2]).toBe("latest")
    expect(req.params[1]).toMatch(/^0x[0-9a-f]+$/)
    const decodedInput = JSON.parse(Buffer.from(req.params[1].slice(2), "hex").toString("utf8"))
    expect(decodedInput).toEqual({ from: "2026-06-01", to: "2026-06-02" })

    expect(r).not.toBeNull()
    expect(r!.daily).toHaveLength(2)
    expect(r!.daily[0]).toEqual({
      date: "2026-06-01", wrapped_sats: 100_000, unwrapped_sats: 50_000, wrap_count: 2, unwrap_count: 1,
    })
    expect(r!.totals.fee_revenue_sats).toBe(1_050)
  })

  it("decodes a plain JSON-string result", async () => {
    mockRpc(JSON.stringify(RANGE_PAYLOAD))
    const r = await getFrbtcVolumeRange("2026-06-01", "2026-06-02")
    expect(r!.totals.volume_sats).toBe(350_000)
  })

  it("decodes an already-object result", async () => {
    mockRpc(RANGE_PAYLOAD)
    const r = await getFrbtcVolumeRange("2026-06-01", "2026-06-02")
    expect(r!.daily[1].unwrapped_sats).toBe(200_000)
  })

  it("decodes the real metashrew framing (u32-LE length prefix + NUL padding)", async () => {
    mockRpc(framedHexOf(RANGE_PAYLOAD))
    const r = await getFrbtcVolumeRange("2026-06-01", "2026-06-02")
    expect(r!.daily).toHaveLength(2)
    expect(r!.totals.volume_sats).toBe(350_000)
  })

  it("coerces missing/garbage numeric fields to 0", async () => {
    mockRpc({ daily: [{ date: "2026-06-03" }], totals: {} })
    const r = await getFrbtcVolumeRange("2026-06-03", "2026-06-03")
    expect(r!.daily[0]).toEqual({
      date: "2026-06-03", wrapped_sats: 0, unwrapped_sats: 0, wrap_count: 0, unwrap_count: 0,
    })
    expect(r!.totals.fee_revenue_sats).toBe(0)
  })

  it("returns null when FRBTC_INDEXER_RPC_URL is unset (fallback signal), without fetching", async () => {
    delete process.env.FRBTC_INDEXER_RPC_URL
    const fn = mockRpc(hexOf(RANGE_PAYLOAD))
    expect(await getFrbtcVolumeRange("2026-06-01", "2026-06-02")).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })

  it("throws on a non-OK response (caller falls back)", async () => {
    mockRpc(null, false, 502)
    await expect(getFrbtcVolumeRange("2026-06-01", "2026-06-02")).rejects.toThrow(/502/)
  })

  it("throws on a JSON-RPC error result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, error: { message: "bad view" } }) })),
    )
    await expect(getFrbtcVolumeRange("2026-06-01", "2026-06-02")).rejects.toThrow(/bad view/)
  })

  it("memoizes within the TTL (second call does not refetch)", async () => {
    const fn = mockRpc(hexOf(RANGE_PAYLOAD))
    await getFrbtcVolumeRange("2026-06-01", "2026-06-02")
    await getFrbtcVolumeRange("2026-06-01", "2026-06-02")
    expect(fn).toHaveBeenCalledTimes(1)
  })
})

describe("getFrbtcVolumeTip", () => {
  it("returns the last indexed height", async () => {
    const fn = mockRpc(hexOf({ tip: 901_234 }))
    const t = await getFrbtcVolumeTip()
    expect(t).toEqual({ tip: 901_234 })
    expect((fn as any).lastCall.params[0]).toBe("frbtc_volume_tip")
  })

  it("returns null when the env is unset", async () => {
    delete process.env.FRBTC_INDEXER_RPC_URL
    expect(await getFrbtcVolumeTip()).toBeNull()
  })
})
