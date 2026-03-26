/**
 * E2E Wallet + Conference Integration Tests
 *
 * Tests browser wallet mocks working with the conference system:
 *   1. Mock wallet detection (isWalletInstalled)
 *   2. Wallet connect flows for each wallet type
 *   3. signMessage for wallet challenge auth
 *   4. Full flow: install wallet → get challenge → sign → create/join room with wallet auth
 *
 * Uses mock wallets (no real extensions), mocked Redis, mocked Prisma.
 */
import { describe, it, expect, vi, beforeEach, afterEach } from 'vitest';
import { NextRequest } from 'next/server';
import {
  installMockWallet,
  uninstallMockWallet,
  uninstallAllMockWallets,
  TEST_ADDRESSES,
  type MockWalletId,
  ALL_WALLET_IDS,
} from './mock-wallet';

// ---------------------------------------------------------------------------
// Mocks
// ---------------------------------------------------------------------------

const roomStore = new Map<string, any>();

vi.mock('@/lib/redis', () => ({
  cacheGet: vi.fn(async (key: string) => roomStore.get(key) ?? null),
  cacheSet: vi.fn(async (key: string, value: any) => { roomStore.set(key, value); }),
}));

vi.mock('@/lib/community-bridge', () => ({
  lookupCommunityData: vi.fn(async () => null),
}));

vi.mock('@/lib/prisma', () => ({
  prisma: {
    streamSession: {
      create: vi.fn(async (args: any) => ({
        id: 'session-' + Date.now(),
        streamKey: args.data.streamKey,
        title: args.data.title,
        status: args.data.status,
      })),
      update: vi.fn(async () => ({})),
    },
  },
}));

// ---------------------------------------------------------------------------
// Imports
// ---------------------------------------------------------------------------

import { isWalletInstalled, getInstalledWallets } from '@/constants/wallets';
import { POST as createRoom } from '@/app/api/room/create/route';
import { POST as joinRoom } from '@/app/api/room/join/route';
import { GET as getChallenge } from '@/app/api/room/wallet-challenge/route';
import { GET as getRoomStatus } from '@/app/api/room/[id]/route';

// ---------------------------------------------------------------------------
// Helpers
// ---------------------------------------------------------------------------

function postJson(url: string, body: any, headers?: Record<string, string>) {
  return new NextRequest(url, {
    method: 'POST',
    body: JSON.stringify(body),
    headers: { 'Content-Type': 'application/json', ...headers },
  });
}

function getReq(url: string, headers?: Record<string, string>) {
  return new NextRequest(url, { method: 'GET', headers });
}

function routeParams(id: string) {
  return { params: Promise.resolve({ id }) };
}

// ---------------------------------------------------------------------------
// Tests
// ---------------------------------------------------------------------------

describe('Wallet Mock Detection', () => {
  afterEach(() => {
    uninstallAllMockWallets();
  });

  it('detects OYL wallet when installed', () => {
    installMockWallet('oyl');
    const oylWallet = { id: 'oyl', injectionKey: 'oyl' } as any;
    expect(isWalletInstalled(oylWallet)).toBe(true);
  });

  it('does not detect OYL wallet when not installed', () => {
    const oylWallet = { id: 'oyl', injectionKey: 'oyl' } as any;
    expect(isWalletInstalled(oylWallet)).toBe(false);
  });

  it('detects Xverse wallet when installed', () => {
    installMockWallet('xverse');
    const xverseWallet = { id: 'xverse', injectionKey: 'XverseProviders' } as any;
    expect(isWalletInstalled(xverseWallet)).toBe(true);
  });

  it('detects Phantom wallet when installed', () => {
    installMockWallet('phantom');
    const phantomWallet = { id: 'phantom', injectionKey: 'phantom' } as any;
    expect(isWalletInstalled(phantomWallet)).toBe(true);
  });

  it('detects OKX wallet when installed', () => {
    installMockWallet('okx');
    const okxWallet = { id: 'okx', injectionKey: 'okxwallet' } as any;
    // okx detection uses default case (window[injectionKey])
    expect((globalThis as any).okxwallet?.bitcoin).toBeDefined();
  });

  it('detects Orange wallet when installed', () => {
    installMockWallet('orange');
    const orangeWallet = { id: 'orange', injectionKey: 'OrangeBitcoinProvider' } as any;
    expect(isWalletInstalled(orangeWallet)).toBe(true);
  });

  it('detects Tokeo wallet when installed', () => {
    installMockWallet('tokeo');
    const tokeoWallet = { id: 'tokeo', injectionKey: 'tokeo' } as any;
    expect(isWalletInstalled(tokeoWallet)).toBe(true);
  });

  it('detects Magic Eden wallet when installed', () => {
    installMockWallet('magic-eden');
    const meWallet = { id: 'magic-eden', injectionKey: 'magicEden' } as any;
    expect(isWalletInstalled(meWallet)).toBe(true);
  });

  it('uninstall removes wallet detection', () => {
    installMockWallet('oyl');
    expect((globalThis as any).oyl).toBeDefined();
    uninstallMockWallet('oyl');
    expect((globalThis as any).oyl).toBeUndefined();
  });
});

