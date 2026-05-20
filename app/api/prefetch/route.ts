/**
 * Background Prefetch Endpoint
 *
 * Proactively refreshes all landing-page data into Redis so users always
 * get instant cache hits. Bypasses cacheGet and writes directly via cacheSet.
 *
 * Authentication: Authorization: Bearer <PREFETCH_SECRET>
 * If PREFETCH_SECRET is not set, the endpoint is unauthenticated (local dev).
 *
 * Intended caller: GCP Cloud Scheduler — every 25 minutes
 *   gcloud scheduler jobs create http subfrost-prefetch \
 *     --schedule="0,25,50 * * * *" \
 *     --uri="https://subfrost.io/api/prefetch" \
 *     --http-method=GET \
 *     --headers="Authorization=Bearer ${PREFETCH_SECRET}" \
 *     --time-zone="UTC"
 */

import { NextRequest, NextResponse } from 'next/server';
import { cacheSet } from '@/lib/redis';
import {
  getAlkanesBtcLocked,
  getBrc20BtcLocked,
  getBrc20TotalSupply,
  calculateTotalUnwraps,
  getAlkanesSubfrostAddress,
  getBrc20SignerAddress,
} from '@/lib/rpc-client';
import { fetchAlkanesCirculating } from '@/lib/alkanes-circulating';
import { getVolumeStats, getVolumeCandles } from '@/lib/volume-data';

const CACHE_TTL = 2100; // 35 minutes
const FRBTC_CONTRACT_ADDRESS = '0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337';

export async function GET(request: NextRequest) {
  const secret = process.env.PREFETCH_SECRET;
  if (secret) {
    const auth = request.headers.get('authorization');
    if (auth !== `Bearer ${secret}`) {
      return NextResponse.json({ error: 'Unauthorized' }, { status: 401 });
    }
  }

  const results: Record<string, 'ok' | 'error'> = {};
  const errors: string[] = [];

  async function run(key: string, fn: () => Promise<void>) {
    try {
      await fn();
      results[key] = 'ok';
    } catch (err) {
      results[key] = 'error';
      errors.push(`${key}: ${err instanceof Error ? err.message : String(err)}`);
    }
  }

  await Promise.allSettled([
    run('alkanes-btc-locked', async () => {
      const data = await getAlkanesBtcLocked();
      await cacheSet('alkanes-btc-locked', {
        btcLocked: data.btcLocked,
        satoshis: data.satoshis.toString(),
        utxoCount: data.utxoCount,
        address: data.address,
        timestamp: Date.now(),
      }, CACHE_TTL);
    }),

    run('brc20-btc-locked', async () => {
      const data = await getBrc20BtcLocked();
      await cacheSet('brc20-btc-locked', {
        btcLocked: data.btcLocked,
        satoshis: data.satoshis,
        utxoCount: data.utxoCount,
        address: data.address,
        timestamp: Date.now(),
      }, CACHE_TTL);
    }),

    run('alkanes-circulating', async () => {
      const result = await fetchAlkanesCirculating();
      await cacheSet('alkanes-circulating', result, CACHE_TTL);
    }),

    run('brc20-circulating', async () => {
      const data = await getBrc20TotalSupply();
      await cacheSet('brc20-circulating', {
        circulatingSatoshis: data.totalSupply.toString(),
        circulatingBtc: data.totalSupplyBtc,
        contractAddress: FRBTC_CONTRACT_ADDRESS,
        timestamp: Date.now(),
      }, CACHE_TTL);
    }),

    run('alkanes-total-unwraps', async () => {
      const signerAddress = getAlkanesSubfrostAddress();
      const data = await calculateTotalUnwraps(signerAddress);
      await cacheSet('alkanes-total-unwraps', {
        totalUnwrapsSatoshis: data.totalUnwrapsSatoshis,
        totalUnwrapsBtc: data.totalUnwrapsBtc,
        unwrapCount: data.unwrapCount,
        signerAddress,
        timestamp: Date.now(),
      }, CACHE_TTL);
    }),

    run('brc20-total-unwraps', async () => {
      const signerAddress = getBrc20SignerAddress();
      const data = await calculateTotalUnwraps(signerAddress);
      await cacheSet('brc20-total-unwraps', {
        totalUnwrapsSatoshis: data.totalUnwrapsSatoshis,
        totalUnwrapsBtc: data.totalUnwrapsBtc,
        unwrapCount: data.unwrapCount,
        signerAddress,
        timestamp: Date.now(),
      }, CACHE_TTL);
    }),

    run('btc-price', async () => {
      const response = await fetch('https://mempool.space/api/v1/prices');
      if (!response.ok) throw new Error(`mempool.space responded ${response.status}`);
      const data = await response.json();
      await cacheSet('btc-price', { btcPrice: data.USD }, CACHE_TTL);
    }),

    // Volume stats — prefetch default source (warms in-memory tx cache for subsequent calls)
    run('volume-stats-both', async () => {
      const stats = await getVolumeStats('both');
      await cacheSet('volume-stats-both', stats, CACHE_TTL);
    }),

    // Volume candles — prefetch the two most common views
    run('volume-candles-1d-false-both', async () => {
      const candles = await getVolumeCandles('1d', false, 'both');
      await cacheSet('volume-candles-1d-false-both', candles, CACHE_TTL);
    }),

    run('volume-candles-1w-false-both', async () => {
      const candles = await getVolumeCandles('1w', false, 'both');
      await cacheSet('volume-candles-1w-false-both', candles, CACHE_TTL);
    }),
  ]);

  const refreshed = Object.values(results).filter(v => v === 'ok').length;
  const total = Object.keys(results).length;

  return NextResponse.json({
    ok: errors.length === 0,
    refreshed,
    total,
    errors,
    timestamp: new Date().toISOString(),
  });
}
