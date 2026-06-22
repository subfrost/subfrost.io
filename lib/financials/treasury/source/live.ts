import {
  normalizeBalances,
  round2,
  type GoldRushItem,
  type TreasurySnapshot,
  type TreasuryWallet,
} from "@/lib/financials/treasury/shapes"
import { TREASURY_WALLETS, BSC_CHAIN } from "@/lib/financials/treasury/config"

const BASE = "https://api.covalenthq.com/v1"
const TIMEOUT_MS = 10_000

/** One wallet's holdings from GoldRush. Throws on missing key or non-OK so the
 *  caller (the action) can degrade — never returns a partial/silent snapshot. */
export async function fetchWalletBalances(address: string, label?: string): Promise<TreasuryWallet> {
  const key = process.env.GOLDRUSH_API_KEY
  if (!key) throw new Error("GOLDRUSH_API_KEY not configured")
  const url = `${BASE}/${BSC_CHAIN}/address/${address}/balances_v2/?quote-currency=USD`
  const res = await fetch(url, {
    headers: { Authorization: `Bearer ${key}` },
    signal: AbortSignal.timeout(TIMEOUT_MS),
  })
  if (!res.ok) throw new Error(`GoldRush ${res.status}`)
  const json = (await res.json()) as { data?: { items?: GoldRushItem[] } }
  return normalizeBalances(json?.data?.items ?? [], address, label)
}

/** All treasury wallets in parallel + the grand USD total. */
export async function fetchTreasurySnapshot(): Promise<TreasurySnapshot> {
  const wallets = await Promise.all(
    TREASURY_WALLETS.map((w) => fetchWalletBalances(w.address, w.label)),
  )
  const grandTotalUsd = round2(wallets.reduce((s, w) => s + w.totalUsd, 0))
  return { wallets, grandTotalUsd, fetchedAt: new Date().toISOString() }
}
