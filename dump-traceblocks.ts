/**
 * Dump decoded traceblock responses for all subfrost address blocks
 */

import { alkanesClient } from './lib/alkanes-client.js';
import * as fs from 'fs';
import * as path from 'path';

const SUBFROST_ADDRESS = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';
const DUMP_DIR = './traceblock-dump';

function bytesToHex(bytes: number[]): string {
  return bytes.slice().reverse().map(b => b.toString(16).padStart(2, '0')).join('');
}

async function dumpTraceblocks() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  // Create dump directory
  if (!fs.existsSync(DUMP_DIR)) {
    fs.mkdirSync(DUMP_DIR, { recursive: true });
    console.log(`Created directory: ${DUMP_DIR}`);
  }

  // Get all transactions for subfrost address
  console.log(`\nFetching transactions for ${SUBFROST_ADDRESS}...`);
  const txs = await provider.esplora.getAddressTxs(SUBFROST_ADDRESS);
  console.log(`Found ${txs.length} transactions`);

  // Extract unique block heights and build transaction map
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
  console.log(`Found ${sortedHeights.length} unique blocks with activity`);
  console.log(`Block range: ${sortedHeights[0]} to ${sortedHeights[sortedHeights.length - 1]}`);

  console.log(`\nDumping traceblock responses to ${DUMP_DIR}/...\n`);

  const summary: any = {
    subfrostAddress: SUBFROST_ADDRESS,
    totalTransactions: txs.length,
    totalBlocks: sortedHeights.length,
    blockRange: {
      from: sortedHeights[0],
      to: sortedHeights[sortedHeights.length - 1],
    },
    blocks: [],
  };

  for (let i = 0; i < sortedHeights.length; i++) {
    const blockHeight = sortedHeights[i];
    console.log(`[${i + 1}/${sortedHeights.length}] Processing block ${blockHeight}...`);

    try {
      const blockTxs = txsByBlock.get(blockHeight) || [];
      const blockTraces = await provider.alkanes.traceBlock(blockHeight);

      // Prepare block data with metadata
      const blockData: any = {
        metadata: {
          blockHeight,
          subfrostAddress: SUBFROST_ADDRESS,
          subfrostTxsInBlock: blockTxs.length,
          subfrostTxids: blockTxs.map(tx => tx.txid),
          totalTraceEvents: blockTraces?.events?.length || 0,
          dumpedAt: new Date().toISOString(),
        },
        traces: blockTraces,
      };

      // Add transaction details
      blockData.metadata.transactions = blockTxs.map(tx => ({
        txid: tx.txid,
        fee: tx.fee,
        status: tx.status,
        vinCount: tx.vin?.length || 0,
        voutCount: tx.vout?.length || 0,
      }));

      // Convert txid bytes to hex in traces for readability
      if (blockTraces?.events && Array.isArray(blockTraces.events)) {
        for (const txTrace of blockTraces.events) {
          if (txTrace.outpoint?.txid && Array.isArray(txTrace.outpoint.txid)) {
            const txidBytes = txTrace.outpoint.txid;
            const txidHex = bytesToHex(txidBytes);
            txTrace.outpoint.txid_hex = txidHex;
          }
        }
      }

      // Write to file
      const filename = `block-${blockHeight}.json`;
      const filepath = path.join(DUMP_DIR, filename);
      fs.writeFileSync(filepath, JSON.stringify(blockData, null, 2));
      console.log(`  ✓ Saved ${filename} (${blockData.metadata.totalTraceEvents} trace events)`);

      // Add to summary
      summary.blocks.push({
        height: blockHeight,
        filename,
        subfrostTxCount: blockTxs.length,
        totalTraceEvents: blockData.metadata.totalTraceEvents,
      });
    } catch (error) {
      console.error(`  ✗ Error processing block ${blockHeight}:`, error);
      summary.blocks.push({
        height: blockHeight,
        error: String(error),
      });
    }
  }

  // Write summary file
  const summaryPath = path.join(DUMP_DIR, 'summary.json');
  fs.writeFileSync(summaryPath, JSON.stringify(summary, null, 2));
  console.log(`\n✓ Saved summary.json`);

  console.log(`\n${'='.repeat(80)}`);
  console.log('DUMP COMPLETE');
  console.log('='.repeat(80));
  console.log(`Total blocks dumped: ${summary.blocks.filter((b: any) => !b.error).length}`);
  console.log(`Output directory: ${path.resolve(DUMP_DIR)}`);
  console.log(`\nYou can now examine the JSON files to see the full trace structures.`);
  console.log(`Example: cat ${DUMP_DIR}/block-${sortedHeights[0]}.json | jq .`);
}

dumpTraceblocks().catch(err => {
  console.error('\nError:', err);
  process.exit(1);
});
