/**
 * Mock Browser Wallet for Conference Tests
 *
 * Simplified version of subfrost-app's vitest-mock-wallet.ts.
 * No PSBT signing needed — just getAddresses, signMessage, and detection.
 *
 * Supported wallets: oyl, xverse, unisat, okx, phantom, leather,
 *                    magic-eden, orange, tokeo, wizz, keplr
 */

export type MockWalletId =
  | 'oyl'
  | 'xverse'
  | 'unisat'
  | 'okx'
  | 'phantom'
  | 'leather'
  | 'magic-eden'
  | 'orange'
  | 'tokeo'
  | 'wizz'
  | 'keplr';

export const ALL_WALLET_IDS: MockWalletId[] = [
  'oyl', 'xverse', 'unisat', 'okx', 'phantom', 'leather',
  'magic-eden', 'orange', 'tokeo', 'wizz', 'keplr',
];

export interface MockAddresses {
  taproot: { address: string; publicKey: string };
  nativeSegwit: { address: string; publicKey: string };
}

// Deterministic test addresses (no real key derivation needed for conference tests)
const TEST_ADDRESSES: MockAddresses = {
  taproot: {
    address: 'bcrt1p8wpt9v4frpzs3nfdynqhgasnwd0se73qmf0e2s5wlcy2qyng53sxqrr3m',
    publicKey: '03a1af804ac108a8a51782198c2d034b28bf90c8803f5a53f76e393a0153e7e5ac',
  },
  nativeSegwit: {
    address: 'bcrt1q6rz28mcfaxtmd6v789l9rrlrusdprr9pqcpvkl',
    publicKey: '02c6047f9441ed7d6d3045406e95c07cd85c778e4b8cef3ca7abac09b95c709ee5',
  },
};

type WalletInstaller = (addrs: MockAddresses) => { assignments: Record<string, unknown> };

