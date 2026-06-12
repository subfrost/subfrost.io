/**
 * Simple RPC Client - Direct HTTP calls to Subfrost/Esplora APIs
 *
 * This module provides a lightweight alternative to the @alkanes/ts-sdk
 * for serverless environments where WASM may not work reliably.
 */

// ============================================================================
// Configuration
// ============================================================================

const SUBFROST_RPC_URL = 'https://mainnet.subfrost.io/v4/subfrost';
const BRC20_RPC_URL = 'https://rpc.brc20.build';

// ============================================================================
// Utilities
// ============================================================================

function sleep(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/**
 * Fetch with automatic retry on 429 (rate limit).
 * Waits for Retry-After header if present, otherwise uses exponential backoff.
 */
async function fetchWithRetry(url: string, options: RequestInit & { signal?: AbortSignal }, maxRetries = 3): Promise<Response> {
  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const response = await fetch(url, options);
    if (response.status !== 429 || attempt === maxRetries) return response;

    const retryAfter = response.headers.get('Retry-After');
    const waitMs = retryAfter ? parseInt(retryAfter, 10) * 1000 : (2 ** attempt) * 1000;
    await sleep(waitMs);
  }
  // Unreachable but satisfies TypeScript
  return fetch(url, options);
}

// Known addresses
const ALKANES_SUBFROST_ADDRESS = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';
const BRC20_SIGNER_ADDRESS = 'bc1pxn3gr0hy70exhdqjzawtuygppzdrk3mer3wlaa2gzkmruk3rrt4qga2qaj';

// BRC2.0 contract
const FRBTC_CONTRACT_ADDRESS = '0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337';
const TOTAL_SUPPLY_SELECTOR = '0x18160ddd';

// ============================================================================
// Types
// ============================================================================

export interface UTXO {
  txid: string;
  vout: number;
  value: number;
  status: {
    confirmed: boolean;
    block_height?: number;
  };
}

export interface AddressTx {
  txid: string;
  vin: Array<{
    txid: string;
    vout: number;
    prevout?: {
      scriptpubkey_address?: string;
      scriptpubkey_type?: string;
      value: number;
    };
  }>;
  vout: Array<{
    scriptpubkey_address?: string;
    scriptpubkey_type?: string;
    value: number;
  }>;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_time?: number;
  };
}

export interface AddressStats {
  address: string;
  chain_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
  mempool_stats: {
    funded_txo_count: number;
    funded_txo_sum: number;
    spent_txo_count: number;
    spent_txo_sum: number;
    tx_count: number;
  };
}

// ============================================================================
// RPC Helpers
// ============================================================================

async function subfrostRpc<T>(method: string, params: unknown[], timeoutMs = 10_000): Promise<T> {
  const response = await fetch(SUBFROST_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
    signal: AbortSignal.timeout(timeoutMs),
  });

  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  }

  return data.result as T;
}

async function brc20Rpc<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(BRC20_RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({
      jsonrpc: '2.0',
      id: Date.now(),
      method,
      params,
    }),
    signal: AbortSignal.timeout(10_000),
  });

  if (!response.ok) {
    throw new Error(`BRC2.0 RPC request failed: ${response.status}`);
  }

  const data = await response.json();
  if (data.error) {
    throw new Error(`BRC2.0 RPC error: ${JSON.stringify(data.error)}`);
  }

  return data.result as T;
}

// ============================================================================
// Esplora Methods
// ============================================================================

/**
 * Get UTXOs for an address
 */
export async function getAddressUtxos(address: string): Promise<UTXO[]> {
  // The SUBFROST address holds thousands of UTXOs, so this call routinely takes
  // ~10-12s — give it a generous timeout (cache keeps it off the hot path).
  const result = await subfrostRpc<UTXO[]>('esplora_address::utxo', [address], 25_000);
  return Array.isArray(result) ? result : [];
}

/**
 * Get transactions for an address
 * Uses mempool.space Esplora directly — more reliable than the Subfrost RPC proxy.
 */
export async function getAddressTxs(address: string): Promise<AddressTx[]> {
  const response = await fetchWithRetry(`https://mempool.space/api/address/${address}/txs`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Esplora /txs failed: ${response.status}`);
  const result = await response.json();
  return Array.isArray(result) ? result : [];
}

/**
 * Get transactions for an address with pagination (after a specific txid)
 * Uses mempool.space Esplora directly.
 */
export async function getAddressTxsChain(address: string, lastSeenTxid: string): Promise<AddressTx[]> {
  const response = await fetchWithRetry(`https://mempool.space/api/address/${address}/txs/chain/${lastSeenTxid}`, {
    signal: AbortSignal.timeout(15_000),
  });
  if (!response.ok) throw new Error(`Esplora /txs/chain failed: ${response.status}`);
  const result = await response.json();
  return Array.isArray(result) ? result : [];
}

/**
 * Get address stats (balance via funded/spent sums) from mempool.space
 * This is useful for addresses with many UTXOs that exceed RPC limits
 */
export async function getAddressStats(address: string): Promise<AddressStats> {
  const response = await fetch(`https://mempool.space/api/address/${address}`, {
    signal: AbortSignal.timeout(10_000),
  });
  if (!response.ok) {
    throw new Error(`Failed to fetch address stats: ${response.status}`);
  }
  return response.json();
}

