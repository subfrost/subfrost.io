/**
 * Test the analyzeRunestone binding from alkanes-web-sys
 */

import { alkanesClient } from './lib/alkanes-client.js';
import { analyzeRunestone } from '@alkanes/ts-sdk';

async function testAnalyzeRunestone() {
  console.log('Initializing provider...');
  const provider = await alkanesClient.getProvider();

  // Get a transaction with a runestone
  const subfrostAddress = 'bc1p5lushqjk7kxpqa87ppwn0dealucyqa6t40ppdkhpqm3grcpqvw9s3wdsx7';

  console.log(`\nFetching transactions for ${subfrostAddress}...`);
  const txs = await provider.esplora.getAddressTxs(subfrostAddress);
  console.log(`Found ${txs.length} transactions`);

  // Find first transaction with OP_RETURN
  const txWithOpReturn = txs.find(tx => {
    return tx.vout?.some(output => output.scriptpubkey_type === 'op_return');
  });

  if (!txWithOpReturn) {
    console.log('\nNo transaction with OP_RETURN found!');
    return;
  }

  console.log(`\nTesting analyzeRunestone on tx: ${txWithOpReturn.txid}`);

  // Fetch full raw transaction
  const rawTx = await provider.esplora.getTxHex(txWithOpReturn.txid);
  console.log(`Raw tx length: ${rawTx.length} chars`);

  try {
    // Analyze the runestone
    const result = await analyzeRunestone(rawTx);

    console.log(`\n${'='.repeat(80)}`);
    console.log('RUNESTONE ANALYSIS RESULT');
    console.log('='.repeat(80));
    console.log(`Transaction: ${txWithOpReturn.txid}`);
    console.log(`Protostone count: ${result.protostone_count}`);

    if (result.protostone_count > 0) {
      console.log(`\nProtostones:`);
      result.protostones.forEach((ps, i) => {
        console.log(`\n  Protostone #${i}:`);
        console.log(`    Protocol tag: ${ps.protocol_tag}`);
        console.log(`    Edicts: ${ps.edicts.length}`);
        console.log(`    Message bytes: ${ps.message.length}`);
        if (ps.pointer !== undefined) console.log(`    Pointer: ${ps.pointer}`);
        if (ps.refund !== undefined) console.log(`    Refund: ${ps.refund}`);
        if (ps.from !== undefined) console.log(`    From: ${ps.from}`);
        if (ps.burn !== undefined) console.log(`    Burn: ${ps.burn}`);

        if (ps.edicts.length > 0) {
          console.log(`    Edicts:`);
          ps.edicts.forEach((edict, j) => {
            console.log(`      Edict #${j}:`);
            console.log(`        ID: ${edict.id.block}:${edict.id.tx}`);
            console.log(`        Amount: ${edict.amount}`);
            console.log(`        Output: ${edict.output}`);
          });
        }
      });
    }

    console.log(`\n✅ Successfully analyzed runestone!`);
    return result;
  } catch (error) {
    console.error(`\n❌ Error analyzing runestone:`, error);
    throw error;
  }
}

testAnalyzeRunestone().catch(err => {
  console.error('\nTest failed:', err);
  process.exit(1);
});
