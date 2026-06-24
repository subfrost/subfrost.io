/**
 * Per-token marketing data from the canon Espo `get-alkane-details` endpoint
 * (oyl.alkanode.com, public, no auth). Returns a guarded SnapshotTokenBlock —
 * every field nulls out on failure; never throws.
 */
import type { SnapshotTokenBlock } from "@/lib/marketing/types"

const DETAILS_URL = process.env.ESPO_DETAILS_URL || "https://oyl.alkanode.com"

const numOrNull = (v: unknown): number | null =>
  typeof v === "number" && Number.isFinite(v) ? v : null
const strOrNull = (v: unknown): string | null =>
  typeof v === "string" && v ? v : (typeof v === "number" ? String(v) : null)

function nullBlock(id: string): SnapshotTokenBlock {
  return {
    id, name: null, symbol: null, holders: null, priceUsd: null, supply: null,
    marketcapUsd: null, fdvUsd: null, volume24hUsd: null,
    priceChange24h: null, priceChange7d: null, priceChange30d: null,
  }
}

export async function getAlkaneDetails(
  id: string,
  fetchImpl: typeof fetch = fetch,
): Promise<SnapshotTokenBlock> {
  try {
    const [block, tx] = id.split(":")
    const res = await fetchImpl(`${DETAILS_URL}/get-alkane-details`, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ alkaneId: { block, tx } }),
      signal: AbortSignal.timeout(15_000),
    })
    if (!res.ok) return nullBlock(id)
    const json = (await res.json()) as { data?: Record<string, unknown> }
    const d = json.data
    if (!d || typeof d !== "object") return nullBlock(id)
    return {
      id,
      name: typeof d.name === "string" ? d.name : null,
      symbol: typeof d.symbol === "string" ? d.symbol : null,
      holders: numOrNull(d.holders),
      priceUsd: numOrNull(d.priceUsd),
      supply: strOrNull(d.supply),
      marketcapUsd: numOrNull(d.marketcap),
      fdvUsd: numOrNull(d.fdvUsd),
      volume24hUsd: numOrNull(d.tokenVolume1d),
      priceChange24h: numOrNull(d.priceChange24h),
      priceChange7d: numOrNull(d.priceChange7d),
      priceChange30d: numOrNull(d.priceChange30d),
    }
  } catch {
    return nullBlock(id)
  }
}
