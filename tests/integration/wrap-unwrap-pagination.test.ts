/**
 * Integration test for wrap/unwrap transaction pagination
 *
 * This test validates that we can fetch ALL wrap/unwrap transactions
 * using pagination, not just the first 25 transactions.
 */

import { describe, it, expect, beforeAll } from 'vitest';
import { alkanesClient } from '@/lib/alkanes-client';

// Run only when RUN_INTEGRATION=true
const shouldRun = process.env.RUN_INTEGRATION === 'true';
const describeIf = shouldRun ? describe : describe.skip;

describeIf('Wrap/Unwrap Pagination Integration Tests', () => {
  let subfrostAddress: string;

  beforeAll(async () => {
    subfrostAddress = await alkanesClient.getSubfrostAddress();
    console.log('[Test] Subfrost address:', subfrostAddress);
  }, 30000);

  it('should fetch all transactions using pagination', async () => {
    // Note: This test is using internal SDK methods for testing pagination
    // In production, use alkanesClient.getWrapUnwrapFromTraces() which handles pagination internally
    const provider = (alkanesClient as any).provider || await (alkanesClient as any).ensureProvider();

    let allTransactions: any[] = [];
    let lastSeenTxid: string | undefined = undefined;
    let pageCount = 0;
    const maxPages = 100; // Safety limit to prevent infinite loops

    console.log('[Test] Starting pagination...');

    // Fetch pages until we get no more transactions
    while (pageCount < maxPages) {
      pageCount++;

      // Fetch next page
      let page: any[];
      if (lastSeenTxid === undefined) {
        // First page - use getAddressTxs
        const result = await provider.getAddressTxs(subfrostAddress);
        page = Array.isArray(result) ? result : [];
      } else {
        // Subsequent pages - use getAddressTxsChain
        const result = await provider.getAddressTxsChain(subfrostAddress, lastSeenTxid);
        page = Array.isArray(result) ? result : [];
      }

      console.log(`[Test] Page ${pageCount}: fetched ${page.length} transactions`);

      // If no transactions, we're done
      if (page.length === 0) {
        console.log('[Test] No more transactions, stopping pagination');
        break;
      }

      // Add to our collection
      allTransactions.push(...page);

      // Update last seen txid for next iteration
      if (page.length > 0) {
        lastSeenTxid = page[page.length - 1].txid;
      }

      // If we got less than 25 transactions, this is the last page
      if (page.length < 25) {
        console.log(`[Test] Got ${page.length} < 25 transactions, this is the last page`);
        break;
      }
    }

    console.log(`[Test] Total pages fetched: ${pageCount}`);
    console.log(`[Test] Total transactions: ${allTransactions.length}`);

    // Assertions
    expect(allTransactions.length).toBeGreaterThan(0);
    expect(pageCount).toBeLessThan(maxPages); // Ensure we didn't hit the safety limit

    // Log first and last transaction to verify ordering
    if (allTransactions.length > 0) {
      console.log('[Test] First tx:', {
        txid: allTransactions[0].txid,
        block_height: allTransactions[0].status?.block_height,
      });
      console.log('[Test] Last tx:', {
        txid: allTransactions[allTransactions.length - 1].txid,
        block_height: allTransactions[allTransactions.length - 1].status?.block_height,
      });
    }
  }, 180000); // 3 minutes timeout for pagination

  it('should calculate correct wrap/unwrap totals from all pages', async () => {
    const provider = (alkanesClient as any).provider || await (alkanesClient as any).ensureProvider();

    // Fetch ALL transactions with pagination
    let allTransactions: any[] = [];
    let lastSeenTxid: string | undefined = undefined;
    let pageCount = 0;

    while (pageCount < 100) {
      pageCount++;
      let page: any[];
      if (lastSeenTxid === undefined) {
        const result = await provider.getAddressTxs(subfrostAddress);
        page = Array.isArray(result) ? result : [];
      } else {
        const result = await provider.getAddressTxsChain(subfrostAddress, lastSeenTxid);
        page = Array.isArray(result) ? result : [];
      }

      if (page.length === 0) break;
      allTransactions.push(...page);
      if (page.length > 0) {
        lastSeenTxid = page[page.length - 1].txid;
      }
      if (page.length < 25) break;
    }

    console.log(`[Test] Processing ${allTransactions.length} total transactions`);

    // Filter to only transactions with traces (same logic as getWrapUnwrapFromTraces)
    const txsWithTraces = allTransactions.filter(tx => {
      // Exclude coinbase transactions
      const isCoinbase = tx.vin?.some((vin: any) => vin.is_coinbase);
      return !isCoinbase && tx.alkanes_traces && tx.alkanes_traces.length > 0;
    });

    console.log(`[Test] Transactions with traces: ${txsWithTraces.length}`);

    // Count wraps and unwraps (simplified detection)
    let wrapCount = 0;
    let unwrapCount = 0;

    for (const tx of txsWithTraces) {
      for (const traceEntry of tx.alkanes_traces || []) {
        const trace = traceEntry.trace?.trace;
        if (!trace || !trace.events) continue;

        for (const eventWrapper of trace.events) {
          const event = eventWrapper.event;
          if (!event) continue;

          // Check for ValueTransfer events to frBTC (32:0)
          if (event.ValueTransfer) {
            const transfer = event.ValueTransfer;
            const isFrbtc = transfer.id?.block === 32 && transfer.id?.tx === 0;

            if (isFrbtc) {
              // If from is "0:0", it's a mint (wrap)
              if (transfer.from?.block === 0 && transfer.from?.tx === 0) {
                wrapCount++;
                break; // Count each transaction only once
              }
              // If to is "0:0", it's a burn (unwrap)
              else if (transfer.to?.block === 0 && transfer.to?.tx === 0) {
                unwrapCount++;
                break; // Count each transaction only once
              }
            }
          }
        }
      }
    }

    console.log(`[Test] Total wraps found: ${wrapCount}`);
    console.log(`[Test] Total unwraps found: ${unwrapCount}`);

    // Assertions - we expect some wraps and unwraps to exist
    expect(wrapCount).toBeGreaterThan(0);
    expect(unwrapCount).toBeGreaterThan(0);
    expect(wrapCount + unwrapCount).toBeGreaterThan(0);
  }, 180000); // 3 minutes timeout

  it('should compare paginated results vs single fetch', async () => {
    const provider = (alkanesClient as any).provider || await (alkanesClient as any).ensureProvider();

    // Method 1: Single fetch (current broken implementation - max 25 txs)
    const singleFetchTxs = await provider.getAddressTxs(subfrostAddress);
    const singleFetchCount = Array.isArray(singleFetchTxs) ? singleFetchTxs.length : 0;

    // Method 2: Paginated fetch (correct implementation - all txs)
    let paginatedTxs: any[] = [];
    let lastSeenTxid: string | undefined = undefined;
    let pageCount = 0;

    while (pageCount < 100) {
      pageCount++;
      let page: any[];
      if (lastSeenTxid === undefined) {
        const result = await provider.getAddressTxs(subfrostAddress);
        page = Array.isArray(result) ? result : [];
      } else {
        const result = await provider.getAddressTxsChain(subfrostAddress, lastSeenTxid);
        page = Array.isArray(result) ? result : [];
      }

      if (page.length === 0) break;
      paginatedTxs.push(...page);
      if (page.length > 0) {
        lastSeenTxid = page[page.length - 1].txid;
      }
      if (page.length < 25) break;
    }

    console.log('[Test] Single fetch count:', singleFetchCount);
    console.log('[Test] Paginated fetch count:', paginatedTxs.length);
    console.log('[Test] Difference:', paginatedTxs.length - singleFetchCount);

    // The paginated result should have AT LEAST as many transactions as single fetch
    // (likely many more if subfrost has > 25 transactions)
    expect(paginatedTxs.length).toBeGreaterThanOrEqual(singleFetchCount);

    // If subfrost has been active, we expect more than 25 transactions
    if (singleFetchCount === 25) {
      console.log('[Test] Single fetch returned exactly 25, indicating pagination is needed');
      expect(paginatedTxs.length).toBeGreaterThan(25);
    }
  }, 180000);
});
