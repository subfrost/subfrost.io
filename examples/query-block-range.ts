/**
 * Example: Query wrap/unwrap data for specific block ranges
 *
 * This demonstrates how to use the getWrapUnwrapFromBlockRange function
 * to query wrap/unwrap data for specific block height ranges.
 */

import { alkanesClient } from '../lib/alkanes-client';
import { getWrapUnwrapFromBlockRange } from '../lib/alkanes-client-v2';

async function main() {
  console.log('=== Block Range Query Example ===\n');

  // Get the provider
  const provider = await alkanesClient.getProvider();
  const currentHeight = await provider.esplora.getBlockHeight();

  console.log(`Current block height: ${currentHeight}\n`);

  // Example 1: Query last 1000 blocks
  console.log('Example 1: Last 1000 blocks');
  console.log('─'.repeat(50));
  const fromHeight1 = currentHeight - 1000;
  const result1 = await getWrapUnwrapFromBlockRange(provider, fromHeight1);

  console.log(`Range: ${fromHeight1} to latest`);
  console.log(`Wraps: ${result1.wrapCount} (${Number(result1.totalWrapped) / 1e8} BTC)`);
  console.log(`Unwraps: ${result1.unwrapCount} (${Number(result1.totalUnwrapped) / 1e8} BTC)`);
  console.log(`Last block: ${result1.lastBlockHeight}\n`);

  // Example 2: Query specific 1000-block window
  console.log('Example 2: Specific 1000-block window');
  console.log('─'.repeat(50));
  const fromHeight2 = currentHeight - 5000;
  const toHeight2 = currentHeight - 4000;
  const result2 = await getWrapUnwrapFromBlockRange(provider, fromHeight2, toHeight2);

  console.log(`Range: ${fromHeight2} to ${toHeight2}`);
  console.log(`Wraps: ${result2.wrapCount} (${Number(result2.totalWrapped) / 1e8} BTC)`);
  console.log(`Unwraps: ${result2.unwrapCount} (${Number(result2.totalUnwrapped) / 1e8} BTC)`);
  console.log(`Last block: ${result2.lastBlockHeight}\n`);

  // Example 3: Query all historical data
  console.log('Example 3: All historical data (from genesis)');
  console.log('─'.repeat(50));
  const result3 = await getWrapUnwrapFromBlockRange(provider, 0);

  console.log(`Range: 0 to latest`);
  console.log(`Wraps: ${result3.wrapCount} (${Number(result3.totalWrapped) / 1e8} BTC)`);
  console.log(`Unwraps: ${result3.unwrapCount} (${Number(result3.totalUnwrapped) / 1e8} BTC)`);
  console.log(`Lifetime Tx Value: ${(Number(result3.totalWrapped) + Number(result3.totalUnwrapped)) / 1e8} BTC`);
  console.log(`Last block: ${result3.lastBlockHeight}\n`);

  // Example 4: Show some transaction details
  console.log('Example 4: Recent transaction details');
  console.log('─'.repeat(50));

  if (result1.wraps.length > 0) {
    const recentWrap = result1.wraps[result1.wraps.length - 1];
    console.log('Most recent wrap:');
    console.log(`  TXID: ${recentWrap.txid}`);
    console.log(`  Amount: ${Number(recentWrap.amount) / 1e8} BTC`);
    console.log(`  Block: ${recentWrap.blockHeight}`);
    console.log(`  From: ${recentWrap.senderAddress}\n`);
  }

  if (result1.unwraps.length > 0) {
    const recentUnwrap = result1.unwraps[result1.unwraps.length - 1];
    console.log('Most recent unwrap:');
    console.log(`  TXID: ${recentUnwrap.txid}`);
    console.log(`  Amount: ${Number(recentUnwrap.amount) / 1e8} BTC`);
    console.log(`  Block: ${recentUnwrap.blockHeight}`);
    console.log(`  To: ${recentUnwrap.recipientAddress}\n`);
  }

  console.log('✅ Examples complete!');
}

// Run if called directly
if (require.main === module) {
  main().catch(error => {
    console.error('Error:', error);
    process.exit(1);
  });
}

export { main };
