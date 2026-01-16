/**
 * API Route: BRC2.0 Circulating Supply
 *
 * Returns the circulating frBTC supply on BRC2.0 by calling totalSupply()
 * on the fr-BTC contract address using the @alkanes/ts-sdk brc20-prog client.
 *
 * Uses Redis/memory caching for fast responses.
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';
import { AlkanesProvider } from '@alkanes/ts-sdk';

const CACHE_KEY = 'brc20-circulating';
const CACHE_TTL = 300; // 5 minutes

// fr-BTC contract address on BRC2.0
const FRBTC_CONTRACT_ADDRESS = '0xdBB5b6A1D422fca2813cF486e5F986ADB09D8337';

// totalSupply() function selector (keccak256("totalSupply()") first 4 bytes)
const TOTAL_SUPPLY_SELECTOR = '0x18160ddd';

// Subfrost API URL
const SUBFROST_API_URL = 'https://mainnet.subfrost.io/v4/subfrost/';

/**
 * Decode uint256 from hex string
 */
function decodeUint256(hex: string): bigint {
  if (!hex || hex === '0x') return 0n;
  return BigInt(hex);
}

export async function GET() {
  try {
    // Check cache first
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    // Create provider with Subfrost API
    const provider = new AlkanesProvider({
      network: 'mainnet',
      url: SUBFROST_API_URL,
    });
    await provider.initialize();

    // Call totalSupply() on the fr-BTC contract
    const result = await provider.brc20prog.call(
      FRBTC_CONTRACT_ADDRESS,
      TOTAL_SUPPLY_SELECTOR
    );

    // Parse the uint256 result
    const totalSupply = decodeUint256(result);
    const totalSupplyBtc = Number(totalSupply) / 1e8;

    const response = {
      circulatingSatoshis: totalSupply.toString(),
      circulatingBtc: totalSupplyBtc,
      contractAddress: FRBTC_CONTRACT_ADDRESS,
      timestamp: Date.now(),
    };

    // Cache the result
    await cacheSet(CACHE_KEY, response, CACHE_TTL);

    return NextResponse.json(response);
  } catch (error) {
    console.error('Error fetching BRC2.0 circulating supply:', error);
    return NextResponse.json(
      { error: 'Failed to fetch BRC2.0 circulating supply.' },
      { status: 500 }
    );
  }
}
