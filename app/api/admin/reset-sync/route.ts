/**
 * Admin API: Reset Wrap/Unwrap Sync
 *
 * This endpoint resets the wrap/unwrap sync state and clears existing transactions
 * to force a complete re-sync with address extraction.
 *
 * WARNING: This is an admin-only operation.
 */
import { NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { cacheDel, isLocked, getRedisClient } from '@/lib/redis';

export async function POST(request: Request) {
  try {
    // Simple auth check - require a secret header
    const authHeader = request.headers.get('x-admin-secret');
    const expectedSecret = process.env.ADMIN_SECRET || 'change-me-in-production';

    if (authHeader !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Admin] Resetting wrap/unwrap sync state...');

    // Check if a sync is currently in progress
    const syncInProgress = await isLocked('lock:wrap_unwrap_sync');
    const fullSyncInProgress = await isLocked('lock:full_sync');

    if (syncInProgress || fullSyncInProgress) {
      console.warn('[Admin] WARNING: Sync is currently in progress, but proceeding with reset');
    }

    // Delete wrap/unwrap sync state to force re-sync from scratch
    await prisma.syncState.delete({
      where: { dataType: 'wrap_unwrap_sync' }
    }).catch(() => console.log('[Admin] Sync state not found (OK)'));

    // Delete existing wrap/unwrap transactions so they'll be re-fetched with addresses
    const deletedWraps = await prisma.wrapTransaction.deleteMany();
    const deletedUnwraps = await prisma.unwrapTransaction.deleteMany();

    // Delete all snapshots
    const deletedBtcSnapshots = await prisma.btcLockedSnapshot.deleteMany();
    const deletedFrbtcSnapshots = await prisma.frBtcSupplySnapshot.deleteMany();

    // Clear ALL Redis cache keys
    const redis = await getRedisClient();
    let clearedKeys = 0;
    if (redis) {
      const keys = await redis.keys('*');
      if (keys.length > 0) {
        await redis.del(...keys);
        clearedKeys = keys.length;
      }
    }

    console.log(`[Admin] Deleted ${deletedWraps.count} wrap transactions`);
    console.log(`[Admin] Deleted ${deletedUnwraps.count} unwrap transactions`);
    console.log(`[Admin] Deleted ${deletedBtcSnapshots.count} BTC locked snapshots`);
    console.log(`[Admin] Deleted ${deletedFrbtcSnapshots.count} frBTC supply snapshots`);
    console.log(`[Admin] Cleared ${clearedKeys} Redis cache keys`);

    return NextResponse.json({
      success: true,
      deleted: {
        wraps: deletedWraps.count,
        unwraps: deletedUnwraps.count,
        btcSnapshots: deletedBtcSnapshots.count,
        frbtcSnapshots: deletedFrbtcSnapshots.count,
        redisKeys: clearedKeys,
      },
      message: 'All cache and database state cleared. Next API call will trigger a full re-sync.',
      warning: syncInProgress || fullSyncInProgress ? 'A sync was in progress when reset was triggered' : undefined,
    });
  } catch (error) {
    console.error('[Admin] Error resetting sync:', error);
    return NextResponse.json(
      { error: 'Failed to reset sync state.' },
      { status: 500 }
    );
  }
}
