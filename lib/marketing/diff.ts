import type { SnapshotPayload } from "@/lib/marketing/types"

export interface DiffRow {
  path: string
  label: string
  before: number | null
  after: number | null
  deltaAbs: number | null
  deltaPct: number | null
}

type Field = { path: string; label: string; get: (p: SnapshotPayload) => number | null }

const TOKENS: Array<["diesel" | "fire" | "frbtc", string]> = [
  ["diesel", "DIESEL"], ["fire", "FIRE"], ["frbtc", "frBTC"],
]
const TOKEN_FIELDS: Array<[keyof SnapshotPayload["tokens"]["diesel"], string]> = [
  ["holders", "holders"], ["priceUsd", "price USD"], ["marketcapUsd", "market cap USD"],
  ["fdvUsd", "FDV USD"], ["volume24hUsd", "24h volume USD"],
  ["priceChange24h", "24h change %"], ["priceChange7d", "7d change %"], ["priceChange30d", "30d change %"],
]

const FIELDS: Field[] = [
  { path: "protocol.totalBtcLocked", label: "Total BTC Locked", get: (p) => p.protocol.totalBtcLocked },
  { path: "protocol.btcUsd", label: "BTC price USD", get: (p) => p.protocol.btcUsd },
  { path: "ratios.btcDiesel", label: "BTC/DIESEL", get: (p) => p.ratios.btcDiesel },
  { path: "ratios.btcFire", label: "BTC/FIRE", get: (p) => p.ratios.btcFire },
  ...TOKENS.flatMap(([key, name]) =>
    TOKEN_FIELDS.map(([f, fl]): Field => ({
      path: `tokens.${key}.${f}`,
      label: `${name} ${fl}`,
      get: (p) => p.tokens[key][f] as number | null,
    })),
  ),
]

export function diffSnapshots(before: SnapshotPayload, after: SnapshotPayload): DiffRow[] {
  return FIELDS.map(({ path, label, get }) => {
    const b = get(before)
    const a = get(after)
    const deltaAbs = b !== null && a !== null ? a - b : null
    const deltaPct = b !== null && a !== null && b !== 0 ? ((a - b) / b) * 100 : null
    return { path, label, before: b, after: a, deltaAbs, deltaPct }
  })
}
