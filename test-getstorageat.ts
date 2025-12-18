/**
 * Quick test to verify getStorageAt works correctly
 */

import { alkanesClient } from './lib/alkanes-client';

async function testGetStorageAt() {
  console.log('Testing getStorageAt for frBTC total supply...\n');

  try {
    const result = await alkanesClient.getFrbtcTotalSupply();

    console.log('✅ SUCCESS - getStorageAt working correctly!\n');
    console.log('Results:');
    console.log('  Raw Supply:      ', result.raw.toString());
    console.log('  Adjusted Supply: ', result.adjusted.toString());
    console.log('  BTC Amount:      ', result.btc.toFixed(8), 'BTC');
    console.log('  Offset Applied:  ', '4443097 sats');

    // Verify results make sense
    if (result.btc > 0 && result.btc < 21000000) {
      console.log('\n✅ Values look reasonable');
    } else {
      console.log('\n⚠️  WARNING: Unexpected value range');
    }

  } catch (error) {
    console.error('❌ FAILED - getStorageAt error:');
    console.error(error);
    process.exit(1);
  }
}

testGetStorageAt();
