/**
 * API Route: Admin Clear All
 *
 * Clears all cache and database state to force a complete resync.
 * Requires admin authentication.
 */

import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/prisma';
import { getRedisClient } from '@/lib/redis';

export async function POST(request: NextRequest) {
  try {
    // Check admin authentication
    const adminSecret = request.headers.get('x-admin-secret');
    if (!adminSecret || adminSecret !== process.env.ADMIN_SECRET) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    const results = {
      redis: { cleared: false, keys: 0 },
      database: {
        wraps: 0,
        unwraps: 0,
        btcLockedSnapshots: 0,
        frbtcSupplySnapshots: 0,
        syncStates: 0,
      },
    };

    // Clear all Redis cache keys
    try {
      const redis = await getRedisClient();
      if (redis) {
        const keys = await redis.keys('*');
        if (keys.length > 0) {
          await redis.del(keys);
        }
        results.redis.cleared = true;
        results.redis.keys = keys.length;
      }
    } catch (error) {
      console.error('[Admin] Error clearing Redis:', error);
    }

    // Clear all database tables
    try {
      // Check if prisma is available
      if (!prisma) {
        throw new Error('Database client not available');
      }

      // Execute deletions in parallel
      const [wraps, unwraps, btcLocked, frbtcSupply, syncStates] = await Promise.all([
        prisma.wrapTransaction.deleteMany({}),
        prisma.unwrapTransaction.deleteMany({}),
        prisma.btcLockedSnapshot.deleteMany({}),
        prisma.frbtcSupplySnapshot.deleteMany({}),
        prisma.syncState.deleteMany({}),
      ]);

      results.database.wraps = wraps.count;
      results.database.unwraps = unwraps.count;
      results.database.btcLockedSnapshots = btcLocked.count;
      results.database.frbtcSupplySnapshots = frbtcSupply.count;
      results.database.syncStates = syncStates.count;
    } catch (error) {
      console.error('[Admin] Error clearing database:', error);
      console.error('[Admin] Error stack:', error instanceof Error ? error.stack : 'No stack');
      console.error('[Admin] Prisma client available?', !!prisma);
      return NextResponse.json(
        {
          error: 'Failed to clear database',
          details: error instanceof Error ? error.message : 'Unknown error',
          stack: error instanceof Error ? error.stack : undefined,
        },
        { status: 500 }
      );
    }

    return NextResponse.json({
      success: true,
      message: 'All cache and database state cleared. Next API calls will trigger fresh sync.',
      results,
    });
  } catch (error) {
    console.error('[Admin] Error in clear-all:', error);
    return NextResponse.json(
      {
        error: 'Failed to clear state',
        details: error instanceof Error ? error.message : 'Unknown error',
      },
      { status: 500 }
    );
  }
}
