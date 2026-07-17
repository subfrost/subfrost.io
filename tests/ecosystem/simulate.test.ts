import { describe, it, expect, vi } from "vitest"
import { simulateView } from "@/lib/ecosystem/simulate"

const REAL_DATA =
  "0x3028f2000000000000000000000000008046fc3101000000000000000000000070f5b35900000000000000000000000010055301000000000000000000000000"

const rpcOk = (data: string, error: unknown = null) =>
  ({ ok: true, json: async () => ({ jsonrpc: "2.0", id: 1, result: { execution: { alkanes: [], data, error, storage: [] }, gasUsed: 1, status: 0 } }) }) as unknown as Response

describe("simulateView", () => {
  it("decodes the real ViewPools payload into 4 LE u128 words", async () => {
    const fetchImpl = vi.fn(async () => rpcOk(REAL_DATA))
    const words = await simulateView({ block: "4", tx: "257" }, ["103"], fetchImpl as never)
    expect(words).toEqual([15870000n, 5133584000n, 1504966000n, 22218000n])
    const body = JSON.parse((fetchImpl.mock.calls[0] as never[])[1]!["body"] as string)
    expect(body.method).toBe("alkanes_simulate")
    expect(body.params[0].target).toEqual({ block: "4", tx: "257" })
    expect(body.params[0].inputs).toEqual(["103"])
  })

  it("returns null on execution error, malformed data, and network failure", async () => {
    expect(await simulateView({ block: "4", tx: "257" }, ["103"], vi.fn(async () => rpcOk("0x", "ALKANES: revert")) as never)).toBeNull()
    expect(await simulateView({ block: "4", tx: "257" }, ["103"], vi.fn(async () => rpcOk("0x1234")) as never)).toBeNull() // não múltiplo de 32 hex
    expect(await simulateView({ block: "4", tx: "257" }, ["103"], vi.fn(async () => { throw new Error("down") }) as never)).toBeNull()
    expect(await simulateView({ block: "4", tx: "257" }, ["103"], vi.fn(async () => ({ ok: false }) as never) as never)).toBeNull()
  })
})
