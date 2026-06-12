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

    // total-unwraps (alkanes + brc20) are now derived from volume-stats-both
    // (warmed below), so the dedicated /api/*-total-unwraps routes self-populate
    // instantly from that cache — no mempool.space pagination needed here.

    run('btc-price', async () => {
      // Subfrost subpricer (Uniswap V3 WBTC/USDC) — see app/api/btc-price/route.ts
      const base = (process.env.ALKANES_RPC_URL || 'https://mainnet.subfrost.io/v4/subfrost').replace(/\/$/, '');
      const response = await fetch(`${base}/api/v1/bitcoin-price`, {
        signal: AbortSignal.timeout(8000),
        headers: { accept: 'application/json' },
      });
      if (!response.ok) throw new Error(`subpricer responded ${response.status}`);
      const data = await response.json();
      const usd = typeof data.usd === 'number' ? data.usd : Number(data?.bitcoin?.usd);
      if (!usd || !Number.isFinite(usd)) throw new Error('subpricer returned no usd price');
      await cacheSet('btc-price', { btcPrice: usd }, CACHE_TTL);
    }),

    // Volume stats — all 3 sources
    run('volume-stats-both', async () => {
      const stats = await getVolumeStats('both');
      await cacheSet('volume-stats-both', stats, CACHE_TTL);
    }),

    run('volume-stats-alkanes', async () => {
      const stats = await getVolumeStats('alkanes');
      await cacheSet('volume-stats-alkanes', stats, CACHE_TTL);
    }),

    run('volume-stats-brc20', async () => {
      const stats = await getVolumeStats('brc20');
      await cacheSet('volume-stats-brc20', stats, CACHE_TTL);
    }),

    // Volume candles — all interval × cumulative × source combinations
    // (getAllTxs() is cached in-memory so these reuse the same underlying fetch)
    ...(['1d', '1w'] as const).flatMap(interval =>
      [false, true].flatMap(cumulative =>
        (['both', 'alkanes', 'brc20'] as const).map(source =>
          run(`volume-candles-${interval}-${cumulative}-${source}`, async () => {
            const candles = await getVolumeCandles(interval, cumulative, source);
            await cacheSet(`volume-candles-${interval}-${cumulative}-${source}`, candles, CACHE_TTL);
          })
        )
      )
    ),
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
