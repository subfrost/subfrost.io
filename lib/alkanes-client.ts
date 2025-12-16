/**
 * Alkanes Client - Unified interface for all blockchain RPC interactions
 *
 * This module provides a single entry point for all alkanes/metashrew/esplora calls,
 * using @alkanes/ts-sdk as the underlying driver. All business logic that interacts
 * with the blockchain should use this client.
 *
 * Benefits:
 * - Single source of truth for RPC configuration
 * - Consistent error handling
 * - Testable via SDK mocking
 * - Eliminates duplicate fetch/RPC code throughout the codebase
 */

import { AlkanesProvider } from '@alkanes/ts-sdk';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';

bitcoin.initEccLib(ecc);

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
    block_hash?: string;
    block_time?: number;
  };
}

export interface AlkaneId {
  block: bigint;
  tx: bigint;
}

export interface TokenBalance {
  alkaneId: AlkaneId;
  balance: bigint;
  symbol?: string;
  name?: string;
}

export interface AddressTx {
  txid: string;
  version: number;
  locktime: number;
  vin: Array<{
    txid: string;
    vout: number;
    prevout?: {
      scriptpubkey: string;
      scriptpubkey_address?: string;
      value: number;
    };
    scriptsig: string;
    sequence: number;
    witness?: string[];
  }>;
  vout: Array<{
    scriptpubkey: string;
    scriptpubkey_address?: string;
    value: number;
  }>;
  size: number;
  weight: number;
  fee: number;
  status: {
    confirmed: boolean;
    block_height?: number;
    block_hash?: string;
    block_time?: number;
  };
}

// ============================================================================
// Constants
// ============================================================================

/** frBTC token configuration */
export const FRBTC_TOKEN = {
  alkaneId: { block: 32n, tx: 0n },
  decimals: 8,
  symbol: 'frBTC',
  name: 'Fractional Bitcoin',
};

/** Known token metadata */
export const KNOWN_TOKENS: Record<string, { symbol: string; name: string; decimals: number }> = {
  '2:0': { symbol: 'DIESEL', name: 'DIESEL', decimals: 8 },
  '32:0': { symbol: 'frBTC', name: 'Fractional BTC', decimals: 8 },
};

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Strip 0x prefix from hex string
 */
function stripHexPrefix(v: string): string {
  return v.startsWith('0x') ? v.slice(2) : v;
}

/**
 * Compute P2TR address from internal public key
 */
function computeP2TRAddress(internalPubkey: Buffer, network: string): string | undefined {
  let bNetwork: bitcoin.Network;
  switch (network) {
    case 'mainnet':
      bNetwork = bitcoin.networks.bitcoin;
      break;
    case 'testnet':
    case 'signet':
      bNetwork = bitcoin.networks.testnet;
      break;
    case 'regtest':
      bNetwork = bitcoin.networks.regtest;
      break;
    default:
      return undefined;
  }
  const { address } = bitcoin.payments.p2tr({
    internalPubkey,
    network: bNetwork,
  });
  return address;
}

/**
 * Reverse a hex string (for little-endian conversion)
 */
export function reverseHex(hex: string): string {
  if (hex.startsWith('0x')) {
    hex = hex.slice(2);
  }
  if (hex.length % 2) {
    hex = '0' + hex;
  }
  const buf = Buffer.from(hex, 'hex');
  return '0x' + buf.reverse().toString('hex');
}

/**
 * Parse little-endian u128 from hex string
 */
export function parseU128LE(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  const cleanHex = stripHexPrefix(hex);
  if (!cleanHex) return 0n;

  // Reverse bytes for little-endian
  let reversed = '';
  for (let i = cleanHex.length - 2; i >= 0; i -= 2) {
    reversed += cleanHex.slice(i, i + 2);
  }
  return BigInt('0x' + (reversed || '0'));
}

/**
 * Format alkane ID to string
 */
export function formatAlkaneId(id: AlkaneId): string {
  return `${id.block}:${id.tx}`;
}

/**
 * Parse alkane ID from string
 */
export function parseAlkaneId(str: string): AlkaneId {
  const [block, tx] = str.split(':');
  return {
    block: BigInt(block),
    tx: BigInt(tx),
  };
}

// ============================================================================
// Alkanes Client Class
// ============================================================================

