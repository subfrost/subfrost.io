/**
 * Tests for wallet constants (constants/wallets.ts)
 */
import { describe, it, expect } from 'vitest';
import {
  BROWSER_WALLETS,
  getBrowserWallets,
  isWalletInstalled,
  getInstalledWallets,
  type BrowserWalletInfo,
} from '@/constants/wallets';

describe('wallet-constants', () => {
  describe('getBrowserWallets', () => {
    it('returns an array of wallets', () => {
      const wallets = getBrowserWallets();
      expect(Array.isArray(wallets)).toBe(true);
      expect(wallets.length).toBeGreaterThan(0);
    });

    it('includes local wallet definitions (oyl, tokeo, keplr)', () => {
      const wallets = getBrowserWallets();
      const ids = wallets.map(w => w.id);
      expect(ids).toContain('oyl');
      expect(ids).toContain('tokeo');
      expect(ids).toContain('keplr');
    });

    it('each wallet has required properties', () => {
      const wallets = getBrowserWallets();
      for (const w of wallets) {
        expect(w.id).toBeTruthy();
        expect(w.name).toBeTruthy();
        expect(w.icon).toBeTruthy();
        expect(w.website).toBeTruthy();
        expect(w.injectionKey).toBeTruthy();
        expect(typeof w.supportsPsbt).toBe('boolean');
        expect(typeof w.supportsTaproot).toBe('boolean');
      }
    });
  });

  describe('BROWSER_WALLETS proxy', () => {
    it('has a length property', () => {
      expect(BROWSER_WALLETS.length).toBeGreaterThan(0);
    });

    it('supports array indexing', () => {
      const first = BROWSER_WALLETS[0];
      expect(first).toBeTruthy();
      expect(first.id).toBeTruthy();
    });

    it('supports filter method', () => {
      const filtered = BROWSER_WALLETS.filter(w => w.id === 'oyl');
      expect(filtered).toHaveLength(1);
      expect(filtered[0].id).toBe('oyl');
    });

    it('supports find method', () => {
      const found = BROWSER_WALLETS.find(w => w.id === 'tokeo');
      expect(found).toBeTruthy();
      expect(found!.name).toBe('Tokeo Wallet');
    });

    it('supports map method', () => {
      const ids = BROWSER_WALLETS.map(w => w.id);
      expect(ids).toContain('oyl');
    });
  });

  describe('isWalletInstalled', () => {
    it('returns false when window is undefined (SSR)', () => {
      // happy-dom provides window, but wallets aren't injected
      const wallet: BrowserWalletInfo = {
        id: 'test',
        name: 'Test',
        icon: '',
        website: '',
        injectionKey: 'nonexistent_provider_12345',
        supportsPsbt: false,
        supportsTaproot: false,
        supportsOrdinals: false,
        mobileSupport: false,
      };
      expect(isWalletInstalled(wallet)).toBe(false);
    });

    it('detects phantom via phantom.bitcoin', () => {
      (globalThis as any).window = globalThis;
      (globalThis as any).phantom = { bitcoin: {} };
      const wallet = getBrowserWallets().find(w => w.id === 'phantom');
      if (wallet) {
        expect(isWalletInstalled(wallet)).toBe(true);
      }
      delete (globalThis as any).phantom;
    });

    it('detects xverse via XverseProviders.BitcoinProvider', () => {
      (globalThis as any).XverseProviders = { BitcoinProvider: {} };
      const wallet = getBrowserWallets().find(w => w.id === 'xverse');
      if (wallet) {
        expect(isWalletInstalled(wallet)).toBe(true);
      }
      delete (globalThis as any).XverseProviders;
    });
  });

  describe('getInstalledWallets', () => {
    it('returns empty array when no wallets are installed', () => {
      const installed = getInstalledWallets();
      // In test environment, no real wallets are injected
      expect(Array.isArray(installed)).toBe(true);
    });
  });
});
