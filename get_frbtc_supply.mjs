import { AlkanesRpc } from './reference/alkanes/lib/rpc.js';
import { hexToBigInt } from 'viem';

// The Alkane ID for frBTC
const alkaneId = { block: 32n, tx: 0n };
const rpc = new AlkanesRpc({ baseUrl: 'https://mainnet.sandshrew.io/v2/lasereyes' });

// The path is a standardized key required by the Alkanes Token Standard
const path = new TextEncoder().encode('/totalsupply');

// Use getstorageat to read the raw hex value from the state
const storageHex = await rpc.getstorageat({
  id: alkaneId,
  path: path,
});

// The returned hex value is little-endian and needs to be byte-reversed
// for correct interpretation.
function reverseHex(hex) {
    if (hex.startsWith('0x')) {
        hex = hex.slice(2);
    }
    if (hex.length % 2) { hex = '0' + hex; }
    const buf = Buffer.from(hex, 'hex');
    return '0x' + buf.reverse().toString('hex');
}

const littleEndianHex = reverseHex(storageHex);
const totalSupply = BigInt(littleEndianHex);

console.log(`Raw Hex: ${storageHex}`);
console.log(`Corrected (Big-Endian) Hex: ${littleEndianHex}`);
console.log(`Total Supply: ${totalSupply.toString()}`); // Result: 15920