/**
 * Singleton client for all alkanes/blockchain interactions
 * Uses @alkanes/ts-sdk as the driver
 */
class AlkanesClient {
  private provider: AlkanesProvider | null = null;
  private initPromise: Promise<void> | null = null;
  private rpcUrl: string;
  private network: string;
  private cachedSubfrostAddress: string | null = null;

  constructor() {
    this.rpcUrl = process.env.ALKANES_RPC_URL || 'https://mainnet.subfrost.io/v4/subfrost';
    this.network = process.env.NEXT_PUBLIC_NETWORK || 'mainnet';
  }

  /**
   * Get the RPC URL being used
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Ensure provider is initialized (lazy singleton pattern)
   */
  private async ensureProvider(): Promise<AlkanesProvider> {
    if (this.provider) return this.provider;

    if (!this.initPromise) {
      this.initPromise = (async () => {
        this.provider = new AlkanesProvider({
          network: this.network as 'mainnet' | 'testnet' | 'signet' | 'regtest',
          rpcUrl: this.rpcUrl,
        });
        await this.provider.initialize();
      })();
    }

    await this.initPromise;
    return this.provider!;
  }

  /**
   * Get the initialized provider (public accessor for tests)
   */
  async getProvider(): Promise<AlkanesProvider> {
    return this.ensureProvider();
  }

  /**
   * Create a MessageContextParcel for simulate calls
   * See: reference/alkanes-rs/crates/alkanes-web-sys/src/provider.rs
   * See: reference/alkanes-rs/crates/alkanes-support/src/cellpack.rs
   *
   * The calldata is a LEB128-encoded Cellpack: [target.block, target.tx, ...inputs]
   */
  private createSimulateContext(block: number, tx: number, inputs: number[]): object {
    // Calldata is LEB128-encoded Cellpack: [block, tx, ...inputs]
    // For values < 128, LEB128 encoding is just the byte value
    const calldata = [block, tx, ...inputs];

    return {
      alkanes: [],
      transaction: [],
      block: [],
      height: 0,
      vout: 0,
      txindex: 0,
      calldata,
      pointer: 0,
      refund_pointer: 0,
    };
  }

  // ==========================================================================
  // Subfrost Address Methods
  // ==========================================================================

  /**
   * Fetch the subfrost signer public key via simulate (32:0 opcode 103)
   * See: reference/subfrost-alkanes/alkanes/fr-btc/src/lib.rs - GetSigner opcode
   */
  private async fetchSubfrostSignerKey(): Promise<Buffer> {
    const provider = await this.ensureProvider();

    // Call simulate on 32:0 with opcode 103 (GetSigner)
    // Cellpack format: [block, tx, opcode] = [32, 0, 103]
    const context = this.createSimulateContext(32, 0, [103]);
    const result = await provider.alkanes.simulate(
      '32:0',
      JSON.stringify(context),
      'latest'
    );

    // Result is a hex-encoded SimulateResponse protobuf
    const hexResult = typeof result === 'string' ? result : result?.toString?.() || '';
    const dataBuffer = this.parseSimulateResponse(hexResult);

    if (!dataBuffer || dataBuffer.length === 0) {
      throw new Error('Failed to fetch subfrost signer key');
    }

    return dataBuffer;
  }

  /**
   * Get the subfrost address (dynamically derived)
   */
  async getSubfrostAddress(): Promise<string> {
    if (this.cachedSubfrostAddress) {
      return this.cachedSubfrostAddress;
    }

    const signerKey = await this.fetchSubfrostSignerKey();
    const address = computeP2TRAddress(signerKey, this.network);

    if (!address) {
      throw new Error('Failed to compute subfrost address');
    }

    this.cachedSubfrostAddress = address;
    return address;
  }

  // ==========================================================================
  // Esplora Methods (Bitcoin/UTXO)
  // ==========================================================================

  /**
   * Get UTXOs for an address via esplora_address::utxo
   */
  async getAddressUtxos(address: string): Promise<UTXO[]> {
    const provider = await this.ensureProvider();
    const utxos = await provider.esplora.getAddressUtxos(address);
    return utxos as UTXO[];
  }

