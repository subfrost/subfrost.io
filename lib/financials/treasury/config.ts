/** Treasury wallets tracked on BSC. PROVISIONAL (Vitor 2026-06-22, ~90% — flex
 *  may change); update here (one line each). */
export const TREASURY_WALLETS: { address: string; label?: string }[] = [
  { address: "0x74deeb5b221f257532e3ba1483dc214605025b81" },
  { address: "0x35E18d19c8B63B168B6049ed0a97073A847CE9e4" },
]

/** BSC (BNB Smart Chain) mainnet JSON-RPC endpoint. We hit this via tlsfetch
 *  a plain server-side `fetch` (see `source/bsc-rpc.ts`, which also falls back
 *  across several open dataseeds) with `eth_getBalance` / `eth_call` — no
 *  third-party balances API key. Override with `BSC_RPC_URL`; the default is an
 *  open BNB Chain dataseed (also used by the Venus dapp) — unlike NodeReal it is
 *  not behind Cloudflare, so it works reliably from datacenter egress. */
export const BSC_RPC_URL =
  process.env.BSC_RPC_URL || "https://bsc-dataseed1.bnbchain.org"
