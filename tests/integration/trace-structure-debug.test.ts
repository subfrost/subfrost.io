import { describe, it } from 'vitest';
import { AlkanesClient } from '../../lib/alkanes-client';

describe('Trace Structure Debug', () => {
  it('should show trace structure for a few transactions', async () => {
    if (!process.env.RUN_INTEGRATION) {
      console.log('Skipping integration test. Set RUN_INTEGRATION=true to run.');
      return;
    }

    const alkanesClient = new AlkanesClient();
    const provider = await (alkanesClient as any).ensureProvider();
    const subfrostAddress = await alkanesClient.getSubfrostAddress();
    const wasmProvider = (provider as any)._provider;

    console.log('\n=== Fetching transactions ===');
    const txs = await wasmProvider.esploraGetAddressTxs(subfrostAddress);
    console.log(`Found ${txs.length} transactions`);

    // Find transactions with OP_RETURN outputs
    const opReturnTxs = txs.filter((tx: any) =>
      tx.vout?.some((v: any) => v.scriptpubkey_type === 'op_return')
    );
    console.log(`Found ${opReturnTxs.length} transactions with OP_RETURN`);

    // Enrich first 3 OP_RETURN transactions with traces
    for (let i = 0; i < Math.min(3, opReturnTxs.length); i++) {
      const tx = opReturnTxs[i];
      console.log(`\n=== Transaction ${i + 1}: ${tx.txid.substring(0, 16)}... ===`);

      // Decode runestone to get protostones
      const runestoneResult = await wasmProvider.runestoneDecodeTx(tx.txid);
      const protostones = runestoneResult?.protostones || [];
      console.log(`Protostones: ${protostones.length}`);

      if (protostones.length > 0) {
        // Get trace for first protostone
        const vout = tx.vout.length + 1;
        const outpoint = `${tx.txid}:${vout}`;
        console.log(`Fetching trace for outpoint: ${outpoint}`);

        const traceResult = await wasmProvider.alkanesTrace(outpoint);
        const trace = traceResult?.trace;

        if (trace && trace.events) {
          console.log(`\n=== Trace Events (${trace.events.length} events) ===`);

          for (let j = 0; j < trace.events.length; j++) {
            const eventWrapper = trace.events[j];
            const event = eventWrapper.event;
            const eventType = Object.keys(event || {})[0];

            console.log(`\nEvent ${j}: ${eventType}`);

            if (eventType === 'EnterContext') {
              const enterContext = event.EnterContext;
              console.log(`  EnterContext keys:`, Object.keys(enterContext || {}));
              console.log(`  target:`, enterContext?.target);
              console.log(`  inputs:`, enterContext?.inputs);
              console.log(`  alkanes:`, enterContext?.alkanes);
              if (enterContext) {
                console.log(`  Raw EnterContext:`, JSON.stringify(enterContext).substring(0, 500));
              }
            } else if (eventType === 'ExitContext') {
              const exitContext = event.ExitContext;
              console.log(`  ExitContext keys:`, Object.keys(exitContext || {}));
              if (exitContext) {
                console.log(`  Raw ExitContext:`, JSON.stringify(exitContext).substring(0, 500));
              }
            } else if (eventType === 'ReceiveIntent') {
              const receiveIntent = event.ReceiveIntent;
              console.log(`  incoming_alkanes:`, JSON.stringify(receiveIntent.incoming_alkanes, null, 2));
            } else if (eventType === 'ValueTransfer') {
              const valueTransfer = event.ValueTransfer;
              console.log(`  transfers:`, JSON.stringify(valueTransfer.transfers, null, 2));
            }
          }
        }
      }
    }

  }, 120000); // 2 minute timeout
});
