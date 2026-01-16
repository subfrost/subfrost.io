/**
 * Test to examine traceblock structures for subfrost address blocks
 */

import { alkanesClient } from './lib/alkanes-client.js';

const SUBFROST_ADDRESS = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';

async function testTraceStructure() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  // Step 1: Get all transactions for subfrost address
  console.log(`\nFetching transactions for ${SUBFROST_ADDRESS}...`);
  const txs = await provider.esplora.getAddressTxs(SUBFROST_ADDRESS);
  console.log(`Found ${txs.length} transactions`);

  // Step 2: Extract unique block heights
  const blockHeights = new Set<number>();
  const txsByBlock = new Map<number, any[]>();

  for (const tx of txs) {
    const height = tx.status?.block_height;
    if (!height) continue;

    blockHeights.add(height);
    if (!txsByBlock.has(height)) {
      txsByBlock.set(height, []);
    }
    txsByBlock.get(height)!.push(tx);
  }

  const sortedHeights = Array.from(blockHeights).sort((a, b) => a - b);
  console.log(`\nFound ${sortedHeights.length} unique blocks with activity`);
  console.log(`Block heights: ${sortedHeights.join(', ')}`);

  // Step 3: Test traceBlock on first few blocks to see structure
  const testBlocks = sortedHeights.slice(0, 3);
  console.log(`\nTesting traceBlock on first 3 blocks: ${testBlocks.join(', ')}`);

  for (const blockHeight of testBlocks) {
    console.log(`\n${'='.repeat(80)}`);
    console.log(`BLOCK ${blockHeight}`);
    console.log(`${'='.repeat(80)}`);

    const blockTxs = txsByBlock.get(blockHeight) || [];
    console.log(`\nTransactions in this block for subfrost address (${blockTxs.length}):`);
    for (const tx of blockTxs) {
      console.log(`  - ${tx.txid}`);
    }

    try {
      console.log(`\nCalling traceBlock(${blockHeight})...`);
      const blockTraces = await provider.alkanes.traceBlock(blockHeight);

      console.log(`\n--- Trace Structure ---`);
      console.log(`Type: ${typeof blockTraces}`);
      console.log(`Is Array: ${Array.isArray(blockTraces)}`);
      console.log(`Keys:`, Object.keys(blockTraces || {}));

      const tracesObj = blockTraces as any;
      if (tracesObj?.events && Array.isArray(tracesObj.events)) {
        console.log(`\nTotal trace events in block: ${tracesObj.events.length}`);

        // Look at first few events in detail
        const firstEvents = tracesObj.events.slice(0, 3);
        console.log(`\nFirst ${firstEvents.length} trace events:`);

        for (let i = 0; i < firstEvents.length; i++) {
          const txTrace = firstEvents[i];
          console.log(`\n--- Event ${i + 1} ---`);
          console.log(`Keys:`, Object.keys(txTrace || {}));

          if (txTrace.outpoint?.txid) {
            const txidBytes = txTrace.outpoint.txid;
            const txid = Array.isArray(txidBytes)
              ? txidBytes.slice().reverse().map(b => b.toString(16).padStart(2, '0')).join('')
              : txidBytes;
            console.log(`Txid: ${txid}`);
          }

          if (txTrace.traces?.events) {
            console.log(`Trace events count: ${txTrace.traces.events.length}`);

            // Look at first few trace events
            const traceEvents = txTrace.traces.events.slice(0, 5);
            console.log(`\nFirst ${traceEvents.length} trace events:`);

            for (let j = 0; j < traceEvents.length; j++) {
              const eventWrapper = traceEvents[j];
              console.log(`\n  Trace Event ${j + 1}:`);
              console.log(`  Keys:`, Object.keys(eventWrapper || {}));

              if (eventWrapper.event) {
                const event = eventWrapper.event;
                console.log(`  Event keys:`, Object.keys(event || {}));

                // Check for ReceiveIntent
                if (event.ReceiveIntent) {
                  console.log(`  ⚡ ReceiveIntent found!`);
                  console.log(`  ReceiveIntent keys:`, Object.keys(event.ReceiveIntent || {}));

                  if (event.ReceiveIntent.incoming_alkanes) {
                    console.log(`  Incoming alkanes count: ${event.ReceiveIntent.incoming_alkanes.length}`);
                    for (const transfer of event.ReceiveIntent.incoming_alkanes) {
                      console.log(`    - Alkane ID:`, transfer.id);
                      console.log(`    - Value:`, transfer.value);
                    }
                  }
                }

                // Check for ValueTransfer
                if (event.ValueTransfer) {
                  console.log(`  💸 ValueTransfer found!`);
                  console.log(`  ValueTransfer keys:`, Object.keys(event.ValueTransfer || {}));

                  if (event.ValueTransfer.transfers) {
                    console.log(`  Transfers count: ${event.ValueTransfer.transfers.length}`);
                    for (const transfer of event.ValueTransfer.transfers) {
                      console.log(`    - Alkane ID:`, transfer.id);
                      console.log(`    - Value:`, transfer.value);
                    }
                  }
                }

                // Check for EnterContext (old approach)
                if (event.EnterContext) {
                  console.log(`  🔍 EnterContext found!`);
                  console.log(`  EnterContext keys:`, Object.keys(event.EnterContext || {}));
                }
              }
            }
          }
        }
      } else {
        console.log(`\nNo events array found in trace response`);
        console.log(`Full structure:`, JSON.stringify(blockTraces, null, 2).substring(0, 2000));
      }
    } catch (error) {
      console.error(`Error tracing block ${blockHeight}:`, error);
    }
  }
}

testTraceStructure().catch(err => {
  console.error('Error:', err);
  process.exit(1);
});
