/**
 * API Route: Alkanes Circulating Supply (frBTC)
 *
 * Returns the live circulating frBTC supply on Alkanes by reading the
 * `/totalsupply` storage path of the frBTC alkane (id = 32:0) — the same
 * value the unwrap solvency check uses to decide whether the FROST wallet
 * is sufficiently collateralized.
 *
 * Mechanism:
 *   1. Build an `AlkaneStorageRequest` protobuf for id=(32, 0), path="/totalsupply"
 *   2. Call `metashrew_view("getstorageat", <hex>, "latest")`
 *   3. Decode the `AlkaneStorageResponse` protobuf — first 8 LE bytes of the
 *      `value` field are a u64 supply in satoshis
 *   4. On mainnet, subtract the 4,443,097 sats burned/initial offset (the
 *      same constant applied by the `subfrost-cli` unwrap path)
 */

import { NextResponse } from 'next/server';
import { cacheGet, cacheSet } from '@/lib/redis';

const CACHE_KEY = 'alkanes-circulating';
const CACHE_TTL = 300;
const RPC_URL = process.env.ALKANES_RPC_URL?.startsWith('http')
  ? process.env.ALKANES_RPC_URL
  : 'https://mainnet.subfrost.io/v4/subfrost';
const NETWORK = process.env.NEXT_PUBLIC_NETWORK || 'mainnet';
const MAINNET_BURNED_OFFSET_SATS = 4443097n;

function encodeVarint(n: bigint): Buffer {
  const out: number[] = [];
  while (n > 0x7fn) {
    out.push(Number((n & 0x7fn) | 0x80n));
    n >>= 7n;
  }
  out.push(Number(n & 0x7fn));
  return Buffer.from(out);
}

function encodeUint128Message(lo: bigint, hi: bigint): Buffer {
  const parts: Buffer[] = [];
  if (lo !== 0n) {
    parts.push(Buffer.from([0x08]));
    parts.push(encodeVarint(lo));
  }
  if (hi !== 0n) {
    parts.push(Buffer.from([0x10]));
    parts.push(encodeVarint(hi));
  }
  return Buffer.concat(parts);
}

function encodeLengthDelimited(tag: number, payload: Buffer): Buffer {
  return Buffer.concat([Buffer.from([tag]), encodeVarint(BigInt(payload.length)), payload]);
}

function buildStorageRequest(blockLo: bigint, txLo: bigint, path: string): string {
  const blockMsg = encodeUint128Message(blockLo, 0n);
  const txMsg = encodeUint128Message(txLo, 0n);
  const alkaneIdPayload = Buffer.concat([
    encodeLengthDelimited(0x0a, blockMsg),
    encodeLengthDelimited(0x12, txMsg),
  ]);
  const pathBytes = Buffer.from(path, 'utf-8');
  const requestPayload = Buffer.concat([
    encodeLengthDelimited(0x0a, alkaneIdPayload),
    encodeLengthDelimited(0x12, pathBytes),
  ]);
  return requestPayload.toString('hex');
}

function readVarint(bytes: Buffer, offset: number): { value: bigint; next: number } {
  let value = 0n;
  let shift = 0n;
  let i = offset;
  while (i < bytes.length) {
    const b = bytes[i++];
    value |= BigInt(b & 0x7f) << shift;
    if ((b & 0x80) === 0) return { value, next: i };
    shift += 7n;
  }
  throw new Error('Truncated varint');
}

function decodeStorageResponseValue(hex: string): Buffer {
  const stripped = hex.startsWith('0x') ? hex.slice(2) : hex;
  const bytes = Buffer.from(stripped, 'hex');
  let i = 0;
  while (i < bytes.length) {
    const tag = bytes[i++];
    const fieldNumber = tag >> 3;
    const wireType = tag & 0x07;
    if (fieldNumber === 1 && wireType === 2) {
      const { value: len, next } = readVarint(bytes, i);
      const start = next;
      const end = start + Number(len);
      return bytes.slice(start, end);
    }
    if (wireType === 2) {
      const { value: len, next } = readVarint(bytes, i);
      i = next + Number(len);
    } else if (wireType === 0) {
      const { next } = readVarint(bytes, i);
      i = next;
    } else {
      throw new Error(`Unsupported wire type ${wireType}`);
    }
  }
  return Buffer.alloc(0);
}

async function rpcCall<T>(method: string, params: unknown[]): Promise<T> {
  const response = await fetch(RPC_URL, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ jsonrpc: '2.0', id: Date.now(), method, params }),
  });
  if (!response.ok) {
    throw new Error(`RPC request failed: ${response.status}`);
  }
  const data = await response.json();
  if (data.error) {
    throw new Error(`RPC error: ${JSON.stringify(data.error)}`);
  }
  return data.result as T;
}

export async function GET() {
  try {
    const cached = await cacheGet(CACHE_KEY);
    if (cached) {
      return NextResponse.json(cached);
    }

    const requestHex = buildStorageRequest(32n, 0n, '/totalsupply');
    const resultHex = await rpcCall<string>('metashrew_view', ['getstorageat', requestHex, 'latest']);
    const valueBytes = decodeStorageResponseValue(resultHex);

    if (valueBytes.length < 8) {
      throw new Error(`Invalid totalsupply payload: expected >= 8 bytes, got ${valueBytes.length}`);
    }

    const rawTotalSupplySats = valueBytes.readBigUInt64LE(0);
    const burnedSats = NETWORK === 'mainnet' ? MAINNET_BURNED_OFFSET_SATS : 0n;
    const circulatingSats = rawTotalSupplySats > burnedSats ? rawTotalSupplySats - burnedSats : 0n;

    const result = {
      circulatingSatoshis: Number(circulatingSats),
      circulatingBtc: Number(circulatingSats) / 100_000_000,
      burnedSatoshis: Number(burnedSats),
      burnedBtc: Number(burnedSats) / 100_000_000,
      rawTotalSupplySatoshis: Number(rawTotalSupplySats),
      timestamp: Date.now(),
    };

    await cacheSet(CACHE_KEY, result, CACHE_TTL);
    return NextResponse.json(result);
  } catch (error) {
    console.error('Error fetching Alkanes circulating supply:', error);
    const errorMessage = error instanceof Error ? error.message : String(error);
    return NextResponse.json(
      { error: 'Failed to fetch Alkanes circulating supply.', details: errorMessage },
      { status: 500 }
    );
  }
}
