/** One item from GoldRush `balances_v2` `data.items[]` (the fields we use). */
export interface GoldRushItem {
  contract_address: string
  contract_ticker_symbol: string | null
  contract_name: string | null
  contract_decimals: number | null
  balance: string | null
  quote: number | null
  native_token: boolean
  is_spam?: boolean
  logo_url?: string | null
}

export interface TreasuryToken {
  contract: string
  symbol: string
  name: string
  amount: number
  /** USD value (GoldRush `quote`), or null when the provider has no price. */
  usd: number | null
  isNative: boolean
  logo?: string
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

/** Pure: GoldRush items → a normalized wallet. Drops spam and zero balances,
 *  applies decimals, maps native + USD, keeps no-price tokens (usd null), and
 *  sorts by USD desc (nulls last). Totals only known USD. */
export function normalizeBalances(
  items: GoldRushItem[],
  address: string,
  label?: string,
): TreasuryWallet {
  const tokens: TreasuryToken[] = items
    .filter((it) => !it.is_spam)
    .map((it) => ({
      contract: it.contract_address,
      symbol: it.contract_ticker_symbol ?? "?",
      name: it.contract_name ?? "Unknown",
      amount: Number(it.balance ?? "0") / 10 ** (it.contract_decimals ?? 0),
      usd: typeof it.quote === "number" ? it.quote : null,
      isNative: it.native_token === true,
      logo: it.logo_url ?? undefined,
    }))
    .filter((t) => t.amount > 0)
    .sort((a, b) => {
      if (a.usd === null && b.usd === null) return 0
      if (a.usd === null) return 1
      if (b.usd === null) return -1
      return b.usd - a.usd
    })
  const totalUsd = round2(tokens.reduce((s, t) => s + (t.usd ?? 0), 0))
  return { address, label, totalUsd, tokens }
}
