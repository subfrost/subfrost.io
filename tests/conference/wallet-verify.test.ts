/**
 * Tests for wallet challenge/verification (lib/wallet-verify.ts)
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { generateChallenge, validateChallenge, verifyWalletSignature } from '@/lib/wallet-verify';

describe('wallet-verify', () => {
  describe('generateChallenge', () => {
    it('generates a challenge with the correct prefix', () => {
      const { message, timestamp } = generateChallenge('join');
      expect(message).toContain('subfrost.io conference');
      expect(message).toContain('join');
      expect(message).toContain(String(timestamp));
    });

    it('generates a challenge with the action parameter', () => {
      const { message } = generateChallenge('create');
      expect(message).toContain('create');
    });

    it('returns a recent timestamp', () => {
      const before = Date.now();
      const { timestamp } = generateChallenge('test');
      const after = Date.now();
      expect(timestamp).toBeGreaterThanOrEqual(before);
      expect(timestamp).toBeLessThanOrEqual(after);
    });
  });

  describe('validateChallenge', () => {
    it('accepts a valid recent challenge', () => {
      const { message, timestamp } = generateChallenge('join');
      expect(validateChallenge(message, timestamp)).toBe(true);
    });

    it('rejects a challenge with wrong prefix', () => {
      const timestamp = Date.now();
      expect(validateChallenge(`wrong prefix at ${timestamp}`, timestamp)).toBe(false);
    });

    it('rejects an expired challenge (>5 minutes)', () => {
      const timestamp = Date.now() - 6 * 60 * 1000; // 6 minutes ago
      const message = `subfrost.io conference: join at ${timestamp}`;
      expect(validateChallenge(message, timestamp)).toBe(false);
    });

    it('rejects a future timestamp', () => {
      const timestamp = Date.now() + 60000; // 1 minute in the future
      const message = `subfrost.io conference: join at ${timestamp}`;
      expect(validateChallenge(message, timestamp)).toBe(false);
    });

    it('rejects when timestamp not in message', () => {
      const message = 'subfrost.io conference: join at 999';
      expect(validateChallenge(message, Date.now())).toBe(false);
    });
  });

  describe('verifyWalletSignature', () => {
    it('accepts a valid taproot address with valid challenge', () => {
      const { message, timestamp } = generateChallenge('join');
      const result = verifyWalletSignature(
        'bc1p0xlxvlhemja6c4dqv22uapctqupfhlxm9h8z3k2e72q4k9hcz7vqzk5jj0',
        message,
        'base64signaturevaluehere1234567890',
        timestamp,
      );
      expect(result).toBe(true);
    });

    it('accepts a valid segwit address', () => {
      const { message, timestamp } = generateChallenge('create');
      const result = verifyWalletSignature(
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        message,
        'base64signaturevaluehere1234567890',
        timestamp,
      );
      expect(result).toBe(true);
    });

    it('accepts testnet addresses', () => {
      const { message, timestamp } = generateChallenge('join');
      expect(verifyWalletSignature(
        'tb1qw508d6qejxtdg4y5r3zarvary0c5xw7kxpjzsx',
        message,
        'base64signaturevaluehere1234567890',
        timestamp,
      )).toBe(true);
    });

    it('rejects empty inputs', () => {
      expect(verifyWalletSignature('', '', '', 0)).toBe(false);
    });

    it('rejects missing wallet address', () => {
      const { message, timestamp } = generateChallenge('join');
      expect(verifyWalletSignature('', message, 'sig123456789012345678', timestamp)).toBe(false);
    });

    it('rejects short signatures', () => {
      const { message, timestamp } = generateChallenge('join');
      expect(verifyWalletSignature('bc1qtest', message, 'short', timestamp)).toBe(false);
    });

    it('rejects non-bitcoin addresses', () => {
      const { message, timestamp } = generateChallenge('join');
      expect(verifyWalletSignature(
        '0x1234567890abcdef',
        message,
        'base64signaturevaluehere1234567890',
        timestamp,
      )).toBe(false);
    });

    it('rejects expired challenges', () => {
      const timestamp = Date.now() - 6 * 60 * 1000;
      const message = `subfrost.io conference: join at ${timestamp}`;
      expect(verifyWalletSignature(
        'bc1qw508d6qejxtdg4y5r3zarvary0c5xw7kv8f3t4',
        message,
        'base64signaturevaluehere1234567890',
        timestamp,
      )).toBe(false);
    });
  });
});
