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
import { cacheDel } from '@/lib/redis';

export async function POST(request: Request) {
  try {
    // Simple auth check - require a secret header
    const authHeader = request.headers.get('x-admin-secret');
    const expectedSecret = process.env.ADMIN_SECRET || 'change-me-in-production';

    if (authHeader !== expectedSecret) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }

    console.log('[Admin] Resetting wrap/unwrap sync state...');

    // Delete wrap/unwrap sync state to force re-sync from scratch
    await prisma.syncState.delete({
      where: { dataType: 'wrap_unwrap_sync' }
    }).catch(() => console.log('[Admin] Sync state not found (OK)'));

    // Delete existing wrap/unwrap transactions so they'll be re-fetched with addresses
    const deletedWraps = await prisma.wrapTransaction.deleteMany();
    const deletedUnwraps = await prisma.unwrapTransaction.deleteMany();

    // Clear relevant caches
    await cacheDel('wrap-unwrap-totals-v3');
    await cacheDel('wrap-history');
    await cacheDel('unwrap-history');

    console.log(`[Admin] Deleted ${deletedWraps.count} wrap transactions`);
    console.log(`[Admin] Deleted ${deletedUnwraps.count} unwrap transactions`);

    return NextResponse.json({
      success: true,
      deletedWraps: deletedWraps.count,
      deletedUnwraps: deletedUnwraps.count,
      message: 'Sync state reset complete. Next API call will trigger a full re-sync with address extraction.',
    });
  } catch (error) {
    console.error('[Admin] Error resetting sync:', error);
    return NextResponse.json(
      { error: 'Failed to reset sync state.' },
      { status: 500 }
    );
  }
}
