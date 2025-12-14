/**
 * Sync Service - Incremental data synchronization
 *
 * This service handles incremental fetching and persisting of blockchain data
 * to PostgreSQL. It tracks sync state so we never recompute historical data.
 *
 * Key features:
 * - Tracks last synced block height per data type
 * - Incrementally fetches new wrap/unwrap transactions
 * - Stores aggregated totals in database
 * - Uses Redis cache for fast API responses
 */

import { prisma } from './prisma';
import { alkanesClient } from './alkanes-client';
import { cacheSet, cacheDel } from './redis';

// Cache TTLs
const CACHE_TTL_BTC_LOCKED = 60; // 60 seconds
const CACHE_TTL_FRBTC_ISSUED = 60; // 60 seconds
const CACHE_TTL_WRAP_HISTORY = 300; // 5 minutes
const CACHE_TTL_UNWRAP_HISTORY = 300; // 5 minutes

// Sync state keys
const SYNC_KEY_WRAP_UNWRAP = 'wrap_unwrap_sync';
const SYNC_KEY_BTC_LOCKED = 'btc_locked_sync';
const SYNC_KEY_FRBTC_SUPPLY = 'frbtc_supply_sync';

// ============================================================================
// Sync State Management
// ============================================================================

interface SyncState {
  dataType: string;
  lastBlockHeight: number;
  lastTxid: string | null;
  totalWrapped: bigint;
  totalUnwrapped: bigint;
  wrapCount: number;
  unwrapCount: number;
  updatedAt: Date;
}

/**
 * Get the current sync state for a data type
 */
async function getSyncState(dataType: string): Promise<SyncState | null> {
  const state = await prisma.syncState.findUnique({
    where: { dataType },
  });

  if (!state) return null;

  return {
    dataType: state.dataType,
    lastBlockHeight: state.lastBlockHeight,
    lastTxid: state.lastTxid,
    totalWrapped: BigInt(state.totalWrapped || '0'),
    totalUnwrapped: BigInt(state.totalUnwrapped || '0'),
    wrapCount: state.wrapCount || 0,
    unwrapCount: state.unwrapCount || 0,
    updatedAt: state.updatedAt,
  };
}

/**
 * Update sync state after processing new data
 */
async function updateSyncState(
  dataType: string,
  updates: Partial<Omit<SyncState, 'dataType' | 'updatedAt'>>
): Promise<void> {
  await prisma.syncState.upsert({
    where: { dataType },
    create: {
      dataType,
      lastBlockHeight: updates.lastBlockHeight || 0,
      lastTxid: updates.lastTxid || null,
      totalWrapped: updates.totalWrapped?.toString() || '0',
      totalUnwrapped: updates.totalUnwrapped?.toString() || '0',
      wrapCount: updates.wrapCount || 0,
      unwrapCount: updates.unwrapCount || 0,
    },
    update: {
      ...(updates.lastBlockHeight !== undefined && { lastBlockHeight: updates.lastBlockHeight }),
      ...(updates.lastTxid !== undefined && { lastTxid: updates.lastTxid }),
      ...(updates.totalWrapped !== undefined && { totalWrapped: updates.totalWrapped.toString() }),
      ...(updates.totalUnwrapped !== undefined && { totalUnwrapped: updates.totalUnwrapped.toString() }),
      ...(updates.wrapCount !== undefined && { wrapCount: updates.wrapCount }),
      ...(updates.unwrapCount !== undefined && { unwrapCount: updates.unwrapCount }),
    },
  });
}

// ============================================================================
// Wrap/Unwrap Transaction Sync
// ============================================================================

/**
 * Sync wrap/unwrap transactions incrementally
 * This fetches new transactions since last sync and updates aggregates
 */
