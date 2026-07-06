/** Treasury wallets tracked on BSC. PROVISIONAL (Vitor 2026-06-22, ~90% — flex
 *  may change); update here (one line each). */
export const TREASURY_WALLETS: { address: string; label?: string }[] = [
  { address: "0x74deeb5b221f257532e3ba1483dc214605025b81" },
  { address: "0x35E18d19c8B63B168B6049ed0a97073A847CE9e4" },
]

/** BSC (BNB Smart Chain) mainnet JSON-RPC endpoint. We hit this directly with
 *  `eth_getBalance` / `eth_call` — no third-party balances API (GoldRush) key.
 *  Override with `BSC_RPC_URL`; the default is publicnode's keyless BSC RPC,
 *  which is what the rest of the wallet stack points at when unconfigured. */
export const BSC_RPC_URL = process.env.BSC_RPC_URL || "https://bsc-rpc.publicnode.com"