  /**
   * Get transaction history for an address via esplora_address::txs
   * This is critical for tracking wrap/unwrap history incrementally
   */
  async getAddressTxs(address: string, lastSeenTxid?: string): Promise<AddressTx[]> {
    const provider = await this.ensureProvider();
    // If lastSeenTxid is provided, fetch txs after that point
    const txs = await provider.esplora.getAddressTxs(address);
    return txs as AddressTx[];
  }

  /**
   * Get BTC balance for an address (sum of UTXO values)
   */
  async getBtcBalance(address: string): Promise<number> {
    const utxos = await this.getAddressUtxos(address);
    return utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
  }

  /**
   * Get BTC locked in the Subfrost address
   */
  async getBtcLocked(): Promise<{ satoshis: number; btc: number; utxoCount: number; address: string }> {
    const address = await this.getSubfrostAddress();
    const utxos = await this.getAddressUtxos(address);
    const satoshis = utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
    return {
      satoshis,
      btc: satoshis / 100_000_000,
      utxoCount: utxos.length,
      address,
    };
  }

  // ==========================================================================
  // Metashrew / Alkanes Methods
  // ==========================================================================

  /**
   * Execute a metashrew_view call
   */
  async metashrewView(viewFn: string, payload: string, blockTag: string = 'latest'): Promise<string> {
    const provider = await this.ensureProvider();
    return provider.metashrew.view(viewFn, payload, blockTag);
  }

  /**
   * Get storage value for an alkane at a specific path
   * Note: This requires a specific opcode for storage reads which may vary by contract
   */
  async getStorageAt(id: AlkaneId, path: string): Promise<string | undefined> {
    const provider = await this.ensureProvider();
    // Storage reads typically use view functions, not simulate
    // This is a placeholder - actual implementation depends on contract
    const contractId = `${id.block}:${id.tx}`;
    const result = await provider.alkanes.view(contractId, path, undefined, 'latest');
    return result;
  }

  /**
   * Parse a SimulateResponse protobuf and extract execution.data
   * Proto structure: SimulateResponse { execution: ExtendedCallResponse { data: bytes } }
   */
  private parseSimulateResponse(hexResult: string): Buffer | null {
    const hex = stripHexPrefix(hexResult);
    const bytes = Buffer.from(hex, 'hex');

    // Simple protobuf parsing for SimulateResponse
    // Field 1 (execution) is wire type 2 (length-delimited)
    let offset = 0;
    while (offset < bytes.length) {
      const tag = bytes[offset++];
      const fieldNum = tag >> 3;
      const wireType = tag & 0x7;

      if (fieldNum === 1 && wireType === 2) {
        // ExtendedCallResponse - length-delimited
        const len = bytes[offset++];
        const extCallBytes = bytes.subarray(offset, offset + len);

        // Parse ExtendedCallResponse for field 3 (data)
        let extOffset = 0;
        while (extOffset < extCallBytes.length) {
          const extTag = extCallBytes[extOffset++];
          const extFieldNum = extTag >> 3;
          const extWireType = extTag & 0x7;

          if (extFieldNum === 3 && extWireType === 2) {
            // data field - length-delimited
            const dataLen = extCallBytes[extOffset++];
            return extCallBytes.subarray(extOffset, extOffset + dataLen) as Buffer;
          } else if (extWireType === 2) {
            // Skip other length-delimited fields
            const skipLen = extCallBytes[extOffset++];
            extOffset += skipLen;
          } else if (extWireType === 0) {
            // Skip varint
            while (extCallBytes[extOffset++] & 0x80) {}
          }
        }
        offset += len;
      } else if (wireType === 2) {
        // Skip other length-delimited fields
        const skipLen = bytes[offset++];
        offset += skipLen;
      } else if (wireType === 0) {
        // Skip varint
        while (bytes[offset++] & 0x80) {}
      }
    }
    return null;
  }