// ============================================================================
// Alkanes Methods
// ============================================================================

/**
 * Get the Alkanes Subfrost address (hardcoded for reliability)
 */
export function getAlkanesSubfrostAddress(): string {
  return ALKANES_SUBFROST_ADDRESS;
}

/**
 * Get BTC locked in Alkanes Subfrost address
 * Uses address stats for efficiency and scalability
 */
export async function getAlkanesBtcLocked(): Promise<{
  btcLocked: number;
  satoshis: number;
  utxoCount: number;
  address: string;
}> {
  const address = ALKANES_SUBFROST_ADDRESS;
  const stats = await getAddressStats(address);

  // Balance = total funded - total spent (confirmed only)
  const satoshis = stats.chain_stats.funded_txo_sum - stats.chain_stats.spent_txo_sum;
  const utxoCount = stats.chain_stats.funded_txo_count - stats.chain_stats.spent_txo_count;

  return {
    btcLocked: satoshis / 100_000_000,
    satoshis,
    utxoCount,
    address,
  };
}

// ============================================================================
// BRC2.0 Methods
// ============================================================================

/**
 * Get the BRC2.0 signer address (hardcoded for reliability)
 */
export function getBrc20SignerAddress(): string {
  return BRC20_SIGNER_ADDRESS;
}

/**
 * Get BTC locked in BRC2.0 signer address
 * Uses address stats instead of UTXOs since this address has >500 UTXOs
 */
export async function getBrc20BtcLocked(): Promise<{
  btcLocked: number;
  satoshis: number;
  utxoCount: number;
  address: string;
}> {
  const address = BRC20_SIGNER_ADDRESS;
  const stats = await getAddressStats(address);

  // Balance = total funded - total spent (confirmed only)
  const satoshis = stats.chain_stats.funded_txo_sum - stats.chain_stats.spent_txo_sum;
  const utxoCount = stats.chain_stats.funded_txo_count - stats.chain_stats.spent_txo_count;

  return {
    btcLocked: satoshis / 100_000_000,
    satoshis,
    utxoCount,
    address,
  };
}

/**
 * Get BRC2.0 frBTC total supply
 */
export async function getBrc20TotalSupply(): Promise<{
  totalSupply: bigint;
  totalSupplyBtc: number;
}> {
  const result = await brc20Rpc<string>('eth_call', [
    { to: FRBTC_CONTRACT_ADDRESS, data: TOTAL_SUPPLY_SELECTOR },
    'latest',
  ]);

  const totalSupply = result && result !== '0x' ? BigInt(result) : 0n;
  const totalSupplyBtc = Number(totalSupply) / 1e8;

  return { totalSupply, totalSupplyBtc };
}

// ============================================================================
// Unwrap Calculation Methods
// ============================================================================

/**
 * Calculate total unwraps for an address
 * Unwraps are transactions where the signer address is an input
 * and funds go to other addresses (not change back to signer)
 */
export async function calculateTotalUnwraps(signerAddress: string): Promise<{
  totalUnwrapsSatoshis: number;
  totalUnwrapsBtc: number;
  unwrapCount: number;
}> {
  // Fetch all transactions with pagination
  let allTxs: AddressTx[] = [];
  let lastSeenTxid: string | undefined = undefined;
  let pageCount = 0;
  // Cap at 100 pages (2500 txs) to stay within Netlify's 26s function timeout.
  // The prefetch job keeps this warm; live fallback only runs on cold cache.
  const maxPages = 100;

  while (pageCount < maxPages) {
    pageCount++;

    let page: AddressTx[];
    if (lastSeenTxid === undefined) {
      page = await getAddressTxs(signerAddress);
    } else {
      page = await getAddressTxsChain(signerAddress, lastSeenTxid);
    }

    if (!page || page.length === 0) break;

    allTxs.push(...page);
    lastSeenTxid = page[page.length - 1].txid;

    if (page.length < 25) break;

    // Brief pause between pages to avoid mempool.space rate limits
    await sleep(300);
  }

  // Calculate unwraps
  let totalUnwrapsSatoshis = 0;
  let unwrapCount = 0;

  for (const tx of allTxs) {
    if (!tx.status?.confirmed) continue;

    // Check if signer is in inputs
    const signerInputs = tx.vin?.filter(
      (vin) => vin.prevout?.scriptpubkey_address === signerAddress
    ) || [];

    if (signerInputs.length === 0) continue;

    // Sum outputs going to other addresses (not change)
    let unwrapAmount = 0;
    for (const vout of tx.vout || []) {
      const outputAddress = vout.scriptpubkey_address;
      if (outputAddress && outputAddress !== signerAddress) {
        unwrapAmount += vout.value || 0;
      }
    }

    if (unwrapAmount > 0) {
      totalUnwrapsSatoshis += unwrapAmount;
      unwrapCount++;
    }
  }

  return {
    totalUnwrapsSatoshis,
    totalUnwrapsBtc: totalUnwrapsSatoshis / 100_000_000,
    unwrapCount,
  };
}
