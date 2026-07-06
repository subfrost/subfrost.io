export interface TreasuryToken {
  contract: string
  symbol: string
  name: string
  amount: number
  /** USD value, or null when we have no price for the token. */
  usd: number | null
  isNative: boolean
}

export interface TreasuryWallet {
  address: string
  label?: string
  totalUsd: number
  tokens: TreasuryToken[]
}

export interface TreasurySnapshot {
  wallets: TreasuryWallet[]
  grandTotalUsd: number
  fetchedAt: string
}

export const round2 = (n: number): number => Math.round(n * 100) / 100

/** Pure: priced tokens → a normalized wallet. Drops zero balances, keeps
 *  no-price tokens (usd null), sorts by USD desc (nulls last), and totals only
 *  known USD (rounded). The provider builds `tokens` (amount + usd already
 *  derived); this stays free of any network/provider shape. */
export function normalizeBalances(
  tokens: TreasuryToken[],
  address: string,
  label?: string,
): TreasuryWallet {
  const kept = tokens
    .filter((t) => t.amount > 0)
    .sort((a, b) => {
      if (a.usd === null && b.usd === null) return 0
      if (a.usd === null) return 1
      if (b.usd === null) return -1
      return b.usd - a.usd
    })
  const totalUsd = round2(kept.reduce((s, t) => s + (t.usd ?? 0), 0))
  return { address, label, totalUsd, tokens: kept }
}
