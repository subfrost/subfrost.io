import { describe, it } from 'vitest';
import { AlkanesClient } from '../../lib/alkanes-client';

describe('Debug Wrap/Unwrap Detection', () => {
  it('should show trace structure and detect wraps/unwraps', async () => {
    if (!process.env.RUN_INTEGRATION) {
      console.log('Skipping integration test. Set RUN_INTEGRATION=true to run.');
      return;
    }

    const alkanesClient = new AlkanesClient();

    console.log('\n=== Testing Wrap/Unwrap Detection ===\n');

    // Call the actual method that the API uses
    const result = await alkanesClient.getWrapUnwrapFromTraces();

    console.log('\n=== Results ===');
    console.log(`Total Wrapped: ${result.totalWrappedFrbtc} (${result.wraps.length} transactions)`);
    console.log(`Total Unwrapped: ${result.totalUnwrappedFrbtc} (${result.unwraps.length} transactions)`);
    console.log(`Last Block Height: ${result.lastBlockHeight}`);

    if (result.wraps.length > 0) {
      console.log('\n=== Sample Wraps ===');
      result.wraps.slice(0, 3).forEach(w => {
        console.log(`  ${w.txid}: ${w.frbtcAmount} frBTC from ${w.senderAddress}`);
      });
    }

    if (result.unwraps.length > 0) {
      console.log('\n=== Sample Unwraps ===');
      result.unwraps.slice(0, 3).forEach(u => {
        console.log(`  ${u.txid}: ${u.frbtcAmount} frBTC to ${u.recipientAddress}`);
      });
    }

    // We should have ~1.05 BTC total wrapped/unwrapped
    const totalBtc = Number(result.totalWrappedFrbtc + result.totalUnwrappedFrbtc) / 100_000_000;
    console.log(`\n=== Total Activity: ${totalBtc.toFixed(8)} BTC ===`);

  }, 300000); // 5 minute timeout
});
