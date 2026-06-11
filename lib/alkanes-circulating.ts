/**
 * Shared logic for fetching the Alkanes frBTC circulating supply.
 *
 * Reads the `/totalsupply` storage path of the frBTC alkane (id = 32:0)
 * via the metashrew_view RPC and decodes the protobuf response.
 */

const RPC_URL = process.env.ALKANES_RPC_URL?.startsWith('http')
  ? process.env.ALKANES_RPC_URL
  : 'https://mainnet.subfrost.io/v4/subfrost';
const NETWORK = process.env.NEXT_PUBLIC_NETWORK || 'mainnet';
const MAINNET_BURNED_OFFSET_SATS = 4443097n;

export interface AlkanesCirculatingResult {
  circulatingSatoshis: number;
  circulatingBtc: number;
  burnedSatoshis: number;
  burnedBtc: number;
  rawTotalSupplySatoshis: number;
  timestamp: number;
}

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

export async function fetchAlkanesCirculating(): Promise<AlkanesCirculatingResult> {
  const requestHex = buildStorageRequest(32n, 0n, '/totalsupply');
  const resultHex = await rpcCall<string>('metashrew_view', ['getstorageat', requestHex, 'latest']);
  const valueBytes = decodeStorageResponseValue(resultHex);

  if (valueBytes.length < 8) {
    throw new Error(`Invalid totalsupply payload: expected >= 8 bytes, got ${valueBytes.length}`);
  }

  const rawTotalSupplySats = valueBytes.readBigUInt64LE(0);
  const burnedSats = NETWORK === 'mainnet' ? MAINNET_BURNED_OFFSET_SATS : 0n;
  const circulatingSats = rawTotalSupplySats > burnedSats ? rawTotalSupplySats - burnedSats : 0n;

  return {
    circulatingSatoshis: Number(circulatingSats),
    circulatingBtc: Number(circulatingSats) / 100_000_000,
    burnedSatoshis: Number(burnedSats),
    burnedBtc: Number(burnedSats) / 100_000_000,
    rawTotalSupplySatoshis: Number(rawTotalSupplySats),
    timestamp: Date.now(),
  };
}