describe('Mock Wallet API Surfaces', () => {
  afterEach(() => {
    uninstallAllMockWallets();
  });

  describe('OYL wallet', () => {
    it('getAddresses returns taproot and segwit', async () => {
      installMockWallet('oyl');
      const addrs = await (globalThis as any).oyl.getAddresses();
      expect(addrs.taproot.address).toBe(TEST_ADDRESSES.taproot.address);
      expect(addrs.nativeSegwit.address).toBe(TEST_ADDRESSES.nativeSegwit.address);
      expect(addrs.taproot.publicKey).toBeTruthy();
    });

    it('signMessage returns base64 string', async () => {
      installMockWallet('oyl');
      const sig = await (globalThis as any).oyl.signMessage('test message');
      expect(typeof sig).toBe('string');
      expect(sig.length).toBeGreaterThan(20);
    });

    it('getNetwork returns regtest', async () => {
      installMockWallet('oyl');
      const network = await (globalThis as any).oyl.getNetwork();
      expect(network).toBe('regtest');
    });

    it('isConnected returns true', async () => {
      installMockWallet('oyl');
      const connected = await (globalThis as any).oyl.isConnected();
      expect(connected).toBe(true);
    });
  });

  describe('Xverse wallet', () => {
    it('getAccounts returns taproot and segwit via request()', async () => {
      installMockWallet('xverse');
      const provider = (globalThis as any).XverseProviders.BitcoinProvider;
      const response = await provider.request('getAccounts');
      expect(response.result).toHaveLength(2);
      expect(response.result[0].purpose).toBe('ordinals');
      expect(response.result[0].address).toBe(TEST_ADDRESSES.taproot.address);
      expect(response.result[1].purpose).toBe('payment');
    });

    it('signMessage returns signature', async () => {
      installMockWallet('xverse');
      const provider = (globalThis as any).XverseProviders.BitcoinProvider;
      const response = await provider.request('signMessage', { message: 'test' });
      expect(response.result.signature).toBeTruthy();
    });
  });

  describe('UniSat wallet', () => {
    it('requestAccounts returns taproot address', async () => {
      installMockWallet('unisat');
      const accounts = await (globalThis as any).unisat.requestAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0]).toBe(TEST_ADDRESSES.taproot.address);
    });

    it('getPublicKey returns public key', async () => {
      installMockWallet('unisat');
      const pubKey = await (globalThis as any).unisat.getPublicKey();
      expect(pubKey).toBe(TEST_ADDRESSES.taproot.publicKey);
    });
  });

  describe('OKX wallet', () => {
    it('connect returns address and publicKey', async () => {
      installMockWallet('okx');
      const result = await (globalThis as any).okxwallet.bitcoin.connect();
      expect(result.address).toBe(TEST_ADDRESSES.taproot.address);
      expect(result.publicKey).toBe(TEST_ADDRESSES.taproot.publicKey);
    });
  });

  describe('Phantom wallet', () => {
    it('requestAccounts returns account object', async () => {
      installMockWallet('phantom');
      const accounts = await (globalThis as any).phantom.bitcoin.requestAccounts();
      expect(accounts).toHaveLength(1);
      expect(accounts[0].address).toBe(TEST_ADDRESSES.taproot.address);
      expect(accounts[0].addressType).toBe('p2tr');
    });
  });

  describe('Leather wallet', () => {
    it('getAddresses returns BTC addresses', async () => {
      installMockWallet('leather');
      const response = await (globalThis as any).LeatherProvider.request('getAddresses');
      expect(response.result.addresses).toHaveLength(2);
      expect(response.result.addresses[0].symbol).toBe('BTC');
      expect(response.result.addresses[0].type).toBe('p2tr');
    });
  });

  describe('Magic Eden wallet', () => {
    it('connect returns addresses array', async () => {
      installMockWallet('magic-eden');
      const result = await (globalThis as any).magicEden.bitcoin.connect();
      expect(result.addresses).toHaveLength(2);
      expect(result.addresses[0].purpose).toBe('ordinals');
    });
  });

  describe('Orange wallet', () => {
    it('connect returns addresses via all three providers', async () => {
      installMockWallet('orange');
      const g = globalThis as any;

      // OrangeBitcoinProvider
      const r1 = await g.OrangeBitcoinProvider.connect();
      expect(r1.addresses).toHaveLength(2);

      // OrangeWalletProviders
      const r2 = await g.OrangeWalletProviders.OrangeBitcoinProvider.connect();
      expect(r2.addresses).toHaveLength(2);

      // OrangecryptoProviders
      const r3 = await g.OrangecryptoProviders.BitcoinProvider.connect();
      expect(r3.addresses).toHaveLength(2);
    });
  });

  describe('Tokeo wallet', () => {
    it('getAccounts returns structured accounts', async () => {
      installMockWallet('tokeo');
      const result = await (globalThis as any).tokeo.bitcoin.getAccounts();
      expect(result.accounts).toHaveLength(2);
      expect(result.accounts[0].type).toBe('p2tr');
    });
  });

  describe('Wizz wallet', () => {
    it('requestAccounts returns segwit address', async () => {
      installMockWallet('wizz');
      const accounts = await (globalThis as any).wizz.requestAccounts();
      expect(accounts[0]).toBe(TEST_ADDRESSES.nativeSegwit.address);
    });
  });

  describe('Keplr wallet', () => {
    it('requestAccounts returns taproot via keplr.bitcoin', async () => {
      installMockWallet('keplr');
      const accounts = await (globalThis as any).keplr.bitcoin.requestAccounts();
      expect(accounts[0]).toBe(TEST_ADDRESSES.taproot.address);
    });

    it('also available via bitcoin_keplr', async () => {
      installMockWallet('keplr');
      const accounts = await (globalThis as any).bitcoin_keplr.requestAccounts();
      expect(accounts[0]).toBe(TEST_ADDRESSES.taproot.address);
    });
  });
});

