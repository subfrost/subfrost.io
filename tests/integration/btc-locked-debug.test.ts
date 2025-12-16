/**
 * Debug test for BTC locked calculation
 */
import { describe, it, expect } from 'vitest';
import { alkanesClient } from '@/lib/alkanes-client';
import { getBtcLockedData } from '@/lib/blockchain-data';

describe('BTC Locked Debug', () => {
  it('should debug UTXO structure and calculation', async () => {
    console.log('[Test] Getting subfrost address...');
    const address = await alkanesClient.getSubfrostAddress();
    console.log('[Test] Address:', address);

    console.log('[Test] Fetching UTXOs...');
    const utxos = await alkanesClient.getAddressUtxos(address);
    console.log('[Test] Total UTXOs:', utxos.length);
    console.log('[Test] UTXOs type:', typeof utxos);
    console.log('[Test] Is array?', Array.isArray(utxos));

    // Check first few UTXOs - log full structure to see what we have
    console.log('[Test] First 3 UTXOs (full structure):');
    const first3 = utxos.slice(0, 3);
    console.log('[Test] first3.length:', first3.length);

    for (let i = 0; i < first3.length; i++) {
      const utxo = first3[i];
      console.log(`  UTXO ${i} type:`, typeof utxo);
      console.log(`  UTXO ${i} keys:`, Object.keys(utxo || {}));
      console.log(`  UTXO ${i} value:`, utxo?.value);
      console.log(`  UTXO ${i} value type:`, typeof utxo?.value);
      try {
        console.log(`  UTXO ${i} stringified:`, JSON.stringify(utxo));
      } catch (e) {
        console.log(`  UTXO ${i} stringify error:`, e);
      }
    }

    // Manual sum
    let manualSum = 0;
    for (const utxo of utxos) {
      if (utxo.value) {
        manualSum += utxo.value;
      }
    }
    console.log('[Test] Manual sum:', manualSum);
    console.log('[Test] Manual sum in BTC:', manualSum / 100_000_000);

    // Test getBtcLocked
    console.log('[Test] Testing getBtcLocked()...');
    const btcLocked = await alkanesClient.getBtcLocked();
    console.log('[Test] getBtcLocked result:', btcLocked);

    // Test blockchain-data wrapper
    console.log('[Test] Testing getBtcLockedData()...');
    const btcLockedData = await getBtcLockedData();
    console.log('[Test] getBtcLockedData result:', btcLockedData);

    // Assertions
    expect(utxos.length).toBeGreaterThan(0);
    expect(manualSum).toBeGreaterThan(0);
    expect(btcLocked.satoshis).toBe(manualSum);
    expect(btcLocked.btc).toBeCloseTo(manualSum / 100_000_000, 8);
    expect(Number(btcLockedData.satoshis)).toBe(manualSum);
    expect(btcLockedData.btcLocked).toBeCloseTo(manualSum / 100_000_000, 8);
  }, 60000);
});
