/**
 * Admin API: Sync Status
 *
 * Returns the current status of all sync operations including:
 * - Whether locks are currently held
 * - Last synced block heights
 * - Current totals
 *
 * This is useful for monitoring sync progress and detecting issues.
 */
import { NextResponse } from 'next/server';
import { requireAdminSecret } from '@/lib/api/service-key';
import { isLocked } from '@/lib/redis';
import { prisma } from '@/lib/prisma';

export async function GET(request: Request) {
  try {
    // Require a configured secret; never fall back to a default.
    // 7-24 audit: constant-time compare via the shared guard (was a plain `!==`).
    const denied = requireAdminSecret(request);
    if (denied) return denied;

    // Check all lock statuses
    const [
      wrapUnwrapLocked,
      btcLockedLocked,
      frbtcSupplyLocked,
      fullSyncLocked,
    ] = await Promise.all([
      isLocked('lock:wrap_unwrap_sync'),
      isLocked('lock:btc_locked_sync'),
      isLocked('lock:frbtc_supply_sync'),
      isLocked('lock:full_sync'),
    ]);

    // Get sync state from database
    const [wrapUnwrapState, btcLockedState, frbtcSupplyState] = await Promise.all([
      prisma.syncState.findUnique({ where: { dataType: 'wrap_unwrap_sync' } }),
      prisma.syncState.findUnique({ where: { dataType: 'btc_locked_sync' } }),
      prisma.syncState.findUnique({ where: { dataType: 'frbtc_supply_sync' } }),
    ]);

    return NextResponse.json({
      locks: {
        wrapUnwrap: wrapUnwrapLocked,
        btcLocked: btcLockedLocked,
        frbtcSupply: frbtcSupplyLocked,
        fullSync: fullSyncLocked,
      },
      syncState: {
        wrapUnwrap: wrapUnwrapState ? {
          lastBlockHeight: wrapUnwrapState.lastBlockHeight,
          totalWrapped: wrapUnwrapState.totalWrapped,
          totalUnwrapped: wrapUnwrapState.totalUnwrapped,
          wrapCount: wrapUnwrapState.wrapCount,
          unwrapCount: wrapUnwrapState.unwrapCount,
          updatedAt: wrapUnwrapState.updatedAt,
        } : null,
        btcLocked: btcLockedState ? {
          lastBlockHeight: btcLockedState.lastBlockHeight,
          updatedAt: btcLockedState.updatedAt,
        } : null,
        frbtcSupply: frbtcSupplyState ? {
          lastBlockHeight: frbtcSupplyState.lastBlockHeight,
          updatedAt: frbtcSupplyState.updatedAt,
        } : null,
      },
      anySyncInProgress: wrapUnwrapLocked || btcLockedLocked || frbtcSupplyLocked || fullSyncLocked,
      timestamp: Date.now(),
    });
  } catch (error) {
    console.error('[Admin] Error checking sync status:', error);
    return NextResponse.json(
      { error: 'Failed to check sync status.' },
      { status: 500 }
    );
  }
}