  /**
   * Get frBTC total supply from storage
   * See: reference/subfrost-alkanes/alkanes/fr-btc/src/lib.rs - GetTotalSupply opcode 105
   */
  async getFrbtcTotalSupply(): Promise<{ raw: bigint; adjusted: bigint; btc: number }> {
    const provider = await this.ensureProvider();

    // Call simulate on 32:0 with opcode 105 (GetTotalSupply)
    // Cellpack format: [block, tx, opcode] = [32, 0, 105]
    const context = this.createSimulateContext(32, 0, [105]);
    const result = await provider.alkanes.simulate(
      '32:0',
      JSON.stringify(context),
      'latest'
    );

    // Result is a hex-encoded SimulateResponse protobuf
    const hexResult = typeof result === 'string' ? result : result?.toString?.() || '';
    const dataBuffer = this.parseSimulateResponse(hexResult);

    if (!dataBuffer || dataBuffer.length === 0) {
      throw new Error('Failed to retrieve frBTC total supply');
    }

    // Parse the data as little-endian u128
    const totalSupply = parseU128LE('0x' + dataBuffer.toString('hex'));

    // Correction: unwraps were not calculated in total supply until a specific block
    const adjustedTotalSupply = totalSupply - 4443097n;
    const totalSupplyBtc = Number(adjustedTotalSupply) / 1e8;

    return {
      raw: totalSupply,
      adjusted: adjustedTotalSupply,
      btc: totalSupplyBtc,
    };
  }

  /**
   * Get alkane balances for an address
   */
  async getAlkaneBalances(address: string): Promise<TokenBalance[]> {
    const provider = await this.ensureProvider();
    const balances = await provider.alkanes.getBalance(address);

    return balances.map((entry: any) => ({
      alkaneId: {
        block: BigInt(entry.alkane_id?.block || entry.id?.block || 0),
        tx: BigInt(entry.alkane_id?.tx || entry.id?.tx || 0),
      },
      balance: BigInt(entry.balance || entry.amount || 0),
    }));
  }

  // ==========================================================================
  // Chain State Methods
  // ==========================================================================

  /**
   * Get current blockchain height
   */
  async getCurrentHeight(): Promise<number> {
    const provider = await this.ensureProvider();
    return provider.getBlockHeight();
  }

  /**
   * Execute a Lua script against the blockchain state
   * Uses the SDK's Lua execution with automatic scripthash caching
   */
  async executeLuaScript<T>(script: string, args: unknown[] = []): Promise<T> {
    const provider = await this.ensureProvider();
    const result = await provider.lua.eval(script, args);

    // lua.eval returns { calls, returns, runtime }
    if (result && result.returns !== undefined) {
      return result.returns as T;
    }
    return result as T;
  }

  // ==========================================================================
  // Aggregation Methods (for incremental data sync)
  // ==========================================================================

  /**
   * Get wrap/unwrap transaction data from address history
   * This fetches transactions and filters for wrap/unwrap operations
   */
  async getWrapUnwrapHistory(fromHeight?: number): Promise<{
    wraps: Array<{ txid: string; amount: bigint; blockHeight: number; timestamp: number }>;
    unwraps: Array<{ txid: string; amount: bigint; blockHeight: number; timestamp: number }>;
    lastHeight: number;
  }> {
    const subfrostAddress = await this.getSubfrostAddress();
    const txs = await this.getAddressTxs(subfrostAddress);

    const wraps: Array<{ txid: string; amount: bigint; blockHeight: number; timestamp: number }> = [];
    const unwraps: Array<{ txid: string; amount: bigint; blockHeight: number; timestamp: number }> = [];
    let lastHeight = 0;

    for (const tx of txs) {
      if (!tx.status.confirmed || !tx.status.block_height) continue;
      if (fromHeight && tx.status.block_height <= fromHeight) continue;

      lastHeight = Math.max(lastHeight, tx.status.block_height);

      // Check if this is a wrap (BTC sent TO subfrost address)
      const outputToSubfrost = tx.vout.find(
        (v) => v.scriptpubkey_address === subfrostAddress
      );

      // Check if this is an unwrap (BTC sent FROM subfrost address)
      const inputFromSubfrost = tx.vin.find(
        (v) => v.prevout?.scriptpubkey_address === subfrostAddress
      );

      if (outputToSubfrost && !inputFromSubfrost) {
        // This is a wrap
        wraps.push({
          txid: tx.txid,
          amount: BigInt(outputToSubfrost.value),
          blockHeight: tx.status.block_height,
          timestamp: tx.status.block_time || 0,
        });
      } else if (inputFromSubfrost && !outputToSubfrost) {
        // This is an unwrap (BTC leaving subfrost)
        const totalInput = tx.vin
          .filter((v) => v.prevout?.scriptpubkey_address === subfrostAddress)
          .reduce((sum, v) => sum + (v.prevout?.value || 0), 0);

        unwraps.push({
          txid: tx.txid,
          amount: BigInt(totalInput),
          blockHeight: tx.status.block_height,
          timestamp: tx.status.block_time || 0,
        });
      }
    }

    return { wraps, unwraps, lastHeight };
  }