export async function syncWrapUnwrapTransactions(): Promise<{
  newWraps: number;
  newUnwraps: number;
  lastHeight: number;
}> {
  // Get current sync state
  const state = await getSyncState(SYNC_KEY_WRAP_UNWRAP);
  const fromHeight = state?.lastBlockHeight || 0;

  // Fetch new transactions since last sync
  const { wraps, unwraps, lastHeight } = await alkanesClient.getWrapUnwrapHistory(fromHeight);

  if (wraps.length === 0 && unwraps.length === 0) {
    return { newWraps: 0, newUnwraps: 0, lastHeight: fromHeight };
  }

  // Calculate new totals
  const newTotalWrapped = wraps.reduce((sum, w) => sum + w.amount, 0n);
  const newTotalUnwrapped = unwraps.reduce((sum, u) => sum + u.amount, 0n);

  // Store new wrap transactions
  for (const wrap of wraps) {
    await prisma.wrapTransaction.upsert({
      where: { txid: wrap.txid },
      create: {
        txid: wrap.txid,
        amount: wrap.amount.toString(),
        blockHeight: wrap.blockHeight,
        timestamp: new Date(wrap.timestamp * 1000),
        senderAddress: '', // Will be populated by detailed fetch if needed
        confirmed: true,
      },
      update: {
        confirmed: true,
        blockHeight: wrap.blockHeight,
      },
    });
  }

  // Store new unwrap transactions
  for (const unwrap of unwraps) {
    await prisma.unwrapTransaction.upsert({
      where: { txid: unwrap.txid },
      create: {
        txid: unwrap.txid,
        amount: unwrap.amount.toString(),
        blockHeight: unwrap.blockHeight,
        timestamp: new Date(unwrap.timestamp * 1000),
        recipientAddress: '', // Will be populated by detailed fetch if needed
        confirmed: true,
      },
      update: {
        confirmed: true,
        blockHeight: unwrap.blockHeight,
      },
    });
  }

  // Update sync state with new totals
  const prevTotalWrapped = state?.totalWrapped || 0n;
  const prevTotalUnwrapped = state?.totalUnwrapped || 0n;
  const prevWrapCount = state?.wrapCount || 0;
  const prevUnwrapCount = state?.unwrapCount || 0;

  await updateSyncState(SYNC_KEY_WRAP_UNWRAP, {
    lastBlockHeight: lastHeight,
    totalWrapped: prevTotalWrapped + newTotalWrapped,
    totalUnwrapped: prevTotalUnwrapped + newTotalUnwrapped,
    wrapCount: prevWrapCount + wraps.length,
    unwrapCount: prevUnwrapCount + unwraps.length,
  });

  // Invalidate caches
  await cacheDel('wrap-history');
  await cacheDel('unwrap-history');
  await cacheDel('total-unwraps');

  return {
    newWraps: wraps.length,
    newUnwraps: unwraps.length,
    lastHeight,
  };
}

// ============================================================================
// BTC Locked Sync
// ============================================================================

/**
 * Sync BTC locked snapshot
 * Takes a snapshot of current BTC locked and stores it
 */
export async function syncBtcLocked(): Promise<{
  btcLocked: number;
  satoshis: number;
  utxoCount: number;
  blockHeight: number;
}> {
  const btcData = await alkanesClient.getBtcLocked();
  const currentHeight = await alkanesClient.getCurrentHeight();

  // Store snapshot
  await prisma.btcLockedSnapshot.create({
    data: {
      btcLocked: btcData.btc,
      satoshis: BigInt(btcData.satoshis),
      utxoCount: btcData.utxoCount,
      blockHeight: currentHeight,
    },
  });

  // Update sync state
  await updateSyncState(SYNC_KEY_BTC_LOCKED, {
    lastBlockHeight: currentHeight,
  });

  // Cache the result
  const cacheData = {
    btcLocked: btcData.btc,
    satoshis: btcData.satoshis,
    utxoCount: btcData.utxoCount,
    address: btcData.address,
    timestamp: Date.now(),
  };
  await cacheSet('btc-locked', cacheData, CACHE_TTL_BTC_LOCKED);

  return {
    btcLocked: btcData.btc,
    satoshis: btcData.satoshis,
    utxoCount: btcData.utxoCount,
    blockHeight: currentHeight,
  };
}

// ============================================================================
// frBTC Supply Sync
// ============================================================================

/**
 * Sync frBTC supply snapshot
 * Takes a snapshot of current frBTC supply and stores it
 */
export async function syncFrbtcSupply(): Promise<{
  frbtcIssued: number;
  rawSupply: string;
  adjustedSupply: string;
  blockHeight: number;
}> {
  const supplyData = await alkanesClient.getFrbtcTotalSupply();
  const currentHeight = await alkanesClient.getCurrentHeight();

  // Store snapshot
  await prisma.frbtcSupplySnapshot.create({
    data: {
      frbtcIssued: supplyData.btc,
      rawSupply: supplyData.raw.toString(),
      adjustedSupply: supplyData.adjusted.toString(),
      blockHeight: currentHeight,
    },
  });

  // Update sync state
  await updateSyncState(SYNC_KEY_FRBTC_SUPPLY, {
    lastBlockHeight: currentHeight,
  });

  // Cache the result
  const cacheData = {
    frBtcIssued: supplyData.btc,
    rawSupply: supplyData.raw.toString(),
    adjustedSupply: supplyData.adjusted.toString(),
    timestamp: Date.now(),
  };
  await cacheSet('frbtc-issued', cacheData, CACHE_TTL_FRBTC_ISSUED);

  return {
    frbtcIssued: supplyData.btc,
    rawSupply: supplyData.raw.toString(),
    adjustedSupply: supplyData.adjusted.toString(),
    blockHeight: currentHeight,
  };
}

