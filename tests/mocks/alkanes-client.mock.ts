/**
 * Mock utilities for AlkanesClient
 *
 * Provides consistent mock data and utilities for testing API routes
 * that depend on the alkanes-client.
 */

import { vi } from 'vitest';

// Mock data that matches real production responses
export const mockBtcLockedData = {
  satoshis: 123456789,
  btc: 1.23456789,
  utxoCount: 42,
  address: 'bc1puvfmy5whzdq35nd2trckkm09em9u7ps6lal564jz92c9feswwrpsr7ach5',
};

export const mockFrbtcSupplyData = {
  raw: 123456789n,
  adjusted: 119013692n,
  btc: 1.19013692,
};

export const mockCurrentHeight = 927500;

export const mockUtxos = [
  {
    txid: 'abc123def456789012345678901234567890123456789012345678901234abcd',
    vout: 0,
    value: 50000000,
    status: {
      confirmed: true,
      block_height: 927400,
      block_hash: 'blockhash123',
      block_time: 1702500000,
    },
  },
  {
    txid: 'def456abc789012345678901234567890123456789012345678901234567efgh',
    vout: 1,
    value: 73456789,
    status: {
      confirmed: true,
      block_height: 927450,
      block_hash: 'blockhash456',
      block_time: 1702510000,
    },
  },
];

export const mockTokenBalances = [
  {
    alkaneId: { block: 32n, tx: 0n },
    balance: 100000000n,
    symbol: 'frBTC',
    name: 'Fractional Bitcoin',
  },
  {
    alkaneId: { block: 2n, tx: 0n },
    balance: 500000000n,
    symbol: 'DIESEL',
    name: 'DIESEL',
  },
];

/**
 * Create a mock AlkanesClient with all methods mocked
 */
export function createMockAlkanesClient() {
  return {
    getRpcUrl: vi.fn().mockReturnValue('https://mainnet.subfrost.io/v4/subfrost'),
    getSubfrostAddress: vi.fn().mockResolvedValue(mockBtcLockedData.address),
    getAddressUtxos: vi.fn().mockResolvedValue(mockUtxos),
    getBtcBalance: vi.fn().mockResolvedValue(mockBtcLockedData.satoshis),
    getBtcLocked: vi.fn().mockResolvedValue(mockBtcLockedData),
    getStorageAt: vi.fn().mockResolvedValue('0x15cd5b0700000000'),
    getFrbtcTotalSupply: vi.fn().mockResolvedValue(mockFrbtcSupplyData),
    getAlkaneBalances: vi.fn().mockResolvedValue(mockTokenBalances),
    getCurrentHeight: vi.fn().mockResolvedValue(mockCurrentHeight),
    executeLuaScript: vi.fn().mockResolvedValue({ result: 'mock' }),
    executeSavedLuaScript: vi.fn().mockResolvedValue({ result: 'mock' }),
  };
}

/**
 * Setup the alkanesClient mock module
 */
export function setupAlkanesClientMock(mockClient = createMockAlkanesClient()) {
  vi.mock('@/lib/alkanes-client', () => ({
    alkanesClient: mockClient,
    FRBTC_TOKEN: {
      alkaneId: { block: 32n, tx: 0n },
      decimals: 8,
      symbol: 'frBTC',
      name: 'Fractional Bitcoin',
    },
    KNOWN_TOKENS: {
      '2:0': { symbol: 'DIESEL', name: 'DIESEL', decimals: 8 },
      '32:0': { symbol: 'frBTC', name: 'Fractional BTC', decimals: 8 },
    },
    reverseHex: (hex: string) => {
      if (hex.startsWith('0x')) hex = hex.slice(2);
      if (hex.length % 2) hex = '0' + hex;
      const buf = Buffer.from(hex, 'hex');
      return '0x' + buf.reverse().toString('hex');
    },
    formatAlkaneId: (id: { block: bigint; tx: bigint }) => `${id.block}:${id.tx}`,
    parseAlkaneId: (str: string) => {
      const [block, tx] = str.split(':');
      return { block: BigInt(block), tx: BigInt(tx) };
    },
  }));

  return mockClient;
}