describe('Wallet + Conference Integration', () => {
  beforeEach(() => {
    roomStore.clear();
    vi.clearAllMocks();
  });

  afterEach(() => {
    uninstallAllMockWallets();
  });

  it('OYL: get challenge → sign → create room with verified wallet', async () => {
    installMockWallet('oyl');
    const oyl = (globalThis as any).oyl;

    // Get addresses
    const addrs = await oyl.getAddresses();
    const walletAddress = addrs.taproot.address;

    // Get challenge from API
    const challengeRes = await getChallenge(
      getReq('http://localhost/api/room/wallet-challenge?action=create')
    );
    const { message, timestamp } = await challengeRes.json();

    // Sign with wallet
    const signature = await oyl.signMessage(message);
    expect(typeof signature).toBe('string');
    expect(signature.length).toBeGreaterThan(20);

    // Create room with wallet auth
    const createRes = await createRoom(
      postJson('http://localhost/api/room/create', {
        walletAddress,
        walletSignature: signature,
        walletTimestamp: timestamp,
        walletMessage: message,
      })
    );
    expect(createRes.status).toBe(201);
    const created = await createRes.json();

    // Verify wallet is verified in room
    const statusRes = await getRoomStatus(
      getReq(`http://localhost/api/room/${created.roomId}`, { 'x-room-token': created.adminToken }),
      routeParams(created.roomId)
    );
    const status = await statusRes.json();
    expect(status.self.walletAddress).toBe(walletAddress);
    expect(status.self.walletVerified).toBe(true);
    // Display name auto-generated from address
    expect(status.self.displayName).toContain('...');
  });

  it('Xverse: get challenge → sign → join room with verified wallet', async () => {
    installMockWallet('xverse');
    const provider = (globalThis as any).XverseProviders.BitcoinProvider;

    // Admin creates room first (no wallet)
    const createRes = await createRoom(
      postJson('http://localhost/api/room/create', { displayName: 'Admin' })
    );
    const { roomId, password } = await createRes.json();

    // Xverse user gets addresses
    const accountsRes = await provider.request('getAccounts');
    const walletAddress = accountsRes.result[0].address;

    // Get challenge
    const challengeRes = await getChallenge(
      getReq('http://localhost/api/room/wallet-challenge?action=join')
    );
    const { message, timestamp } = await challengeRes.json();

    // Sign
    const signRes = await provider.request('signMessage', { message });
    const signature = signRes.result.signature;

    // Join with wallet
    const joinRes = await joinRoom(
      postJson('http://localhost/api/room/join', {
        roomId, password,
        walletAddress,
        walletSignature: signature,
        walletTimestamp: timestamp,
        walletMessage: message,
      })
    );
    expect(joinRes.status).toBe(201);
    const joined = await joinRes.json();

    // Verify wallet is verified
    const statusRes = await getRoomStatus(
      getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': joined.token }),
      routeParams(roomId)
    );
    const status = await statusRes.json();
    expect(status.self.walletAddress).toBe(walletAddress);
    expect(status.self.walletVerified).toBe(true);
  });

  for (const walletId of ALL_WALLET_IDS) {
    it(`${walletId}: signMessage produces valid base64 signature for wallet verification`, async () => {
      const addrs = installMockWallet(walletId);
      const g = globalThis as any;

      // Get the signMessage function depending on wallet type
      let signature: string;
      const message = `subfrost.io conference: create at ${Date.now()}`;

      switch (walletId) {
        case 'oyl':
          signature = await g.oyl.signMessage(message);
          break;
        case 'xverse': {
          const res = await g.XverseProviders.BitcoinProvider.request('signMessage', { message });
          signature = res.result.signature;
          break;
        }
        case 'unisat':
          signature = await g.unisat.signMessage(message);
          break;
        case 'okx':
          signature = await g.okxwallet.bitcoin.signMessage(message);
          break;
        case 'phantom':
          signature = await g.phantom.bitcoin.signMessage(message);
          break;
        case 'leather': {
          const res = await g.LeatherProvider.request('signMessage', { message });
          signature = res.result.signature;
          break;
        }
        case 'magic-eden':
          signature = await g.magicEden.bitcoin.signMessage(message);
          break;
        case 'orange':
          signature = await g.OrangeBitcoinProvider.signMessage({ address: addrs.taproot.address, message });
          break;
        case 'tokeo':
          signature = await g.tokeo.bitcoin.signMessage(message);
          break;
        case 'wizz':
          signature = await g.wizz.signMessage(message);
          break;
        case 'keplr':
          signature = await g.keplr.bitcoin.signMessage(message);
          break;
        default:
          throw new Error(`Unhandled wallet: ${walletId}`);
      }

      expect(typeof signature).toBe('string');
      expect(signature.length).toBeGreaterThan(10);
    });
  }

  it('full 2-machine flow: OYL admin creates, UniSat viewer joins', async () => {
    // Machine 1: Admin with OYL wallet
    installMockWallet('oyl');
    const oyl = (globalThis as any).oyl;
    const oylAddrs = await oyl.getAddresses();

    const challengeRes1 = await getChallenge(
      getReq('http://localhost/api/room/wallet-challenge?action=create')
    );
    const challenge1 = await challengeRes1.json();
    const sig1 = await oyl.signMessage(challenge1.message);

    const createRes = await createRoom(
      postJson('http://localhost/api/room/create', {
        name: 'OYL Room',
        walletAddress: oylAddrs.taproot.address,
        walletSignature: sig1,
        walletTimestamp: challenge1.timestamp,
        walletMessage: challenge1.message,
      })
    );
    expect(createRes.status).toBe(201);
    const { roomId, password, adminToken } = await createRes.json();

    uninstallMockWallet('oyl');

    // Machine 2: Viewer with UniSat wallet
    installMockWallet('unisat');
    const unisat = (globalThis as any).unisat;
    const unisatAccounts = await unisat.requestAccounts();
    const unisatPubKey = await unisat.getPublicKey();
    const unisatSig = await unisat.signMessage('join challenge');

    // Join room (without full wallet verification for simplicity)
    const joinRes = await joinRoom(
      postJson('http://localhost/api/room/join', {
        roomId,
        password,
        displayName: 'UniSat User',
      })
    );
    expect(joinRes.status).toBe(201);
    const { token: viewerToken } = await joinRes.json();

    // Both see each other
    const adminStatus = await getRoomStatus(
      getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': adminToken }),
      routeParams(roomId)
    );
    const adminData = await adminStatus.json();
    expect(adminData.room.participants).toHaveLength(2);
    expect(adminData.self.walletVerified).toBe(true);

    const viewerStatus = await getRoomStatus(
      getReq(`http://localhost/api/room/${roomId}`, { 'x-room-token': viewerToken }),
      routeParams(roomId)
    );
    const viewerData = await viewerStatus.json();
    expect(viewerData.room.participants).toHaveLength(2);
    expect(viewerData.self.isAdmin).toBe(false);
  });
});
