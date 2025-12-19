/**
 * BRC2.0 Client - Interface for BRC2.0 smart contract interactions
 *
 * This module provides methods to interact with the BRC2.0 FrBTC contract
 * at 0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337 via the BRC2.0 RPC at
 * https://rpc.brc20.build
 *
 * Key functions:
 * - getTotalSupply(): Get the total frBTC supply from BRC2.0
 * - getSignerAddress(): Get the signer address (returns bytes, needs bech32m encoding)
 * - getBtcLockedAtSignerAddress(): Query BTC locked at the computed taproot address
 */

import { keccak256, toHex } from 'viem';
import * as bitcoin from 'bitcoinjs-lib';
import * as ecc from 'tiny-secp256k1';
import { alkanesClient } from './alkanes-client';

bitcoin.initEccLib(ecc);

// ============================================================================
// Constants
// ============================================================================

/** BRC2.0 RPC endpoint */
const BRC20_RPC_URL = 'https://rpc.brc20.build';

/** FrBTC contract address on BRC2.0 */
const FRBTC_CONTRACT_ADDRESS = '0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337';

/** Function selectors (first 4 bytes of keccak256 of function signature) */
const SELECTORS = {
  // keccak256("totalSupply()") = 0x18160ddd...
  totalSupply: '0x18160ddd',
  // keccak256("getSignerAddress()") - we'll compute this
  getSignerAddress: '', // Will be computed in init
};

// Compute getSignerAddress selector
const getSignerAddressSelector = keccak256(
  toHex(new TextEncoder().encode('getSignerAddress()'))
).slice(0, 10); // First 4 bytes = 10 hex chars including 0x
SELECTORS.getSignerAddress = getSignerAddressSelector;

// ============================================================================
// Types
// ============================================================================

interface EthCallParams {
  to: string;
  data: string;
}

interface JsonRpcRequest {
  jsonrpc: '2.0';
  method: string;
  params: unknown[];
  id: number;
}

interface JsonRpcResponse {
  jsonrpc: '2.0';
  id: number;
  result?: string;
  error?: {
    code: number;
    message: string;
  };
}

export interface Brc20FrbtcStats {
  totalSupply: bigint;
  totalSupplyBtc: number;
  signerAddress: string;
  btcLocked: {
    satoshis: number;
    btc: number;
    utxoCount: number;
  };
  timestamp: number;
}

// ============================================================================
// Utility Functions
// ============================================================================

/**
 * Make an eth_call to the BRC2.0 RPC
 */
async function ethCall(params: EthCallParams): Promise<string> {
  const request: JsonRpcRequest = {
    jsonrpc: '2.0',
    method: 'eth_call',
    params: [params, 'latest'],
    id: Date.now(),
  };

  const response = await fetch(BRC20_RPC_URL, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
    },
    body: JSON.stringify(request),
  });

  if (!response.ok) {
    throw new Error(`BRC2.0 RPC error: ${response.status} ${response.statusText}`);
  }

  const json = (await response.json()) as JsonRpcResponse;

  if (json.error) {
    throw new Error(`BRC2.0 RPC error: ${json.error.message}`);
  }

  return json.result || '0x';
}

/**
 * Decode uint256 from hex string
 */