  /**
   * Aggregate wrap/unwrap totals using Lua script for efficiency
   * This batches multiple RPC calls into a single request
   */
  async aggregateWrapUnwrapTotals(): Promise<{
    totalWrapped: bigint;
    totalUnwrapped: bigint;
    wrapCount: number;
    unwrapCount: number;
    blockHeight: number;
  }> {
    const subfrostAddress = await this.getSubfrostAddress();

    // Use Lua script to aggregate data efficiently
    const luaScript = `
      local address = args[1]
      local results = {
        totalWrapped = 0,
        totalUnwrapped = 0,
        wrapCount = 0,
        unwrapCount = 0,
        blockHeight = 0
      }

      -- Get current height
      results.blockHeight = tonumber(_RPC.metashrew_height()) or 0

      -- Get UTXOs to calculate current balance
      local utxos = _RPC.esplora_addressutxo(address) or {}
      local currentBalance = 0
      for _, utxo in ipairs(utxos) do
        currentBalance = currentBalance + (utxo.value or 0)
      end

      -- Get transaction history
      local txs = _RPC.esplora_addresstxs(address) or {}

      for _, tx in ipairs(txs) do
        if tx.status and tx.status.confirmed then
          local isWrap = false
          local isUnwrap = false
          local amount = 0

          -- Check outputs for wraps (BTC sent to address)
          for _, vout in ipairs(tx.vout or {}) do
            if vout.scriptpubkey_address == address then
              isWrap = true
              amount = amount + (vout.value or 0)
            end
          end

          -- Check inputs for unwraps (BTC sent from address)
          for _, vin in ipairs(tx.vin or {}) do
            if vin.prevout and vin.prevout.scriptpubkey_address == address then
              isUnwrap = true
              amount = amount + (vin.prevout.value or 0)
            end
          end

          if isWrap and not isUnwrap then
            results.totalWrapped = results.totalWrapped + amount
            results.wrapCount = results.wrapCount + 1
          elseif isUnwrap and not isWrap then
            results.totalUnwrapped = results.totalUnwrapped + amount
            results.unwrapCount = results.unwrapCount + 1
          end
        end
      end

      return results
    `;

    const result = await this.executeLuaScript<{
      totalWrapped: number;
      totalUnwrapped: number;
      wrapCount: number;
      unwrapCount: number;
      blockHeight: number;
    }>(luaScript, [subfrostAddress]);

    return {
      totalWrapped: BigInt(result.totalWrapped || 0),
      totalUnwrapped: BigInt(result.totalUnwrapped || 0),
      wrapCount: result.wrapCount || 0,
      unwrapCount: result.unwrapCount || 0,
      blockHeight: result.blockHeight || 0,
    };
  }

