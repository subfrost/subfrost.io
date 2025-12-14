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

  // ==========================================================================
  // Subfrost Address Methods
  // ==========================================================================

  /**
   * Fetch the subfrost signer public key via simulate (32:0 opcode 103)
   */
  private async fetchSubfrostSignerKey(): Promise<Buffer> {
    const provider = await this.ensureProvider();

    // Call simulate on 32:0 with opcode 103 to get the public key
    const result = await provider.alkanes.simulate(
      { block: 32, tx: 0 },
      JSON.stringify({ inputs: [103] }),
      'latest'
    );

    if (!result?.execution?.data) {
      throw new Error('Failed to fetch subfrost signer key');
    }

    return Buffer.from(stripHexPrefix(result.execution.data), 'hex');
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
   */
  async getStorageAt(id: AlkaneId, path: string): Promise<string | undefined> {
    const provider = await this.ensureProvider();
    // Use simulate to read storage
    const result = await provider.alkanes.simulate(
      { block: Number(id.block), tx: Number(id.tx) },
      JSON.stringify({ storage_read: path }),
      'latest'
    );
    return result?.execution?.data;
  }

  /**
   * Get frBTC total supply from storage
   */
  async getFrbtcTotalSupply(): Promise<{ raw: bigint; adjusted: bigint; btc: number }> {
    const provider = await this.ensureProvider();

    // Use metashrew_view with simulate to get total supply from 32:0 storage
    // The storage key for total supply is '/totalsupply'
    const result = await provider.metashrew.view(
      'simulate',
      // Protobuf-encoded call to 32:0 with opcode to read total supply (101)
      '0x20e0ce382a03020065013001',
      'latest'
    );

    if (!result || result === '0x') {
      throw new Error('Failed to retrieve frBTC storage data');
    }

    // Parse the response - it contains the total supply as little-endian u128
    const totalSupply = parseU128LE(result);

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
}

// ============================================================================
// Singleton Export
// ============================================================================

/** Singleton instance of the Alkanes client */
export const alkanesClient = new AlkanesClient();

/** Export the class for testing/mocking */
export { AlkanesClient };
