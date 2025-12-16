/**
 * Shared blockchain data fetching functions
 *
 * These functions call @alkanes/ts-sdk directly and can be tested
 * in isolation without the HTTP layer for faster integration tests.
 */

import { alkanesClient } from './alkanes-client';

export interface BtcLockedData {
  btcLocked: number;
  satoshis: string;
  utxoCount: number;
  address: string;
}

export interface FrbtcIssuedData {
  frBtcIssued: number;
  rawSupply: string;
  adjustedSupply: string;
}

export interface WrapItem {
  txid: string;
  amount: number;
  blockHeight?: number;
  timestamp?: string;
  senderAddress?: string;
}

export interface UnwrapItem {
  txid: string;
  amount: number;
  blockHeight?: number;
  timestamp?: string;
  recipientAddress?: string;
}

export interface WrapHistoryData {
  items: WrapItem[];
  total: number;
}

export interface UnwrapHistoryData {
  items: UnwrapItem[];
  total: number;
}

export interface TotalUnwrapsData {
  totalUnwraps: number;
  totalUnwrapsSatoshis: string;
  unwrapCount: number;
}

/**
 * Fetches BTC locked data from the SDK
 */
export async function getBtcLockedData(): Promise<BtcLockedData> {
  const btcLocked = await alkanesClient.getBtcLocked();
  return {
    btcLocked: btcLocked.btc,
    satoshis: typeof btcLocked.satoshis === 'string' ? btcLocked.satoshis : String(btcLocked.satoshis),
    utxoCount: btcLocked.utxoCount,
    address: btcLocked.address,
  };
}

/**
 * Fetches frBTC supply data from the SDK
 */
export async function getFrbtcIssuedData(): Promise<FrbtcIssuedData> {
  const supply = await alkanesClient.getFrbtcTotalSupply();
  return {
    frBtcIssued: supply.btc,
    rawSupply: supply.raw.toString(),
    adjustedSupply: supply.adjusted.toString(),
  };
}

/**
 * Fetches wrap history from the SDK
 */
export async function getWrapHistoryData(count: number = 25, offset: number = 0): Promise<WrapHistoryData> {
  const traces = await alkanesClient.getWrapUnwrapFromTraces();
  const wraps = traces.wraps.slice(offset, offset + count);

  return {
    items: wraps.map((wrap: any) => ({
      txid: wrap.txid,
      amount: wrap.amount,
      blockHeight: wrap.blockHeight,
      timestamp: wrap.timestamp,
      senderAddress: wrap.senderAddress,
    })),
    total: traces.wraps.length,
  };
}

/**
 * Fetches unwrap history from the SDK
 */
export async function getUnwrapHistoryData(count: number = 25, offset: number = 0): Promise<UnwrapHistoryData> {
  const traces = await alkanesClient.getWrapUnwrapFromTraces();
  const unwraps = traces.unwraps.slice(offset, offset + count);

  return {
    items: unwraps.map((unwrap: any) => ({
      txid: unwrap.txid,
      amount: unwrap.amount,
      blockHeight: unwrap.blockHeight,
      timestamp: unwrap.timestamp,
      recipientAddress: unwrap.recipientAddress,
    })),
    total: unwraps.length,
  };
}

/**
 * Fetches total unwraps data from the SDK
 */
export async function getTotalUnwrapsData(): Promise<TotalUnwrapsData> {
  const traces = await alkanesClient.getWrapUnwrapFromTraces();
  const totalUnwrapsBtc = traces.totalUnwrappedFrbtc;

  // Convert BTC to satoshis (multiply by 1e8)
  // Handle BigInt conversion if necessary
  const totalUnwrapsSatoshis = Math.round(Number(totalUnwrapsBtc) * 1e8);

  return {
    totalUnwraps: Number(totalUnwrapsBtc),
    totalUnwrapsSatoshis: totalUnwrapsSatoshis.toString(),
    unwrapCount: traces.unwraps.length,
  };
}