const walletInstallers: Record<MockWalletId, WalletInstaller> = {
  oyl: (addrs) => ({
    assignments: {
      oyl: {
        getAddresses: async () => ({
          taproot: { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey },
          nativeSegwit: { address: addrs.nativeSegwit.address, publicKey: addrs.nativeSegwit.publicKey },
        }),
        signMessage: async (_msg: string) => 'bW9jay1veWwtc2lnbmF0dXJl' + Buffer.from(Date.now().toString()).toString('base64'),
        signPsbt: async (arg: unknown) => ({ psbt: typeof arg === 'string' ? arg : (arg as any).psbt }),
        signPsbts: async (psbts: unknown[]) => psbts.map((p) => ({ psbt: typeof p === 'string' ? p : (p as any).psbt })),
        getNetwork: async () => 'regtest',
        isConnected: async () => true,
        disconnect: async () => {},
        getBalance: async () => ({ confirmed: 0, unconfirmed: 0, total: 0 }),
      },
    },
  }),

  xverse: (addrs) => ({
    assignments: {
      XverseProviders: {
        BitcoinProvider: {
          request: async (method: string, _params?: unknown) => {
            if (method === 'getAccounts') {
              return {
                result: [
                  { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey, purpose: 'ordinals', addressType: 'p2tr' },
                  { address: addrs.nativeSegwit.address, publicKey: addrs.nativeSegwit.publicKey, purpose: 'payment', addressType: 'p2wpkh' },
                ],
              };
            }
            if (method === 'getAddresses') {
              return {
                result: {
                  addresses: [
                    { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey, purpose: 'ordinals' },
                    { address: addrs.nativeSegwit.address, publicKey: addrs.nativeSegwit.publicKey, purpose: 'payment' },
                  ],
                },
              };
            }
            if (method === 'signMessage') {
              return { result: { signature: 'bW9jay14dmVyc2Utc2lnbmF0dXJl' + Date.now() } };
            }
            throw new Error('MockXverse: unsupported method ' + method);
          },
          connect: async () => ({
            result: [
              { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey, purpose: 'ordinals', addressType: 'p2tr' },
              { address: addrs.nativeSegwit.address, publicKey: addrs.nativeSegwit.publicKey, purpose: 'payment', addressType: 'p2wpkh' },
            ],
          }),
          addListener: () => {},
        },
      },
    },
  }),

  unisat: (addrs) => ({
    assignments: {
      unisat: {
        requestAccounts: async () => [addrs.taproot.address],
        getAccounts: async () => [addrs.taproot.address],
        getPublicKey: async () => addrs.taproot.publicKey,
        signMessage: async (_msg: string) => 'bW9jay11bmlzYXQtc2ln' + Date.now(),
        getNetwork: async () => 'regtest',
        switchNetwork: async () => {},
        getBalance: async () => ({ confirmed: 0, unconfirmed: 0, total: 0 }),
        initialize: () => {},
        disconnect: async () => {},
        getChain: async () => 'BITCOIN_SIGNET',
        switchChain: async () => {},
      },
    },
  }),

  okx: (addrs) => {
    const bitcoinApi = {
      connect: async () => ({ address: addrs.taproot.address, publicKey: addrs.taproot.publicKey }),
      requestAccounts: async () => [addrs.taproot.address],
      getAccounts: async () => [addrs.taproot.address],
      getPublicKey: async () => addrs.taproot.publicKey,
      signMessage: async (_msg: string) => 'bW9jay1va3gtc2ln' + Date.now(),
      getNetwork: async () => 'regtest',
      switchNetwork: async () => {},
      getBalance: async () => ({ confirmed: 0, unconfirmed: 0, total: 0 }),
    };
    return { assignments: { okxwallet: { bitcoin: bitcoinApi }, okx: { bitcoin: bitcoinApi } } };
  },

  phantom: (addrs) => ({
    assignments: {
      phantom: {
        bitcoin: {
          isPhantom: true,
          requestAccounts: async () => [
            { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey, addressType: 'p2tr' },
          ],
          signMessage: async (_msg: string) => 'bW9jay1waGFudG9tLXNpZw' + Date.now(),
          handleNotification: () => {},
          removeAllListeners: () => {},
        },
        solana: { isPhantom: true },
      },
    },
  }),

  leather: (addrs) => {
    const provider = {
      request: async (method: string) => {
        if (method === 'getAddresses') {
          return {
            result: {
              addresses: [
                { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey, symbol: 'BTC', type: 'p2tr' },
                { address: addrs.nativeSegwit.address, publicKey: addrs.nativeSegwit.publicKey, symbol: 'BTC', type: 'p2wpkh' },
              ],
            },
          };
        }
        if (method === 'signMessage') {
          return { result: { signature: 'bW9jay1sZWF0aGVyLXNpZw' + Date.now() } };
        }
        throw new Error('MockLeather: unsupported method ' + method);
      },
    };
    return { assignments: { LeatherProvider: provider, leather: provider } };
  },

  'magic-eden': (addrs) => ({
    assignments: {
      magicEden: {
        bitcoin: {
          connect: async () => ({
            addresses: [
              { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey, purpose: 'ordinals', addressType: 'p2tr' },
              { address: addrs.nativeSegwit.address, publicKey: addrs.nativeSegwit.publicKey, purpose: 'payment', addressType: 'p2wpkh' },
            ],
          }),
          signMessage: async (_msg: string) => 'bW9jay1tYWdpYy1lZGVuLXNpZw' + Date.now(),
          getNetwork: async () => 'regtest',
        },
      },
    },
  }),

  orange: (addrs) => {
    const provider = {
      connect: async () => ({
        addresses: [
          { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey, purpose: 'ordinals', addressType: 'p2tr' },
          { address: addrs.nativeSegwit.address, publicKey: addrs.nativeSegwit.publicKey, purpose: 'payment', addressType: 'p2wpkh' },
        ],
      }),
      signMessage: async () => 'bW9jay1vcmFuZ2Utc2ln' + Date.now(),
    };
    return {
      assignments: {
        OrangeBitcoinProvider: provider,
        OrangeWalletProviders: { OrangeBitcoinProvider: provider },
        OrangecryptoProviders: { BitcoinProvider: provider },
      },
    };
  },

  tokeo: (addrs) => ({
    assignments: {
      tokeo: {
        bitcoin: {
          requestAccounts: async () => [addrs.taproot.address],
          getAccounts: async () => ({
            accounts: [
              { address: addrs.taproot.address, publicKey: addrs.taproot.publicKey, type: 'p2tr' },
              { address: addrs.nativeSegwit.address, publicKey: addrs.nativeSegwit.publicKey, type: 'p2wpkh' },
            ],
          }),
          signMessage: async (_msg: string) => 'bW9jay10b2tlby1zaWc' + Date.now(),
        },
      },
    },
  }),

  wizz: (addrs) => ({
    assignments: {
      wizz: {
        requestAccounts: async () => [addrs.nativeSegwit.address],
        getAccounts: async () => [addrs.nativeSegwit.address],
        getPublicKey: async () => addrs.nativeSegwit.publicKey,
        signMessage: async (_msg: string) => 'bW9jay13aXp6LXNpZw' + Date.now(),
        getNetwork: async () => 'regtest',
        switchNetwork: async () => {},
      },
    },
  }),

  keplr: (addrs) => {
    const bitcoinApi = {
      requestAccounts: async () => [addrs.taproot.address],
      getAccounts: async () => [addrs.taproot.address],
      getPublicKey: async () => addrs.taproot.publicKey,
      signMessage: async (_msg: string) => 'bW9jay1rZXBsci1zaWc' + Date.now(),
    };
    return { assignments: { keplr: { bitcoin: bitcoinApi }, bitcoin_keplr: bitcoinApi } };
  },
};

// Track installed keys for cleanup
const installedKeys = new Map<MockWalletId, string[]>();

/**
 * Install a mock browser wallet on globalThis.
 * Returns the test addresses used.
 */
export function installMockWallet(walletId: MockWalletId): MockAddresses {
  const installer = walletInstallers[walletId];
  if (!installer) throw new Error(`Unsupported mock wallet: ${walletId}`);

  const { assignments } = installer(TEST_ADDRESSES);
  const keys = Object.keys(assignments);

  for (const key of keys) {
    (globalThis as any)[key] = assignments[key];
    if ((globalThis as any).window && typeof (globalThis as any).window === 'object') {
      (globalThis as any).window[key] = assignments[key];
    }
  }

  installedKeys.set(walletId, keys);
  return TEST_ADDRESSES;
}

/**
 * Remove a previously installed mock wallet.
 */
export function uninstallMockWallet(walletId: MockWalletId): void {
  const keys = installedKeys.get(walletId);
  if (!keys) return;

  for (const key of keys) {
    delete (globalThis as any)[key];
    if ((globalThis as any).window && typeof (globalThis as any).window === 'object') {
      delete (globalThis as any).window[key];
    }
  }

  installedKeys.delete(walletId);
}

/**
 * Uninstall all mock wallets.
 */
export function uninstallAllMockWallets(): void {
  for (const walletId of installedKeys.keys()) {
    uninstallMockWallet(walletId);
  }
}

export { TEST_ADDRESSES };
