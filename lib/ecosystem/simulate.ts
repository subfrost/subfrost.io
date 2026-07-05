/**
 * Read-only `alkanes_simulate` against the SUBFROST RPC — the profile stats
 * pipeline's view-opcode reader. Returns the execution data decoded as
 * little-endian u128 words, or null on ANY failure (never throws).
 */
const RPC_URL = process.env.SUBFROST_RPC_URL || "https://mainnet.subfrost.io/v4/subfrost"

export async function simulateView(
  target: { block: string; tx: string },
  inputs: string[],
  fetchImpl: typeof fetch = fetch,
): Promise<bigint[] | null> {
  try {
    const res = await fetchImpl(RPC_URL, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({
        jsonrpc: "2.0",
        id: 1,
        method: "alkanes_simulate",
        params: [{
          alkanes: [], transaction: "0x", block: "0x", height: "20000",
          txindex: 0, pointer: 0, refundPointer: 0, vout: 0, target, inputs,
        }],
      }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return null
    const json = (await res.json()) as { result?: { execution?: { data?: unknown; error?: unknown } } }
    const exec = json.result?.execution
    if (!exec || exec.error != null) return null
    if (typeof exec.data !== "string" || !exec.data.startsWith("0x")) return null
    const hex = exec.data.slice(2)
    if (hex.length === 0 || hex.length % 32 !== 0 || /[^0-9a-fA-F]/.test(hex)) return null
    const words: bigint[] = []
    for (let i = 0; i < hex.length; i += 32) {
      const le = hex.slice(i, i + 32).match(/../g)!.reverse().join("")
      words.push(BigInt("0x" + le))
    }
    return words
  } catch {
    return null
  }
}
