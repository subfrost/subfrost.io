import { describe, it, expect } from 'vitest';
import {
  reverseHex,
  formatAlkaneId,
  parseAlkaneId,
  FRBTC_TOKEN,
} from '@/lib/alkanes-client';

describe('alkanes-client utilities', () => {
  describe('reverseHex', () => {
    it('reverses a hex string correctly', () => {
      expect(reverseHex('0x0102030405')).toBe('0x0504030201');
      expect(reverseHex('aabbccdd')).toBe('0xddccbbaa');
    });

    it('handles odd-length hex strings', () => {
      // 0x12345 pads to 012345, reverses to 452301
      expect(reverseHex('0x12345')).toBe('0x452301');
    });

    it('handles empty strings', () => {
      expect(reverseHex('')).toBe('0x');
      expect(reverseHex('0x')).toBe('0x');
    });
  });

  describe('formatAlkaneId', () => {
    it('formats alkane ID to string', () => {
      expect(formatAlkaneId({ block: 32n, tx: 0n })).toBe('32:0');
      expect(formatAlkaneId({ block: 2n, tx: 77087n })).toBe('2:77087');
    });
  });

  describe('parseAlkaneId', () => {
    it('parses alkane ID from string', () => {
      const id = parseAlkaneId('32:0');
      expect(id.block).toBe(32n);
      expect(id.tx).toBe(0n);
    });

    it('handles larger numbers', () => {
      const id = parseAlkaneId('2:77087');
      expect(id.block).toBe(2n);
      expect(id.tx).toBe(77087n);
    });
  });

  describe('constants', () => {
    it('has correct FRBTC_TOKEN config', () => {
      expect(FRBTC_TOKEN.alkaneId.block).toBe(32n);
      expect(FRBTC_TOKEN.alkaneId.tx).toBe(0n);
      expect(FRBTC_TOKEN.decimals).toBe(8);
      expect(FRBTC_TOKEN.symbol).toBe('frBTC');
    });
  });
});
