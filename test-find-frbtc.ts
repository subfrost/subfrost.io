/**
 * Scan all subfrost address blocks looking for frBTC (32:0) activity
 */

import { alkanesClient } from './lib/alkanes-client.js';

const SUBFROST_ADDRESS = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';

function isFrbtc(alkaneId: any): boolean {
  if (!alkaneId) return false;
  const blockNum = typeof alkaneId.block === 'object' ? alkaneId.block.lo : Number(alkaneId.block);
  const txNum = typeof alkaneId.tx === 'object' ? alkaneId.tx.lo : Number(alkaneId.tx);
  return blockNum === 32 && txNum === 0;
}

function bytesToHex(bytes: number[]): string {
  return bytes.slice().reverse().map(b => b.toString(16).padStart(2, '0')).join('');
}

async function findFrbtcActivity() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  // Get all transactions for subfrost address
  console.log(`\nFetching transactions for ${SUBFROST_ADDRESS}...`);
  const txs = await provider.esplora.getAddressTxs(SUBFROST_ADDRESS);
  console.log(`Found ${txs.length} transactions`);

  // Extract unique block heights
  const blockHeights = new Set<number>();
  for (const tx of txs) {
    const height = tx.status?.block_height;
    if (height) blockHeights.add(height);
  }

  const sortedHeights = Array.from(blockHeights).sort((a, b) => a - b);
  console.log(`Found ${sortedHeights.length} unique blocks with activity`);
  console.log(`Block range: ${sortedHeights[0]} to ${sortedHeights[sortedHeights.length - 1]}`);

  console.log(`\nScanning all ${sortedHeights.length} blocks for frBTC (32:0) activity...\n`);

  let totalFrbtcWraps = 0;
  let totalFrbtcUnwraps = 0;
  const blocksWithFrbtc: number[] = [];

  for (let i = 0; i < sortedHeights.length; i++) {
    const blockHeight = sortedHeights[i];
    process.stdout.write(`\rProgress: ${i + 1}/${sortedHeights.length} - Block ${blockHeight}...`);

    try {
      const blockTraces = await provider.alkanes.traceBlock(blockHeight);

      const tracesObj = blockTraces as any;
      if (!tracesObj?.events || !Array.isArray(tracesObj.events)) {
        continue;
      }

      let blockHasFrbtc = false;
      let wrapsInBlock = 0;
      let unwrapsInBlock = 0;

      for (const txTrace of tracesObj.events) {
        const traceEvents = txTrace.traces?.events;
        if (!traceEvents || !Array.isArray(traceEvents)) continue;

        for (const eventWrapper of traceEvents) {
          const event = eventWrapper.event;
          if (!event) continue;

          // Check ReceiveIntent for wraps (incoming frBTC)
          if (event.ReceiveIntent?.incoming_alkanes) {
            for (const transfer of event.ReceiveIntent.incoming_alkanes) {
              if (isFrbtc(transfer.id)) {
                blockHasFrbtc = true;
                wrapsInBlock++;

                const txidBytes = txTrace.outpoint?.txid;
                const txid = Array.isArray(txidBytes) ? bytesToHex(txidBytes) : 'unknown';

                console.log(`\n✅ WRAP FOUND in block ${blockHeight}`);
                console.log(`   Txid: ${txid}`);
                console.log(`   Alkane ID:`, transfer.id);
                console.log(`   Value:`, transfer.value);
              }
            }
          }

          // Check ValueTransfer for unwraps (outgoing frBTC)
          if (event.ValueTransfer?.transfers) {
            for (const transfer of event.ValueTransfer.transfers) {
              if (isFrbtc(transfer.id)) {
                blockHasFrbtc = true;
                unwrapsInBlock++;

                const txidBytes = txTrace.outpoint?.txid;
                const txid = Array.isArray(txidBytes) ? bytesToHex(txidBytes) : 'unknown';

                console.log(`\n✅ UNWRAP FOUND in block ${blockHeight}`);
                console.log(`   Txid: ${txid}`);
                console.log(`   Alkane ID:`, transfer.id);
                console.log(`   Value:`, transfer.value);
              }
            }
          }
        }
      }

      if (blockHasFrbtc) {
        blocksWithFrbtc.push(blockHeight);
        totalFrbtcWraps += wrapsInBlock;
        totalFrbtcUnwraps += unwrapsInBlock;
      }
    } catch (error) {
      console.error(`\nError processing block ${blockHeight}:`, error);
    }
  }

  console.log(`\n\n${'='.repeat(80)}`);
  console.log('SUMMARY');
  console.log('='.repeat(80));
  console.log(`Total blocks scanned: ${sortedHeights.length}`);
  console.log(`Blocks with frBTC activity: ${blocksWithFrbtc.length}`);
  if (blocksWithFrbtc.length > 0) {
    console.log(`Block heights with frBTC: ${blocksWithFrbtc.join(', ')}`);
  }
  console.log(`Total frBTC wraps found: ${totalFrbtcWraps}`);
  console.log(`Total frBTC unwraps found: ${totalFrbtcUnwraps}`);

  if (blocksWithFrbtc.length === 0) {
    console.log(`\n⚠️  No frBTC (32:0) activity found in any of the ${sortedHeights.length} blocks!`);
    console.log(`The subfrost address transactions are for other alkanes (likely 2:0).`);
  }
}

findFrbtcActivity().catch(err => {
  console.error('\nError:', err);
  process.exit(1);
});
