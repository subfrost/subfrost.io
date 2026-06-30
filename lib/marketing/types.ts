export type SnapshotContext = "GENERAL" | "X_POST" | "ARTICLE" | "DAILY"
export const SNAPSHOT_CONTEXTS: SnapshotContext[] = ["GENERAL", "X_POST", "ARTICLE"]

export const DIESEL_ID = "2:0"
export const FIRE_ID = "2:77623"
export const FRBTC_ID = "32:0"

export interface SnapshotTokenBlock {
  id: string
  name: string | null
  symbol: string | null
  holders: number | null
  priceUsd: number | null
  supply: string | null
  marketcapUsd: number | null
  fdvUsd: number | null
  volume24hUsd: number | null
  priceChange24h: number | null
  priceChange7d: number | null
  priceChange30d: number | null
}

export interface SnapshotProtocol {
  totalBtcLocked: number | null
  alkanesBtcLocked: number | null
  brc20BtcLocked: number | null
  btcUsd: number | null
  btcHeight: number | null
  metashrewHeight: number | null
  source: "store"
}

export interface SnapshotPayload {
  capturedAt: string
  protocol: SnapshotProtocol
  tokens: { diesel: SnapshotTokenBlock; fire: SnapshotTokenBlock; frbtc: SnapshotTokenBlock }
  ratios: { btcDiesel: number | null; btcFire: number | null }
  partial: boolean
}