// ============================================================================
// Full Sync
// ============================================================================

/**
 * Run a full sync of all data types
 * This should be called on page load or periodically
 */
export async function runFullSync(): Promise<{
  btcLocked: { btcLocked: number; blockHeight: number };
  frbtcSupply: { frbtcIssued: number; blockHeight: number };
  wrapUnwrap: { newWraps: number; newUnwraps: number; lastHeight: number };
}> {
  const [btcResult, frbtcResult, wrapUnwrapResult] = await Promise.all([
    syncBtcLocked(),
    syncFrbtcSupply(),
    syncWrapUnwrapTransactions(),
  ]);

  return {
    btcLocked: {
      btcLocked: btcResult.btcLocked,
      blockHeight: btcResult.blockHeight,
    },
    frbtcSupply: {
      frbtcIssued: frbtcResult.frbtcIssued,
      blockHeight: frbtcResult.blockHeight,
    },
    wrapUnwrap: wrapUnwrapResult,
  };
}

// ============================================================================
// Query Methods (for API routes)
// ============================================================================

/**
 * Get aggregated wrap/unwrap totals from sync state
 */
export async function getAggregatedTotals(): Promise<{
  totalWrapped: bigint;
  totalUnwrapped: bigint;
  wrapCount: number;
  unwrapCount: number;
  lastBlockHeight: number;
}> {
  const state = await getSyncState(SYNC_KEY_WRAP_UNWRAP);

  if (!state) {
    // No sync state, need to run initial sync
    const result = await syncWrapUnwrapTransactions();
    const newState = await getSyncState(SYNC_KEY_WRAP_UNWRAP);

    return {
      totalWrapped: newState?.totalWrapped || 0n,
      totalUnwrapped: newState?.totalUnwrapped || 0n,
      wrapCount: newState?.wrapCount || 0,
      unwrapCount: newState?.unwrapCount || 0,
      lastBlockHeight: result.lastHeight,
    };
  }

  return {
    totalWrapped: state.totalWrapped,
    totalUnwrapped: state.totalUnwrapped,
    wrapCount: state.wrapCount,
    unwrapCount: state.unwrapCount,
    lastBlockHeight: state.lastBlockHeight,
  };
}

/**
 * Get wrap transaction history from database
 */
export async function getWrapHistory(
  count: number = 25,
  offset: number = 0
): Promise<{
  items: Array<{
    txid: string;
    amount: string;
    blockHeight: number;
    timestamp: Date;
    senderAddress: string;
  }>;
  total: number;
}> {
  const [items, total] = await Promise.all([
    prisma.wrapTransaction.findMany({
      where: { confirmed: true },
      orderBy: { blockHeight: 'desc' },
      take: count,
      skip: offset,
      select: {
        txid: true,
        amount: true,
        blockHeight: true,
        timestamp: true,
        senderAddress: true,
      },
    }),
    prisma.wrapTransaction.count({ where: { confirmed: true } }),
  ]);

  return { items, total };
}

/**
 * Get unwrap transaction history from database
 */
export async function getUnwrapHistory(
  count: number = 25,
  offset: number = 0
): Promise<{
  items: Array<{
    txid: string;
    amount: string;
    blockHeight: number;
    timestamp: Date;
    recipientAddress: string;
  }>;
  total: number;
}> {
  const [items, total] = await Promise.all([
    prisma.unwrapTransaction.findMany({
      where: { confirmed: true },
      orderBy: { blockHeight: 'desc' },
      take: count,
      skip: offset,
      select: {
        txid: true,
        amount: true,
        blockHeight: true,
        timestamp: true,
        recipientAddress: true,
      },
    }),
    prisma.unwrapTransaction.count({ where: { confirmed: true } }),
  ]);

  return { items, total };
}

/**
 * Get the latest BTC locked from database (for fast API response)
 */
export async function getLatestBtcLocked(): Promise<{
  btcLocked: number;
  satoshis: bigint;
  utxoCount: number;
  blockHeight: number;
  timestamp: Date;
} | null> {
  const latest = await prisma.btcLockedSnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  return latest;
}

/**
 * Get the latest frBTC supply from database (for fast API response)
 */
export async function getLatestFrbtcSupply(): Promise<{
  frbtcIssued: number;
  rawSupply: string;
  adjustedSupply: string;
  blockHeight: number;
  timestamp: Date;
} | null> {
  const latest = await prisma.frbtcSupplySnapshot.findFirst({
    orderBy: { createdAt: 'desc' },
  });

  if (!latest) return null;

  return {
    frbtcIssued: latest.frbtcIssued,
    rawSupply: latest.rawSupply,
    adjustedSupply: latest.adjustedSupply,
    blockHeight: latest.blockHeight,
    timestamp: latest.createdAt,
  };
}
