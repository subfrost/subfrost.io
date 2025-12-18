import { AlkanesClient } from './lib/alkanes-client';

async function main() {
  const alkanesClient = new AlkanesClient();

  console.log('Testing wrap/unwrap detection...\n');

  const result = await alkanesClient.getWrapUnwrapFromTraces();

  console.log('\n=== RESULTS ===');
  console.log(`Wraps: ${result.wraps.length}`);
  console.log(`Total Wrapped: ${result.totalWrappedFrbtc} (${Number(result.totalWrappedFrbtc) / 100_000_000} BTC)`);
  console.log(`\nUnwraps: ${result.unwraps.length}`);
  console.log(`Total Unwrapped: ${result.totalUnwrappedFrbtc} (${Number(result.totalUnwrappedFrbtc) / 100_000_000} BTC)`);
  console.log(`\nTotal Activity: ${(Number(result.totalWrappedFrbtc) + Number(result.totalUnwrappedFrbtc)) / 100_000_000} BTC`);
  console.log(`Last Block Height: ${result.lastBlockHeight}`);

  if (result.wraps.length > 0) {
    console.log('\n=== Sample Wraps ===');
    result.wraps.slice(0, 5).forEach((w, i) => {
      console.log(`${i + 1}. ${w.txid.substring(0, 16)}...: ${w.frbtcAmount} from ${w.senderAddress}`);
    });
  }

  if (result.unwraps.length > 0) {
    console.log('\n=== Sample Unwraps ===');
    result.unwraps.slice(0, 5).forEach((u, i) => {
      console.log(`${i + 1}. ${u.txid.substring(0, 16)}...: ${u.frbtcAmount} to ${u.recipientAddress}`);
    });
  }
}

main().then(() => process.exit(0)).catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
