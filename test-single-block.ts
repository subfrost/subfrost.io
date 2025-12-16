/**
 * Simple test script to verify traceBlock works on a single block
 */

import { alkanesClient } from './lib/alkanes-client.js';

async function testSingleBlock() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  // Test a known block with subfrost activity
  const blockHeight = 927926;

  console.log(`\nFetching trace for block ${blockHeight}...`);
  const blockTraces = await provider.alkanes.traceBlock(blockHeight);

  console.log('\n=== Block trace analysis ===');
  console.log('Type:', typeof blockTraces);
  console.log('Is array:', Array.isArray(blockTraces));
  console.log('Keys:', Object.keys(blockTraces || {}).slice(0, 20));

  if (Array.isArray(blockTraces)) {
    console.log('Array length:', blockTraces.length);
    if (blockTraces.length > 0) {
      console.log('\nFirst trace entry:');
      console.log(JSON.stringify(blockTraces[0], null, 2).substring(0, 2000));
    }
  } else if (blockTraces && typeof blockTraces === 'object') {
    console.log('\nFull structure (first 3000 chars):');
    console.log(JSON.stringify(blockTraces, null, 2).substring(0, 3000));
  }

  console.log('\n✅ Successfully fetched block trace!');
}

testSingleBlock().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
