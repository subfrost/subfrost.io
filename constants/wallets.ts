/**
 * Browser wallet configuration with custom ordering.
 *
 * SDK wallets are loaded lazily at runtime (to avoid bundling WASM during build).
 * Local wallets (oyl, tokeo, keplr) are defined inline.
 */

export interface BrowserWalletInfo {
  id: string;
  name: string;
  icon: string;
  website: string;
  injectionKey: string;
  supportsPsbt: boolean;
  supportsTaproot: boolean;
  supportsOrdinals: boolean;
  mobileSupport: boolean;
  deepLinkScheme?: string;
}

// Wallets not included in the SDK — local definitions with icons
const LOCAL_WALLETS: BrowserWalletInfo[] = [
  {
    id: 'oyl',
    name: 'Oyl Wallet',
    icon: '/assets/wallets/oyl.png',
    website: 'https://chromewebstore.google.com/detail/oyl-wallet-bitcoin-ordina/ilolmnhjbbggkmopnemiphomhaojndmb',
    injectionKey: 'oyl',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: false,
  },
  {
    id: 'tokeo',
    name: 'Tokeo Wallet',
    icon: '/assets/wallets/tokeo.png',
    website: 'https://chromewebstore.google.com/detail/tokeo-wallet/gcfodaebdmongllonjmfmbmefocjmhol',
    injectionKey: 'tokeo',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: true,
    mobileSupport: true,
    deepLinkScheme: 'tokeo://',
  },
  {
    id: 'keplr',
    name: 'Keplr Wallet',
    icon: '/assets/wallets/keplr.svg',
    website: 'https://keplr.app/download',
    injectionKey: 'keplr',
    supportsPsbt: true,
    supportsTaproot: true,
    supportsOrdinals: false,
    mobileSupport: true,
    deepLinkScheme: 'keplr://',
  },
];

// Desired display order (by wallet id)
const WALLET_ORDER = [
  'oyl',
  'okx',
  'unisat',
  'xverse',
  'phantom',
  'leather',
  'tokeo',
  'magic-eden',
  'orange',
  'wizz',
  'keplr',
];

// Cache for lazily-loaded wallet list
let _cachedWallets: BrowserWalletInfo[] | null = null;

/**
 * Build the ordered wallet list, merging SDK wallets (loaded lazily) with local definitions.
 * Called once on first access; cached thereafter.
 */
function buildWalletList(): BrowserWalletInfo[] {
  if (_cachedWallets) return _cachedWallets;

  let sdkWallets: BrowserWalletInfo[] = [];
  try {
    // Use indirect require to prevent bundler from following the dependency
    const dynamicRequire = new Function('mod', 'return require(mod)');
    const sdk = dynamicRequire('@alkanes/ts-sdk');
    sdkWallets = sdk.BROWSER_WALLETS || [];
  } catch {
    // SDK not available (e.g., during SSR build) — use local-only wallets
  }

  const allWallets = [...sdkWallets, ...LOCAL_WALLETS];
  const walletMap = new Map(allWallets.map(w => [w.id, w]));

  _cachedWallets = WALLET_ORDER
    .map(id => walletMap.get(id))
    .filter((w): w is BrowserWalletInfo => w !== undefined);

  return _cachedWallets;
}

/**
 * Ordered list of supported browser extension wallets.
 * Lazily initialized to avoid WASM bundling during build.
 */
export function getBrowserWallets(): BrowserWalletInfo[] {
  return buildWalletList();
}

// For backward compat — getter that lazily loads
export const BROWSER_WALLETS: BrowserWalletInfo[] = new Proxy([] as BrowserWalletInfo[], {
  get(target, prop, receiver) {
    const wallets = buildWalletList();
    if (prop === 'length') return wallets.length;
    if (prop === Symbol.iterator) return wallets[Symbol.iterator].bind(wallets);
    if (typeof prop === 'string' && !isNaN(Number(prop))) return wallets[Number(prop)];
    if (typeof prop === 'string' && prop in Array.prototype) {
      const val = (wallets as any)[prop];
      return typeof val === 'function' ? val.bind(wallets) : val;
    }
    return Reflect.get(wallets, prop, receiver);
  },
});

/**
 * Detect if a wallet is installed in the browser.
 */
export function isWalletInstalled(wallet: BrowserWalletInfo): boolean {
  if (typeof window === 'undefined') return false;

  try {
    const win = window as any;

    switch (wallet.id) {
      case 'phantom':
        return win.phantom?.bitcoin !== undefined;
      case 'magic-eden':
        return win.magicEden?.bitcoin !== undefined;
      case 'orange':
        return (
          win.OrangeBitcoinProvider !== undefined ||
          win.OrangecryptoProviders?.BitcoinProvider !== undefined ||
          win.OrangeWalletProviders?.OrangeBitcoinProvider !== undefined
        );
      case 'tokeo':
        return win.tokeo?.bitcoin !== undefined;
      case 'xverse':
        return win.XverseProviders?.BitcoinProvider !== undefined;
      default:
        const walletObj = win[wallet.injectionKey];
        return walletObj !== undefined && walletObj !== null;
    }
  } catch {
    return false;
  }
}

/**
 * Get all installed wallets
 */
export function getInstalledWallets(): BrowserWalletInfo[] {
  return getBrowserWallets().filter(isWalletInstalled);
}
