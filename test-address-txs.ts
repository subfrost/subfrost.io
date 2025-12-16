/**
 * Simple test to get all transactions for subfrost address
 */

import { alkanesClient } from './lib/alkanes-client.js';

async function testAddressTxs() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  const subfrostAddress = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';

  console.log(`\nFetching all transactions for ${subfrostAddress}...`);
  const txs = await provider.esplora.getAddressTxs(subfrostAddress);

  console.log(`\n=== Results ===`);
  console.log(`Total transactions: ${txs.length}`);

  if (txs.length > 0) {
    // Show some block height stats
    const heights = txs
      .filter(tx => tx.status?.block_height)
      .map(tx => tx.status.block_height);

    if (heights.length > 0) {
      const minHeight = Math.min(...heights);
      const maxHeight = Math.max(...heights);
      console.log(`\nBlock height range: ${minHeight} to ${maxHeight}`);
      console.log(`Total blocks with activity: ${new Set(heights).size}`);
    }

    // Show first few transactions
    console.log(`\nFirst 5 transactions:`);
    txs.slice(0, 5).forEach(tx => {
      console.log(`  - ${tx.txid} (block ${tx.status?.block_height || 'unconfirmed'})`);
    });
  }
}

testAddressTxs().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
