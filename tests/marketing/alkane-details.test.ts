import { describe, it, expect, vi } from "vitest"
import { getAlkaneDetails } from "@/lib/marketing/alkane-details"

const ok = (data: unknown) =>
  vi.fn().mockResolvedValue({ ok: true, json: async () => ({ data, statusCode: 200 }) }) as unknown as typeof fetch

describe("getAlkaneDetails", () => {
  it("maps the rich response to a typed token block", async () => {
    const f = ok({
      name: "DIESEL", symbol: "DIESEL", holders: 7891, priceUsd: 67.45,
      supply: "65712934154469", marketcap: 4.4e9, fdvUsd: 4.5e9,
      tokenVolume1d: 123456, priceChange24h: 1.2, priceChange7d: -3.4, priceChange30d: 10,
    })
    const b = await getAlkaneDetails("2:0", f)
    expect(b).toEqual({
      id: "2:0", name: "DIESEL", symbol: "DIESEL", holders: 7891, priceUsd: 67.45,
      supply: "65712934154469", marketcapUsd: 4.4e9, fdvUsd: 4.5e9,
      volume24hUsd: 123456, priceChange24h: 1.2, priceChange7d: -3.4, priceChange30d: 10,
    })
  })

  it("yields an all-null block (never throws) on HTTP error", async () => {
    const f = vi.fn().mockResolvedValue({ ok: false, status: 500 }) as unknown as typeof fetch
    const b = await getAlkaneDetails("2:77623", f)
    expect(b.id).toBe("2:77623")
    expect(b.holders).toBeNull()
    expect(b.priceUsd).toBeNull()
    expect(b.name).toBeNull()
  })

  it("yields nulls for missing/malformed fields", async () => {
    const f = ok({ name: "FIRE", holders: "oops", priceUsd: 53.7 })
    const b = await getAlkaneDetails("2:77623", f)
    expect(b.name).toBe("FIRE")
    expect(b.holders).toBeNull()      // malformed
    expect(b.priceUsd).toBe(53.7)
    expect(b.supply).toBeNull()       // missing
  })

  it("returns an all-null block for a malformed id without fetching", async () => {
    const f = vi.fn() as unknown as typeof fetch
    const b = await getAlkaneDetails("2", f)
    expect(b.id).toBe("2")
    expect(b.holders).toBeNull()
    expect(f).not.toHaveBeenCalled()
  })
})