function decodeUint256(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

/**
 * Decode bytes from hex string (removes length prefix if present)
 * For Solidity bytes return type, the data is ABI encoded:
 * - offset (32 bytes)
 * - length (32 bytes)
 * - data (padded to 32 bytes)
 */
function decodeBytes(hex: string): Buffer {
  if (!hex || hex === '0x') return Buffer.alloc(0);

  // Remove 0x prefix
  const cleanHex = hex.startsWith('0x') ? hex.slice(2) : hex;

  // If this is ABI-encoded bytes, it has:
  // - 32 bytes offset (usually 0x20 = 32)
  // - 32 bytes length
  // - actual data
  if (cleanHex.length >= 128) {
    // Read offset (first 32 bytes)
    const offset = parseInt(cleanHex.slice(0, 64), 16);

    // Read length at offset position
    const lengthStart = offset * 2;
    const length = parseInt(cleanHex.slice(lengthStart, lengthStart + 64), 16);

    // Read data after length
    const dataStart = lengthStart + 64;
    const dataHex = cleanHex.slice(dataStart, dataStart + length * 2);

    return Buffer.from(dataHex, 'hex');
  }

  // Otherwise, try to decode as raw bytes
  return Buffer.from(cleanHex, 'hex');
}

/**
 * Convert scriptPubKey bytes to P2TR (bech32m) address
 * The BRC2.0 contract returns a scriptPubKey: 5120 <32-byte-output-key>
 * where the output key is already tweaked.
 */
function scriptPubKeyToP2trAddress(bytes: Buffer, network: string): string {
  let witnessData: Buffer;

  if (bytes.length === 34 && bytes[0] === 0x51 && bytes[1] === 0x20) {
    // Full scriptPubKey: 51 20 <32-byte-output-key>
    witnessData = bytes.subarray(2);
  } else if (bytes.length === 32) {
    // Just the output key
    witnessData = bytes;
  } else {
    throw new Error(`Invalid scriptPubKey length: ${bytes.length}, expected 34 (scriptPubKey) or 32 (output key)`);
  }

  // Select bech32 prefix based on network
  let prefix: string;
  switch (network) {
    case 'mainnet':
      prefix = 'bc';
      break;
    case 'testnet':
    case 'signet':
      prefix = 'tb';
      break;
    case 'regtest':
      prefix = 'bcrt';
      break;
    default:
      prefix = 'bc';
  }

  // Encode as bech32m address with witness version 1
  const address = bitcoin.address.toBech32(witnessData, 1, prefix);

  return address;
}

// ============================================================================
// BRC2.0 Client Class
// ============================================================================

class Brc20Client {
  private network: string;
  private cachedSignerAddress: string | null = null;

  constructor() {
    this.network = process.env.NEXT_PUBLIC_NETWORK || 'mainnet';
  }

  /**
   * Get the total supply of frBTC from BRC2.0 contract
   */
  async getTotalSupply(): Promise<{ raw: bigint; btc: number }> {
    const result = await ethCall({
      to: FRBTC_CONTRACT_ADDRESS,
      data: SELECTORS.totalSupply,
    });

    const totalSupply = decodeUint256(result);
    const btc = Number(totalSupply) / 1e8;

    return { raw: totalSupply, btc };
  }

  /**
   * Get the signer address bytes from BRC2.0 contract
   * This returns raw bytes that need to be bech32m encoded
   */
  async getSignerAddressBytes(): Promise<Buffer> {
    const result = await ethCall({
      to: FRBTC_CONTRACT_ADDRESS,
      data: SELECTORS.getSignerAddress,
    });

    return decodeBytes(result);
  }

  /**
   * Get the signer address as a bech32m-encoded P2TR address
   * Caches the result since the signer address doesn't change
   */
  async getSignerAddress(): Promise<string> {
    if (this.cachedSignerAddress) {
      return this.cachedSignerAddress;
    }

    const signerBytes = await this.getSignerAddressBytes();
    const address = scriptPubKeyToP2trAddress(signerBytes, this.network);

    // Verify it matches expected address (sanity check)
    const expectedAddress = 'bc1pxn3gr0hy70exhdqjzawtuygppzdrk3mer3wlaa2gzkmruk3rrt4qga2qaj';
    if (this.network === 'mainnet' && address !== expectedAddress) {
      console.warn(
        `[Brc20Client] Computed signer address ${address} differs from expected ${expectedAddress}`
      );
    }

    this.cachedSignerAddress = address;
    return address;
  }

  /**
   * Get BTC locked at the signer address using esplora
   */
  async getBtcLockedAtSignerAddress(): Promise<{
    satoshis: number;
    btc: number;
    utxoCount: number;
    address: string;
  }> {
    const address = await this.getSignerAddress();

    // Use alkanes client's esplora to query UTXOs
    const utxos = await alkanesClient.getAddressUtxos(address);
    const satoshis = utxos.reduce((sum, utxo) => sum + (utxo.value || 0), 0);

    return {
      satoshis,
      btc: satoshis / 100_000_000,
      utxoCount: utxos.length,
      address,
    };
  }

  /**
   * Get complete BRC2.0 frBTC stats
   * This fetches total supply, signer address, and BTC locked in one call
   */
  async getStats(): Promise<Brc20FrbtcStats> {
    // Fetch total supply and signer address in parallel
    const [supplyData, signerAddress] = await Promise.all([
      this.getTotalSupply(),
      this.getSignerAddress(),
    ]);

    // Then fetch BTC locked
    const btcLocked = await this.getBtcLockedAtSignerAddress();

    return {
      totalSupply: supplyData.raw,
      totalSupplyBtc: supplyData.btc,
      signerAddress,
      btcLocked: {
        satoshis: btcLocked.satoshis,
        btc: btcLocked.btc,
        utxoCount: btcLocked.utxoCount,
      },
      timestamp: Date.now(),
    };
  }

  /**
   * Clear cached signer address (for testing)
   */
  clearCache(): void {
    this.cachedSignerAddress = null;
  }
}

// ============================================================================
// Singleton Export
// ============================================================================

/** Singleton instance of the BRC2.0 client */
export const brc20Client = new Brc20Client();

/** Export the class for testing/mocking */
export { Brc20Client };
