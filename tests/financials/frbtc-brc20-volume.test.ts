import { describe, it, expect, vi, beforeEach, afterEach } from "vitest"
import { getBrc20VolumeRange, __clearBrc20VolumeCache } from "@/lib/frbtc-brc20-volume"

const RANGE_PAYLOAD = {
  daily: [
    { date: "2026-01-01", wrapped_sats: 300_000, unwrapped_sats: 100_000, wrap_count: 4, unwrap_count: 1 },
    { date: "2026-01-02", wrapped_sats: 0, unwrapped_sats: 50_000, wrap_count: 0, unwrap_count: 2 },
  ],
  totals: { wrapped_sats: 300_000, unwrapped_sats: 150_000, volume_sats: 450_000, wrap_count: 4, unwrap_count: 3 },
}

const hexOf = (obj: unknown) => "0x" + Buffer.from(JSON.stringify(obj), "utf8").toString("hex")

/** The real metashrew `export_bytes` framing: [u32-LE length][payload][NUL pad]. */
const framedHexOf = (obj: unknown) => {
  const json = Buffer.from(JSON.stringify(obj), "utf8")
  const len = Buffer.alloc(4)
  len.writeUInt32LE(json.length, 0)
  return "0x" + Buffer.concat([len, json, Buffer.alloc(16)]).toString("hex")
}

/** Stub fetch: record the JSON-RPC envelope, then return `result`. */
function mockRpc(result: unknown, ok = true, status = 200) {
  const fn = vi.fn(async (_url: string, init?: { body?: string }) => {
    const body = init?.body ? JSON.parse(init.body) : {}
    ;(fn as any).lastCall = body
    return { ok, status, json: async () => (ok ? { jsonrpc: "2.0", id: 1, result } : {}) }
  })
  vi.stubGlobal("fetch", fn)
  return fn
}

beforeEach(() => {
  __clearBrc20VolumeCache()
  process.env.FRBTC_BRC20_INDEXER_RPC_URL = "http://brc20-indexer.test/rpc"
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  delete process.env.FRBTC_BRC20_INDEXER_RPC_URL
})

describe("getBrc20VolumeRange", () => {
  it("sends a well-formed frbtc_volume_range call with a near-present `to` bound", async () => {
    const fn = mockRpc(hexOf(RANGE_PAYLOAD))
    const r = await getBrc20VolumeRange()

    const req = (fn as any).lastCall
    expect(req.method).toBe("metashrew_view")
    expect(req.params[0]).toBe("frbtc_volume_range")
    expect(req.params[2]).toBe("latest")
    expect(req.params[1]).toMatch(/^0x[0-9a-f]+$/)
    const input = JSON.parse(Buffer.from(req.params[1].slice(2), "hex").toString("utf8"))
    expect(input.from).toBe("2025-01-01")
    // `to` must stay near the present (a far-future bound makes the view return
    // empty). Assert it is a valid YYYY-MM-DD within a couple years of now.
    expect(input.to).toMatch(/^\d{4}-\d{2}-\d{2}$/)
    expect(new Date(input.to).getTime()).toBeGreaterThan(Date.now())
    expect(new Date(input.to).getTime()).toBeLessThan(Date.now() + 5 * 86_400_000)

    expect(r).not.toBeNull()
    expect(r!.daily).toHaveLength(2)
    expect(r!.daily[0]).toEqual({
      date: "2026-01-01", wrapped_sats: 300_000, unwrapped_sats: 100_000, wrap_count: 4, unwrap_count: 1,
    })
    expect(r!.totals).toEqual({
      wrapped_sats: 300_000, unwrapped_sats: 150_000, volume_sats: 450_000, wrap_count: 4, unwrap_count: 3,
    })
  })

  it("decodes a plain JSON-string result", async () => {
    mockRpc(JSON.stringify(RANGE_PAYLOAD))
    const r = await getBrc20VolumeRange()
    expect(r!.totals.volume_sats).toBe(450_000)
  })

  it("decodes an already-object result", async () => {
    mockRpc(RANGE_PAYLOAD)
    const r = await getBrc20VolumeRange()
    expect(r!.daily[1].unwrapped_sats).toBe(50_000)
  })

  it("decodes the real metashrew framing (u32-LE length prefix + NUL padding)", async () => {
    mockRpc(framedHexOf(RANGE_PAYLOAD))
    const r = await getBrc20VolumeRange()
    expect(r!.daily).toHaveLength(2)
    expect(r!.totals.wrapped_sats).toBe(300_000)
  })

  it("coerces missing/garbage numeric fields to 0", async () => {
    mockRpc({ daily: [{ date: "2026-01-03" }], totals: {} })
    const r = await getBrc20VolumeRange()
    expect(r!.daily[0]).toEqual({
      date: "2026-01-03", wrapped_sats: 0, unwrapped_sats: 0, wrap_count: 0, unwrap_count: 0,
    })
    expect(r!.totals.volume_sats).toBe(0)
  })

  it("returns null when FRBTC_BRC20_INDEXER_RPC_URL is unset, without fetching", async () => {
    delete process.env.FRBTC_BRC20_INDEXER_RPC_URL
    const fn = mockRpc(hexOf(RANGE_PAYLOAD))
    expect(await getBrc20VolumeRange()).toBeNull()
    expect(fn).not.toHaveBeenCalled()
  })

  it("throws on a non-OK response", async () => {
    mockRpc(null, false, 503)
    await expect(getBrc20VolumeRange()).rejects.toThrow(/503/)
  })

  it("throws on a JSON-RPC error result", async () => {
    vi.stubGlobal(
      "fetch",
      vi.fn(async () => ({ ok: true, status: 200, json: async () => ({ jsonrpc: "2.0", id: 1, error: { message: "bad view" } }) })),
    )
    await expect(getBrc20VolumeRange()).rejects.toThrow(/bad view/)
  })

  it("memoizes within the TTL (second call does not refetch)", async () => {
    const fn = mockRpc(hexOf(RANGE_PAYLOAD))
    await getBrc20VolumeRange()
    await getBrc20VolumeRange()
    expect(fn).toHaveBeenCalledTimes(1)
  })
})