  /**
   * Get wrap/unwrap totals from alkanes traces
   * Uses getAddressTxsWithTraces to get accurate frBTC amounts from trace data
   *
   * Trace structure from alkanes-cli:
   * - Wraps: Call to 32:0 with opcode 77, alkane_transfers shows minted frBTC
   * - Unwraps: frBTC burned, BTC released
   *
   * @param fromBlockHeight Only process transactions at or above this block height (0 = all)
   */
  async getWrapUnwrapFromTraces(fromBlockHeight?: number): Promise<{
    totalWrappedFrbtc: bigint;
    totalUnwrappedFrbtc: bigint;
    wrapCount: number;
    unwrapCount: number;
    wraps: Array<{ txid: string; frbtcAmount: bigint; blockHeight: number; senderAddress: string }>;
    unwraps: Array<{ txid: string; frbtcAmount: bigint; blockHeight: number; recipientAddress: string }>;
    lastBlockHeight: number;
  }> {
    const provider = await this.ensureProvider();
    const subfrostAddress = await this.getSubfrostAddress();

    // Fetch ALL transactions with pagination
    let allTxs: any[] = [];
    let lastSeenTxid: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 1000; // Safety limit

    console.log('[getWrapUnwrapFromTraces] Starting pagination to fetch all transactions...');

    while (pageCount < maxPages) {
      pageCount++;

      // Fetch next page
      let page: any[];
      if (lastSeenTxid === undefined) {
        // First page
        page = await provider.getAddressTxs(subfrostAddress);
      } else {
        // Subsequent pages
        page = await provider.getAddressTxsChain(subfrostAddress, lastSeenTxid);
      }

      const pageSize = Array.isArray(page) ? page.length : 0;
      console.log(`[getWrapUnwrapFromTraces] Page ${pageCount}: ${pageSize} transactions`);

      if (pageSize === 0) {
        console.log('[getWrapUnwrapFromTraces] No more transactions');
        break;
      }

      allTxs.push(...page);

      // Update last seen txid for next iteration
      if (pageSize > 0) {
        lastSeenTxid = page[pageSize - 1].txid;
      }

      // If we got less than 25 transactions, this is the last page
      if (pageSize < 25) {
        console.log(`[getWrapUnwrapFromTraces] Last page (${pageSize} < 25 txs)`);
        break;
      }
    }

    console.log(`[getWrapUnwrapFromTraces] Fetched ${allTxs.length} total transactions in ${pageCount} pages`);

    // Now manually enrich transactions with traces by calling the trace endpoint
    console.log('[getWrapUnwrapFromTraces] Enriching transactions with alkanes traces...');

    const txsWithTraces: any[] = [];
    let enrichedCount = 0;
    let opReturnCount = 0;

    // Log first transaction structure for debugging
    if (allTxs.length > 0) {
      console.log(`[getWrapUnwrapFromTraces] Sample transaction structure:`, JSON.stringify(allTxs[0]).substring(0, 500));
    }

    for (const tx of allTxs) {
      // Skip coinbase transactions
      const isCoinbase = tx.vin?.some((vin: any) => vin.is_coinbase);
      if (isCoinbase) continue;

      // Check if transaction has OP_RETURN output (indicates potential alkanes activity)
      const hasOpReturn = tx.vout?.some((vout: any) => vout.scriptpubkey_type === 'op_return');
      if (!hasOpReturn) {
        // No OP_RETURN, no alkanes activity possible
        continue;
      }

      opReturnCount++;

      try {
        // Access the underlying WASM provider for methods not wrapped in AlkanesProvider
        const wasmProvider = (provider as any)._provider;

        // Get transaction hex to decode runestone and extract protostones
        const txData = await wasmProvider.esploraGetTxHex(tx.txid);
        const txHex = typeof txData === 'string' ? txData : txData.hex;
        if (!txHex) {
          console.error(`[getWrapUnwrapFromTraces] No hex data for tx ${tx.txid}`);
          continue;
        }
        const txBytes = Buffer.from(txHex, 'hex');

        // Decode runestone to check for protostones
        const runestoneResult = await wasmProvider.runestoneDecodeTx(tx.txid);

        // Check if there are protostones
        const numProtostones = runestoneResult?.protostones?.length || 0;
        if (numProtostones === 0) continue;

        // Add runestone to transaction
        tx.runestone = runestoneResult;

        // Fetch traces for each protostone
        const baseVout = tx.vout.length + 1;
        const traces = [];

        for (let i = 0; i < numProtostones; i++) {
          const vout = baseVout + i;
          const outpoint = `${tx.txid}:${vout}`;

          try {
            const traceResult = await wasmProvider.alkanesTrace(outpoint);
            traces.push({
              vout,
              outpoint,
              protostone_index: i,
              trace: traceResult,
            });
          } catch (traceError) {
            console.error(`[getWrapUnwrapFromTraces] Failed to fetch trace for ${outpoint}:`, traceError);
          }
        }

        if (traces.length > 0) {
          tx.alkanes_traces = traces;
          txsWithTraces.push(tx);
          enrichedCount++;
        }
      } catch (error) {
        // Log errors for debugging
        console.error(`[getWrapUnwrapFromTraces] Failed to enrich tx ${tx.txid}:`, error);
      }
    }

    console.log(`[getWrapUnwrapFromTraces] Enriched ${enrichedCount} transactions with traces out of ${allTxs.length} total`);
    console.log(`[getWrapUnwrapFromTraces] Transactions with OP_RETURN: ${opReturnCount}`);

    const wraps: Array<{ txid: string; frbtcAmount: bigint; blockHeight: number; senderAddress: string }> = [];
    const unwraps: Array<{ txid: string; frbtcAmount: bigint; blockHeight: number; recipientAddress: string }> = [];
    let totalWrappedFrbtc = 0n;
    let totalUnwrappedFrbtc = 0n;

    // Helper to extract sender address from transaction inputs (for wraps)
    const extractSenderAddress = (tx: any): string => {
      try {
        // For wrap transactions, the sender is in the inputs (vin)
        // We look for the first non-OP_RETURN input with an address
        if (tx.vin && Array.isArray(tx.vin)) {
          for (const input of tx.vin) {
            if (input.prevout?.scriptpubkey_address) {
              return input.prevout.scriptpubkey_address;
            }
          }
        }
      } catch (error) {
        console.error('[extractSenderAddress] Error:', error);
      }
      return '';
    };

    // Helper to extract recipient address from transaction outputs (for unwraps)
    const extractRecipientAddress = (tx: any, subfrostAddr: string): string => {
      try {
        // For unwrap transactions, the recipient is in the outputs (vout)
        // We look for outputs that are NOT the subfrost address and NOT OP_RETURN
        if (tx.vout && Array.isArray(tx.vout)) {
          for (const output of tx.vout) {
            const address = output.scriptpubkey_address;
            if (address && address !== subfrostAddr && output.scriptpubkey_type !== 'op_return') {
              return address;
            }
          }
        }
      } catch (error) {
        console.error('[extractRecipientAddress] Error:', error);
      }
      return '';
    };

    // Count txs with various attributes
    const txsWithTracesCount = txsWithTraces?.filter((tx: any) => tx.alkanes_traces?.length > 0).length || 0;
    const txsWithRunestone = txsWithTraces?.filter((tx: any) => tx.runestone).length || 0;
    const txsWithOpReturn = txsWithTraces?.filter((tx: any) =>
      tx.vout?.some((v: any) => v.scriptpubkey_type === 'op_return')
    ).length || 0;

    console.log('[getWrapUnwrapFromTraces] Txs with alkanes_traces:', txsWithTracesCount);
    console.log('[getWrapUnwrapFromTraces] Txs with runestone:', txsWithRunestone);
    console.log('[getWrapUnwrapFromTraces] Txs with op_return:', txsWithOpReturn);

    // Log first tx structure to understand format
    if (txsWithTraces?.length > 0) {
      const firstTx = txsWithTraces[0];
      console.log('[getWrapUnwrapFromTraces] First tx keys:', Object.keys(firstTx));
      if (firstTx.runestone) {
        console.log('[getWrapUnwrapFromTraces] First tx runestone:', JSON.stringify(firstTx.runestone).substring(0, 500));
      }
      // Find a tx with traces
      const txWithTrace = txsWithTraces.find((tx: any) => tx.alkanes_traces?.length > 0);
      if (txWithTrace) {
        console.log('[getWrapUnwrapFromTraces] Tx with trace keys:', Object.keys(txWithTrace));
        console.log('[getWrapUnwrapFromTraces] Tx alkanes_traces[0]:', JSON.stringify(txWithTrace.alkanes_traces[0]).substring(0, 1000));
      }
    }

    for (const tx of txsWithTraces || []) {
      if (!tx.alkanes_traces || tx.alkanes_traces.length === 0) continue;

      const blockHeight = tx.status?.block_height || 0;

      for (const traceEntry of tx.alkanes_traces) {
        const trace = traceEntry.trace?.trace;
        if (!trace || !trace.events) continue;

        // Debug: Log all event types in this trace
        if (trace.events.length > 0) {
          const eventTypes = trace.events.map((e: any, i: number) => `${i}:${Object.keys(e.event || {})[0] || 'none'}`).join(', ');
          console.log(`[DEBUG] tx ${tx.txid}: ${trace.events.length} events - ${eventTypes}`);
        }

        // Parse trace events to find wrap/unwrap operations
        // We look for EnterCall events to alkane 32:0, check inputs[0] for opcode
        // Opcode 77 = wrap, 78 = unwrap

        // Helper to check if an alkane ID is frBTC (32:0)
        const isFrbtc = (id: any): boolean => {
          if (!id) return false;
          const block = id.block?.lo ?? id.block;
          const txNum = id.tx?.lo ?? id.tx;
          return (block === 32 || block === '32') && (txNum === 0 || txNum === '0');
        };

        // Helper to parse uint128 value
        const parseU128 = (value: any): bigint => {
          if (!value) return 0n;
          if (typeof value === 'object' && 'lo' in value) {
            const lo = BigInt(value.lo || 0);
            const hi = BigInt(value.hi || 0);
            return (hi << 64n) | lo;
          }
          return BigInt(value);
        };

        // Look for EnterCall -> ReturnContext pairs
        for (let i = 0; i < trace.events.length; i++) {
          const eventWrapper = trace.events[i];
          const event = eventWrapper.event;
          if (!event || !event.EnterCall) continue;

          const enterCall = event.EnterCall;

          // Check if this is a call to frBTC (32:0)
          if (!isFrbtc(enterCall.target)) continue;

          // Check inputs[0] for opcode
          const inputs = enterCall.inputs || [];
          if (inputs.length === 0) continue;

          const opcode = inputs[0];
          console.log(`[DEBUG] Found EnterCall to 32:0 with opcode ${opcode} in tx ${tx.txid}`);

          // Find the corresponding ReturnContext event
          let returnContext = null;
          for (let j = i + 1; j < trace.events.length; j++) {
            const nextEvent = trace.events[j].event;
            if (nextEvent?.ReturnContext) {
              returnContext = nextEvent.ReturnContext;
              break;
            }
          }

          if (opcode === 77) {
            // WRAP: Check ReturnContext for amount of 32:0 returned
            if (returnContext?.alkanes) {
              for (const alkaneTransfer of returnContext.alkanes) {
                if (isFrbtc(alkaneTransfer.id)) {
                  const amount = parseU128(alkaneTransfer.value);
                  console.log(`[DEBUG] WRAP tx ${tx.txid}: amount=${amount}`);
                  if (amount > 0n) {
                    const senderAddress = extractSenderAddress(tx);
                    totalWrappedFrbtc += amount;
                    wraps.push({ txid: tx.txid, frbtcAmount: amount, blockHeight, senderAddress });
                  }
                }
              }
            }
          } else if (opcode === 78) {
            // UNWRAP: Amount used in EnterCall minus amount returned in ReturnContext
            let usedAmount = 0n;
            let returnedAmount = 0n;

            // Get amount used from EnterCall
            if (enterCall.alkanes) {
              for (const alkaneTransfer of enterCall.alkanes) {
                if (isFrbtc(alkaneTransfer.id)) {
                  usedAmount += parseU128(alkaneTransfer.value);
                }
              }
            }

            // Get amount returned from ReturnContext
            if (returnContext?.alkanes) {
              for (const alkaneTransfer of returnContext.alkanes) {
                if (isFrbtc(alkaneTransfer.id)) {
                  returnedAmount += parseU128(alkaneTransfer.value);
                }
              }
            }

            // Burned amount is the difference
            const burnedAmount = usedAmount - returnedAmount;
            console.log(`[DEBUG] UNWRAP tx ${tx.txid}: used=${usedAmount}, returned=${returnedAmount}, burned=${burnedAmount}`);
            if (burnedAmount > 0n) {
              const recipientAddress = extractRecipientAddress(tx, subfrostAddress);
              totalUnwrappedFrbtc += burnedAmount;
              unwraps.push({ txid: tx.txid, frbtcAmount: burnedAmount, blockHeight, recipientAddress });
            }
          }
        }
      }
    }

    // Calculate the highest block height we processed
    const allBlockHeights = [
      ...wraps.map(w => w.blockHeight),
      ...unwraps.map(u => u.blockHeight),
    ];
    const lastBlockHeight = allBlockHeights.length > 0 ? Math.max(...allBlockHeights) : fromBlockHeight || 0;

    return {
      totalWrappedFrbtc,
      totalUnwrappedFrbtc,
      wrapCount: wraps.length,
      unwrapCount: unwraps.length,
      wraps,
      unwraps,
      lastBlockHeight,
    };
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/** Singleton instance of the Alkanes client */
export const alkanesClient = new AlkanesClient();

/** Export the class for testing/mocking */
export { AlkanesClient };
