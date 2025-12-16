/**
 * Test script to debug trace parsing
 */

import { alkanesClient } from './lib/alkanes-client.js';
import { getWrapUnwrapFromBlockRange } from './lib/alkanes-client-v2.js';

async function testParsing() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  // Test a range to find frBTC activity
  const fromBlock = 927900;
  const toBlock = 927950;

  console.log(`\nTesting block range ${fromBlock} to ${toBlock}...`);
  const result = await getWrapUnwrapFromBlockRange(provider, fromBlock, toBlock);

  console.log('\n=== Results ===');
  console.log(`Total wrapped: ${result.totalWrapped}`);
  console.log(`Total unwrapped: ${result.totalUnwrapped}`);
  console.log(`Wrap count: ${result.wrapCount}`);
  console.log(`Unwrap count: ${result.unwrapCount}`);
}

testParsing().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
