// Block-explorer URL helpers. One place to build tx/address deep-links so the
// financials + entity surfaces don't each hardcode `https://mempool.space/tx/…`.
//
// Chains:
//   bitcoin  → mempool.space  (BTC / DIESEL settlement txids + taproot addresses)
//   ethereum → etherscan.io   (OYL SAFE settlement, EVM addresses)
//   bsc      → bscscan.com    (BNB-chain settlement, EVM addresses)
//   espo     → the ESPO (alkanes AMM) explorer
export type ExplorerChain = "bitcoin" | "ethereum" | "bsc" | "espo"

// TODO(espo): confirm the canonical ESPO explorer host. The ESPO RPC lives at
// api.alkanode.com; the explorer base below is a best-guess and may need fixing.
const ESPO_EXPLORER = "https://explorer.espo.network"

const TX_BASE: Record<ExplorerChain, string> = {
  bitcoin: "https://mempool.space/tx/",
  ethereum: "https://etherscan.io/tx/",
  bsc: "https://bscscan.com/tx/",
  espo: `${ESPO_EXPLORER}/tx/`,
}

const ADDR_BASE: Record<ExplorerChain, string> = {
  bitcoin: "https://mempool.space/address/",
  ethereum: "https://etherscan.io/address/",
  bsc: "https://bscscan.com/address/",
  espo: `${ESPO_EXPLORER}/address/`,
}

/** Explorer deep-link for a transaction id on the given chain. */
export function explorerTxUrl(chain: ExplorerChain, txid: string): string {
  return `${TX_BASE[chain]}${txid}`
}

/** Explorer deep-link for an address on the given chain. */
export function explorerAddrUrl(chain: ExplorerChain, address: string): string {
  return `${ADDR_BASE[chain]}${address}`
}
