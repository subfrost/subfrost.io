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

import { AlkanesRpc } from 'alkanes/lib/rpc.js';

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

// ============================================================================
// Constants
// ============================================================================

/** Subfrost BTC address */
export const SUBFROST_ADDRESS = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';

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
 */
class AlkanesClient {
  private rpc: AlkanesRpc | null = null;
  private rpcUrl: string;

  constructor() {
    this.rpcUrl = process.env.ALKANES_RPC_URL || 'https://mainnet.subfrost.io/v4/subfrost';
  }

  /**
   * Get the RPC URL being used
   */
  getRpcUrl(): string {
    return this.rpcUrl;
  }

  /**
   * Get or create RPC client
   */
  private getRpc(): AlkanesRpc {
    if (!this.rpc) {
      this.rpc = new AlkanesRpc({ baseUrl: this.rpcUrl });
    }
    return this.rpc;
  }

  // ==========================================================================
  // Esplora Methods (Bitcoin/UTXO)
  // ==========================================================================

  /**
   * Get UTXOs for an address via esplora_address::utxo
   */
  async getAddressUtxos(address: string): Promise<UTXO[]> {
    const rpc = this.getRpc();
    const result = await (rpc as any).call('esplora_address::utxo', [address]);
    return result as UTXO[];
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
  async getBtcLocked(): Promise<{ satoshis: number; btc: number; utxoCount: number }> {
    const utxos = await this.getAddressUtxos(SUBFROST_ADDRESS);
    const satoshis = utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);
    return {
      satoshis,
      btc: satoshis / 100_000_000,
      utxoCount: utxos.length,
    };
  }

  // ==========================================================================
  // Alkanes/Token Methods
  // ==========================================================================

  /**
   * Get storage value for an alkane at a specific path
   */
  async getStorageAt(id: AlkaneId, path: Uint8Array): Promise<string | undefined> {
    const rpc = this.getRpc();
    return rpc.getstorageat({ id, path });
  }

  /**
   * Get frBTC total supply
   */
  async getFrbtcTotalSupply(): Promise<{ raw: bigint; adjusted: bigint; btc: number }> {
    const path = new TextEncoder().encode('/totalsupply');
    const storageHex = await this.getStorageAt(FRBTC_TOKEN.alkaneId, path);

    if (!storageHex || storageHex === '0x') {
      throw new Error('Failed to retrieve frBTC storage data');
    }

    const littleEndianHex = reverseHex(storageHex);
    const totalSupply = BigInt(littleEndianHex);

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
    const rpc = this.getRpc();
    const result = await rpc.protorunesbyaddress({ address, protocolTag: 1n });

    // Parse the result into TokenBalance format
    if (!result || !Array.isArray(result.balanceSheet)) {
      return [];
    }

    return result.balanceSheet.map((entry: any) => ({
      alkaneId: {
        block: BigInt(entry.alkane?.block || entry.rune?.block || 0),
        tx: BigInt(entry.alkane?.tx || entry.rune?.tx || 0),
      },
      balance: BigInt(entry.balance || 0),
    }));
  }

  // ==========================================================================
  // Chain State Methods
  // ==========================================================================

  /**
   * Get current blockchain height
   */
  async getCurrentHeight(): Promise<number> {
    const rpc = this.getRpc();
    const result = await (rpc as any).call('metashrew_height', []);
    return Number(result);
  }

  /**
   * Execute a Lua script against the blockchain state
   */
  async executeLuaScript<T>(script: string, args: unknown[]): Promise<T> {
    const rpc = this.getRpc();
    const result = await (rpc as any).call('lua_evalscript', [script, ...args]);
    return result as T;
  }

  /**
   * Execute a saved Lua script by its hash
   */
  async executeSavedLuaScript<T>(scriptHash: string, args: unknown[]): Promise<T> {
    const rpc = this.getRpc();
    const result = await (rpc as any).call('lua_evalsaved', [scriptHash, ...args]);
    return result as T;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/** Singleton instance of the Alkanes client */
export const alkanesClient = new AlkanesClient();

/** Export the class for testing/mocking */
export { AlkanesClient };
