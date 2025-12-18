/**
 * API Route: BRC2.0 frBTC Stats
 *
 * Returns the frBTC stats from the BRC2.0 contract at 0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337:
 * - Total frBTC supply from totalSupply()
 * - Signer address (computed via getSignerAddress() and bech32m encoded)
 * - BTC locked at the signer address (via esplora UTXO query)
 *
 * Uses Redis caching for fast responses.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { brc20Client, type Brc20FrbtcStats } from '@/lib/brc20-client';

const CACHE_KEY = 'brc20-frbtc-stats';
const CACHE_TTL = 60; // 60 seconds

// Also cache the signer address separately with longer TTL since it doesn't change
const SIGNER_ADDRESS_CACHE_KEY = 'brc20-signer-address';
const SIGNER_ADDRESS_CACHE_TTL = 3600; // 1 hour

export async function GET() {
  try {
    // Check Redis cache first
    const cached = await cacheGet<Brc20FrbtcStats>(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Check if we have a cached signer address to speed up the request
    const cachedSignerAddress = await cacheGet<string>(SIGNER_ADDRESS_CACHE_KEY);

    // Fetch stats from BRC2.0 contract
    const stats = await brc20Client.getStats();

    // Cache the signer address separately if we didn't have it cached
    if (!cachedSignerAddress && stats.signerAddress) {
      await cacheSet(SIGNER_ADDRESS_CACHE_KEY, stats.signerAddress, SIGNER_ADDRESS_CACHE_TTL);
    }

    // Prepare response with serializable values
    const result = {
      totalSupply: stats.totalSupply.toString(),
      totalSupplyBtc: stats.totalSupplyBtc,
      signerAddress: stats.signerAddress,
      btcLocked: {
        satoshis: stats.btcLocked.satoshis,
        btc: stats.btcLocked.btc,
        utxoCount: stats.btcLocked.utxoCount,
      },
      timestamp: stats.timestamp,
    };

    // Cache the result
    await cacheSet(CACHE_KEY, result, CACHE_TTL);

    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching BRC2.0 frBTC stats:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BRC2.0 frBTC stats.' },
      { status: 500 }
    );
  }
}
