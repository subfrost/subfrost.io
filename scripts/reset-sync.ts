/**
 * One-time script to reset wrap/unwrap sync state
 * This forces a re-sync from block 0 with address extraction
 */
import { prisma } from '../lib/prisma';

async function main() {
  console.log('Resetting wrap/unwrap sync state...');

  // Delete wrap/unwrap sync state to force re-sync from scratch
  await prisma.syncState.delete({
    where: { dataType: 'wrap_unwrap_sync' }
  }).catch(() => console.log('Sync state not found (OK)'));

  // Delete existing wrap/unwrap transactions so they'll be re-fetched with addresses
  const deletedWraps = await prisma.wrapTransaction.deleteMany();
  const deletedUnwraps = await prisma.unwrapTransaction.deleteMany();

  console.log(`Deleted ${deletedWraps.count} wrap transactions`);
  console.log(`Deleted ${deletedUnwraps.count} unwrap transactions`);
  console.log('Sync state reset complete!');
  console.log('Next API call to /api/wrap-unwrap-totals will trigger a full re-sync');
}

main()
  .catch((e) => {
    console.error(e);
    process.exit(1);
  })
  .finally(async () => {
    await prisma.$disconnect();
  });
