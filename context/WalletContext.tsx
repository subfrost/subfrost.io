'use client';

import type { ReactNode } from 'react';
import React, { createContext, useContext, useState, useCallback, useEffect, useRef } from 'react';
import { BROWSER_WALLETS, getInstalledWallets, isWalletInstalled, initWalletList, type BrowserWalletInfo } from '@/constants/wallets';

// Lazy-load @alkanes/ts-sdk via dynamic import() to avoid WASM bundling during build.
// We cache the resolved module. import() works in both browser and Node.js.
let _sdkPromise: Promise<any> | null = null;
let _sdkResolved: any = null;

async function loadSDK(): Promise<any> {
  if (_sdkResolved) return _sdkResolved;
  if (!_sdkPromise) {
    // Use new Function to create an opaque import() call that bundlers cannot analyze
    const dynamicImport = new Function('m', 'return import(m)');
    _sdkPromise = dynamicImport('@alkanes/ts-sdk').then((mod: any) => {
      _sdkResolved = mod;
      return mod;
    });
  }
  return _sdkPromise;
}

function getConnectedWalletClass(): any {
  // Return cached class if SDK already loaded synchronously
  return _sdkResolved?.ConnectedWallet ?? null;
}

// Synchronous SDK access (only works after loadSDK has resolved)
function getSDKSync(): any {
  if (!_sdkResolved) throw new Error('SDK not loaded yet — call await loadSDK() first');
  return _sdkResolved;
}

// Minimal type for ConnectedWallet instances
interface ConnectedWalletInstance {
  address: string;
  signMessage: (message: string) => Promise<string>;
  disconnect: () => void | Promise<void>;
}

// Storage keys — same as subfrost-app for cross-app consistency
const STORAGE_KEYS = {
  BROWSER_WALLET_ID: 'subfrost_browser_wallet_id',
  WALLET_TYPE: 'subfrost_wallet_type',
  BROWSER_WALLET_ADDRESSES: 'subfrost_browser_wallet_addresses',
  ENCRYPTED_KEYSTORE: 'subfrost_encrypted_keystore',
  WALLET_NETWORK: 'subfrost_wallet_network',
  SESSION_MNEMONIC: 'subfrost_session_mnemonic',
} as const;

// Address types stored per wallet
export interface WalletAddresses {
  taproot?: { address: string; publicKey?: string };
  nativeSegwit?: { address: string; publicKey?: string };
}

// Helper to create SATS Connect unsecured JWT token
// Used by Xverse, Magic Eden, and Orange wallets
function createSatsConnectToken(payload: any): string {
  const header = { typ: 'JWT', alg: 'none' };
  const encodeBase64 = (obj: any) => {
    const json = JSON.stringify(obj);
    const base64 = btoa(unescape(encodeURIComponent(json)));
    return base64.replace(/\+/g, '-').replace(/\//g, '_').replace(/=+$/, '');
  };
  return `${encodeBase64(header)}.${encodeBase64(payload)}.`;
}

type WalletContextType = {
  // Connection state
  isConnected: boolean;
  isConnectModalOpen: boolean;
  setConnectModalOpen: (open: boolean) => void;

  // Wallet data
  browserWallet: ConnectedWalletInstance | null;
  addresses: WalletAddresses | null;
  walletType: 'keystore' | 'browser' | null;
  primaryAddress: string | null; // taproot preferred, then segwit

  // Wallet lists
  availableBrowserWallets: BrowserWalletInfo[];
  installedBrowserWallets: BrowserWalletInfo[];

  // Keystore state
  hasStoredKeystore: boolean;
  wallet: any; // AlkanesWallet instance from createWalletFromMnemonic

  // Actions — browser wallet
  connectBrowserWallet: (walletId: string) => Promise<void>;
  disconnect: () => void;
  signMessage: (message: string) => Promise<string>;

  // Actions — keystore wallet
  createWallet: (password: string) => Promise<{ mnemonic: string }>;
  unlockWallet: (password: string) => Promise<void>;
  restoreWallet: (mnemonic: string, password: string) => Promise<void>;
  deleteKeystore: () => void;
};

const WalletContext = createContext<WalletContextType | null>(null);

// Helper: derive addresses from an AlkanesWallet and return WalletAddresses
function deriveAddressesFromWallet(wallet: any): WalletAddresses {
  const sdk = getSDKSync();
  const AddressType = sdk.AddressType;
  const addrs: WalletAddresses = {};

  try {
    const taprootAddr = wallet.deriveAddress(AddressType.P2TR, 0, 0);
    if (taprootAddr) {
      addrs.taproot = { address: typeof taprootAddr === 'string' ? taprootAddr : taprootAddr.address };
    }
  } catch (e) {
    console.warn('[WalletContext] Failed to derive taproot address:', e);
  }

  try {
    const segwitAddr = wallet.deriveAddress(AddressType.P2WPKH, 0, 0);
    if (segwitAddr) {
      addrs.nativeSegwit = { address: typeof segwitAddr === 'string' ? segwitAddr : segwitAddr.address };
    }
  } catch (e) {
    console.warn('[WalletContext] Failed to derive segwit address:', e);
  }

  return addrs;
}

// Helper: create AlkanesWallet from mnemonic using SDK (sync — SDK must be loaded)
function createWalletFromMnemonicSDK(mnemonic: string, network?: string): any {
  const sdk = getSDKSync();
  return sdk.createWalletFromMnemonic(mnemonic, network ? { network } : undefined);
}

export function WalletProvider({ children }: { children: ReactNode }) {
  const [browserWallet, setBrowserWallet] = useState<ConnectedWalletInstance | null>(null);
  const [wallet, setWallet] = useState<any>(null); // AlkanesWallet for keystore
  const [addresses, setAddresses] = useState<WalletAddresses | null>(null);
  const [walletType, setWalletType] = useState<'keystore' | 'browser' | null>(null);
  const [isConnectModalOpen, setConnectModalOpen] = useState(false);
  const [installedBrowserWallets, setInstalledBrowserWallets] = useState<BrowserWalletInfo[]>([]);
  const [hasStoredKeystore, setHasStoredKeystore] = useState(false);
  const initRef = useRef(false);

  const isConnected = browserWallet !== null || wallet !== null;
  const primaryAddress = addresses?.taproot?.address || addresses?.nativeSegwit?.address || null;

  // Detect installed wallets + auto-reconnect on mount
  useEffect(() => {
    if (initRef.current) return;
    initRef.current = true;

    // Check for stored keystore
    try {
      const hasKeystore = !!localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
      setHasStoredKeystore(hasKeystore);
    } catch { /* ignore */ }

    // Detect installed wallets
    const installed = getInstalledWallets();
    setInstalledBrowserWallets(installed);

    // Load SDK and wallet list, then attempt auto-reconnect
    Promise.all([loadSDK(), initWalletList()]).then(() => {
      // Re-detect installed wallets now that SDK wallet metadata is loaded
      setInstalledBrowserWallets(getInstalledWallets());
      // Auto-reconnect: keystore wallet from session
      try {
        const storedType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE);
        if (storedType === 'keystore') {
          const sessionMnemonic = sessionStorage.getItem(STORAGE_KEYS.SESSION_MNEMONIC);
          if (sessionMnemonic) {
            const network = localStorage.getItem(STORAGE_KEYS.WALLET_NETWORK) || undefined;
            const restoredWallet = createWalletFromMnemonicSDK(sessionMnemonic, network);
            const derivedAddrs = deriveAddressesFromWallet(restoredWallet);

            setWallet(restoredWallet);
            setAddresses(derivedAddrs);
            setWalletType('keystore');
            console.log('[WalletContext] Restored keystore wallet from session');
            return; // Don't try browser reconnect
          }
        }
      } catch (error) {
        console.warn('[WalletContext] Failed to auto-reconnect keystore wallet:', error);
      }

      // Auto-reconnect from cached localStorage (browser wallet)
      try {
      const storedWalletId = localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ID);
      const storedType = localStorage.getItem(STORAGE_KEYS.WALLET_TYPE);
      if (!storedWalletId || storedType !== 'browser') return;

      const walletInfo = BROWSER_WALLETS.find(w => w.id === storedWalletId);
      if (!walletInfo || !isWalletInstalled(walletInfo)) {
        // Wallet not installed anymore
        localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
        localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
        localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
        return;
      }

      // Reconstruct from cached addresses WITHOUT prompting extension
      const cachedAddrs = localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
      let cachedParsed: WalletAddresses | null = null;
      try { cachedParsed = cachedAddrs ? JSON.parse(cachedAddrs) : null; } catch { /* ignore */ }

      const primaryAddr = cachedParsed?.taproot?.address || cachedParsed?.nativeSegwit?.address;
      if (!primaryAddr) {
        localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
        localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
        localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
        return;
      }

      const primaryPubKey = cachedParsed?.taproot?.publicKey || cachedParsed?.nativeSegwit?.publicKey;
      const isTaproot = primaryAddr.startsWith('bc1p') || primaryAddr.startsWith('tb1p') || primaryAddr.startsWith('bcrt1p');

      const providerObj = (window as any)[walletInfo.injectionKey];
      const ReconnectClass = getConnectedWalletClass();
      if (!ReconnectClass) {
        console.warn('[WalletContext] ConnectedWallet class not available for auto-reconnect');
        return;
      }
      const connected = new ReconnectClass(walletInfo, providerObj, {
        address: primaryAddr,
        publicKey: primaryPubKey,
        addressType: isTaproot ? 'p2tr' : 'p2wpkh',
      });

      setBrowserWallet(connected);
      setAddresses(cachedParsed);
      setWalletType('browser');
      console.log('[WalletContext] Restored browser wallet from cache:', walletInfo.name);
    } catch (error) {
      console.warn('[WalletContext] Failed to auto-reconnect:', error);
      localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
      localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
      localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
    }
    }).catch(() => {
      // SDK failed to load — wallet features will be unavailable
      console.warn('[WalletContext] Failed to load SDK');
    });
  }, []);

  // ===== Keystore wallet methods =====

  const createWallet = useCallback(async (password: string): Promise<{ mnemonic: string }> => {
    const sdk = await loadSDK();
    const network = localStorage.getItem(STORAGE_KEYS.WALLET_NETWORK) || undefined;
    const result = await sdk.createKeystore(password, network ? { network } : {});
    const encrypted = result.encrypted || result.keystore || result;
    const mnemonic = result.mnemonic;

    // Store encrypted keystore
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted));
    localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, 'keystore');
    setHasStoredKeystore(true);

    // Store mnemonic in session for auto-reconnect
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, mnemonic);

    // Create wallet from mnemonic and derive addresses
    const newWallet = createWalletFromMnemonicSDK(mnemonic, network);
    const derivedAddrs = deriveAddressesFromWallet(newWallet);

    setWallet(newWallet);
    setAddresses(derivedAddrs);
    setWalletType('keystore');
    setBrowserWallet(null);
    setConnectModalOpen(false);

    console.log('[WalletContext] Created new keystore wallet');
    return { mnemonic };
  }, []);

  const unlockWallet = useCallback(async (password: string): Promise<void> => {
    const sdk = await loadSDK();
    const encryptedRaw = localStorage.getItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
    if (!encryptedRaw) throw new Error('No stored keystore found');

    let encrypted: any;
    try { encrypted = JSON.parse(encryptedRaw); } catch { encrypted = encryptedRaw; }

    const result = await sdk.unlockKeystore(encrypted, password);
    const mnemonic = result.mnemonic || result;

    const network = localStorage.getItem(STORAGE_KEYS.WALLET_NETWORK) || undefined;

    // Store mnemonic in session for auto-reconnect
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, mnemonic);

    // Create wallet from mnemonic and derive addresses
    const unlockedWallet = createWalletFromMnemonicSDK(mnemonic, network);
    const derivedAddrs = deriveAddressesFromWallet(unlockedWallet);

    localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, 'keystore');

    setWallet(unlockedWallet);
    setAddresses(derivedAddrs);
    setWalletType('keystore');
    setBrowserWallet(null);
    setConnectModalOpen(false);

    console.log('[WalletContext] Unlocked keystore wallet');
  }, []);

  const restoreWallet = useCallback(async (mnemonic: string, password: string): Promise<void> => {
    const sdk = await loadSDK();

    // Validate mnemonic
    const manager = new sdk.KeystoreManager();
    const isValid = manager.validateMnemonic(mnemonic);
    if (!isValid) throw new Error('Invalid mnemonic phrase');

    const network = localStorage.getItem(STORAGE_KEYS.WALLET_NETWORK) || undefined;

    // Create and encrypt keystore from mnemonic
    const result = await sdk.createKeystore(password, { network, mnemonic });
    const encrypted = result.encrypted || result.keystore || result;

    // Store encrypted keystore
    localStorage.setItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE, typeof encrypted === 'string' ? encrypted : JSON.stringify(encrypted));
    localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, 'keystore');
    setHasStoredKeystore(true);

    // Store mnemonic in session for auto-reconnect
    sessionStorage.setItem(STORAGE_KEYS.SESSION_MNEMONIC, mnemonic);

    // Create wallet from mnemonic and derive addresses
    const restoredWallet = createWalletFromMnemonicSDK(mnemonic, network);
    const derivedAddrs = deriveAddressesFromWallet(restoredWallet);

    setWallet(restoredWallet);
    setAddresses(derivedAddrs);
    setWalletType('keystore');
    setBrowserWallet(null);
    setConnectModalOpen(false);

    console.log('[WalletContext] Restored keystore wallet from mnemonic');
  }, []);

  const deleteKeystore = useCallback(() => {
    localStorage.removeItem(STORAGE_KEYS.ENCRYPTED_KEYSTORE);
    localStorage.removeItem(STORAGE_KEYS.WALLET_NETWORK);
    localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);
    setWallet(null);
    setAddresses(null);
    setWalletType(null);
    setHasStoredKeystore(false);
    console.log('[WalletContext] Deleted keystore');
  }, []);

  // ===== Browser wallet methods =====

  const connectBrowserWallet = useCallback(async (walletId: string) => {
    // Ensure SDK is loaded before any wallet connection — ConnectedWallet class is required
    await loadSDK();

    const walletInfo = BROWSER_WALLETS.find(w => w.id === walletId);
    if (!walletInfo) throw new Error(`Unknown wallet: ${walletId}`);
    if (!isWalletInstalled(walletInfo)) throw new Error(`${walletInfo.name} is not installed`);

    const ConnectedWalletClass = getConnectedWalletClass();
    if (!ConnectedWalletClass) throw new Error('Failed to load wallet SDK. Please refresh and try again.');

    let connected: ConnectedWalletInstance | null = null;
    const additionalAddresses: WalletAddresses = {};

    // ===== Wallet-specific connection logic =====

    if (walletId === 'xverse') {
      const xverseProvider = (window as any).XverseProviders?.BitcoinProvider;
      if (!xverseProvider) throw new Error('Xverse wallet not detected');

      const response: any = await Promise.race([
        xverseProvider.request('getAccounts', {
          purposes: ['ordinals', 'payment'],
          message: 'Connect to Subfrost Conference',
        }),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('Xverse connection timed out after 30s. Check your extension.')), 30000)
        ),
      ]);

      if (response?.error) {
        const code = response.error.code;
        if (code === 4001 || code === 'USER_REJECTION') throw new Error('Connection rejected');
        throw new Error(`Xverse error: ${response.error.message || JSON.stringify(response.error)}`);
      }

      const accounts = response?.result || (Array.isArray(response) ? response : []);
      const ordinalsAccount = accounts.find((a: any) => a.purpose === 'ordinals' || a.addressType === 'p2tr') || accounts[0];
      const paymentAccount = accounts.find((a: any) => a.purpose === 'payment' || a.addressType === 'p2wpkh');

      if (ordinalsAccount) additionalAddresses.taproot = { address: ordinalsAccount.address, publicKey: ordinalsAccount.publicKey };
      if (paymentAccount) additionalAddresses.nativeSegwit = { address: paymentAccount.address, publicKey: paymentAccount.publicKey };

      const primaryAddr = ordinalsAccount?.address || paymentAccount?.address;
      const isTaproot = primaryAddr?.startsWith('bc1p') || primaryAddr?.startsWith('tb1p') || primaryAddr?.startsWith('bcrt1p');

      connected = new ConnectedWalletClass(walletInfo, xverseProvider, {
        address: primaryAddr,
        publicKey: ordinalsAccount?.publicKey || paymentAccount?.publicKey,
        addressType: isTaproot ? 'p2tr' : 'p2wpkh',
      });

    } else if (walletId === 'leather') {
      const leatherProvider = (window as any).LeatherProvider;
      if (!leatherProvider) throw new Error('Leather provider not available');

      const response = await leatherProvider.request('getAddresses');
      if (!response?.result?.addresses?.length) throw new Error('No addresses returned from Leather');

      let primaryAccount: any = null;
      for (const addr of response.result.addresses) {
        if (addr.symbol === 'BTC') {
          if (addr.type === 'p2tr') {
            additionalAddresses.taproot = { address: addr.address, publicKey: addr.publicKey };
            if (!primaryAccount) primaryAccount = addr;
          } else if (addr.type === 'p2wpkh') {
            additionalAddresses.nativeSegwit = { address: addr.address, publicKey: addr.publicKey };
            if (!primaryAccount) primaryAccount = addr;
          }
        }
      }
      if (!primaryAccount) throw new Error('No BTC addresses returned from Leather');

      const provider = (window as any)[walletInfo.injectionKey];
      connected = new ConnectedWalletClass(walletInfo, provider, {
        address: primaryAccount.address,
        publicKey: primaryAccount.publicKey,
        addressType: primaryAccount.type,
      });

    } else if (walletId === 'phantom') {
      const phantomBtcProvider = (window as any).phantom?.bitcoin;
      if (!phantomBtcProvider) throw new Error('Phantom Bitcoin provider not available');

      const accounts = await phantomBtcProvider.requestAccounts();
      if (!accounts?.length) throw new Error('No accounts returned from Phantom');

      const primaryAccount = accounts[0];
      const addr = typeof primaryAccount === 'string' ? primaryAccount : primaryAccount.address;
      const pubKey = typeof primaryAccount === 'string' ? undefined : primaryAccount.publicKey;
      const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');

      if (isTaproot) additionalAddresses.taproot = { address: addr, publicKey: pubKey };
      else additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKey };

      connected = new ConnectedWalletClass(walletInfo, phantomBtcProvider, {
        address: addr, publicKey: pubKey, addressType: isTaproot ? 'p2tr' : 'p2wpkh',
      });

    } else if (walletId === 'keplr') {
      const keplrBtcProvider = (window as any).keplr?.bitcoin || (window as any).bitcoin_keplr;
      if (!keplrBtcProvider) throw new Error('Keplr Bitcoin provider not available');

      let accounts: any[];
      if (typeof keplrBtcProvider.requestAccounts === 'function') {
        accounts = await keplrBtcProvider.requestAccounts();
      } else if (typeof keplrBtcProvider.connectWallet === 'function') {
        const result = await keplrBtcProvider.connectWallet();
        accounts = Array.isArray(result) ? result : [result?.address || result];
      } else {
        throw new Error('Keplr Bitcoin provider does not support connection');
      }

      if (!accounts?.length) throw new Error('No accounts returned from Keplr');
      const addr = typeof accounts[0] === 'string' ? accounts[0] : (accounts[0] as any).address;

      let pubKeyHex: string | undefined;
      try { if (typeof keplrBtcProvider.getPublicKey === 'function') pubKeyHex = await keplrBtcProvider.getPublicKey(); } catch { /* ignore */ }

      const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
      if (isTaproot) additionalAddresses.taproot = { address: addr, publicKey: pubKeyHex };
      else additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKeyHex };

      connected = new ConnectedWalletClass(walletInfo, keplrBtcProvider, {
        address: addr, publicKey: pubKeyHex, addressType: isTaproot ? 'p2tr' : 'p2wpkh',
      });

    } else if (walletId === 'oyl') {
      const oylProvider = (window as any).oyl;
      if (!oylProvider) throw new Error('OYL wallet not available');

      const rawAddresses = await Promise.race([
        oylProvider.getAddresses(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OYL connection timed out after 30s. Approve the connection prompt.')), 30000)
        ),
      ]);

      // Handle three different response formats from OYL
      let oylAddresses: { nativeSegwit?: { address: string; publicKey?: string }; taproot?: { address: string; publicKey?: string } } = {};
      if (Array.isArray(rawAddresses)) {
        for (const addr of rawAddresses) {
          if (addr.type === 'p2wpkh' || addr.addressType === 'p2wpkh' || addr.purpose === 'payment')
            oylAddresses.nativeSegwit = { address: addr.address, publicKey: addr.publicKey };
          else if (addr.type === 'p2tr' || addr.addressType === 'p2tr' || addr.purpose === 'ordinals')
            oylAddresses.taproot = { address: addr.address, publicKey: addr.publicKey };
        }
      } else if (rawAddresses && typeof rawAddresses === 'object') {
        if (typeof rawAddresses.nativeSegwit === 'string') {
          oylAddresses.nativeSegwit = { address: rawAddresses.nativeSegwit };
          if (rawAddresses.taproot) oylAddresses.taproot = { address: rawAddresses.taproot };
        } else {
          oylAddresses = rawAddresses;
        }
      }

      if (!oylAddresses?.nativeSegwit?.address && !oylAddresses?.taproot?.address)
        throw new Error('No addresses returned from OYL');

      if (oylAddresses.taproot?.address) additionalAddresses.taproot = { address: oylAddresses.taproot.address, publicKey: oylAddresses.taproot.publicKey };
      if (oylAddresses.nativeSegwit?.address) additionalAddresses.nativeSegwit = { address: oylAddresses.nativeSegwit.address, publicKey: oylAddresses.nativeSegwit.publicKey };

      const primaryAddress = oylAddresses.taproot?.address || oylAddresses.nativeSegwit?.address;
      const primaryPubKey = oylAddresses.taproot?.publicKey || oylAddresses.nativeSegwit?.publicKey;
      const primaryType = oylAddresses.taproot?.address ? 'p2tr' : 'p2wpkh';

      connected = new ConnectedWalletClass(walletInfo, oylProvider, {
        address: primaryAddress, publicKey: primaryPubKey, addressType: primaryType,
      });

    } else if (walletId === 'tokeo') {
      const tokeoProvider = (window as any).tokeo?.bitcoin;
      if (!tokeoProvider) throw new Error('Tokeo wallet not available');

      await tokeoProvider.requestAccounts();
      const result = await tokeoProvider.getAccounts();
      if (!result?.accounts?.length) throw new Error('No accounts returned from Tokeo');

      const taprootAccount = result.accounts.find((a: any) => a.type === 'p2tr');
      const segwitAccount = result.accounts.find((a: any) => a.type === 'p2wpkh');
      if (!taprootAccount) throw new Error('No taproot address found in Tokeo');

      additionalAddresses.taproot = { address: taprootAccount.address, publicKey: taprootAccount.publicKey };
      if (segwitAccount) additionalAddresses.nativeSegwit = { address: segwitAccount.address, publicKey: segwitAccount.publicKey };

      connected = new ConnectedWalletClass(walletInfo, tokeoProvider, {
        address: taprootAccount.address, publicKey: taprootAccount.publicKey, addressType: 'p2tr',
      });

    } else if (walletId === 'orange') {
      const win = window as any;
      const orangeProvider = win.OrangeBitcoinProvider || win.OrangecryptoProviders?.BitcoinProvider || win.OrangeWalletProviders?.OrangeBitcoinProvider;
      if (!orangeProvider) throw new Error('Orange wallet not available');

      const token = createSatsConnectToken({ purposes: ['ordinals', 'payment'], message: 'Connect to Subfrost Conference', network: { type: 'Mainnet' } });
      const response = await orangeProvider.connect(token);
      const addrs = response?.addresses || [];
      if (!addrs.length) throw new Error('No addresses returned from Orange wallet');

      const ordinalsAddr = addrs.find((a: any) => a.purpose === 'ordinals' || a.addressType === 'p2tr' || a.address?.startsWith('bc1p') || a.address?.startsWith('tb1p'));
      const paymentAddr = addrs.find((a: any) => a.purpose === 'payment' || a.addressType === 'p2wpkh' || a.address?.startsWith('bc1q') || a.address?.startsWith('tb1q'));
      const primaryAccount = ordinalsAddr || addrs[0];
      const addr = typeof primaryAccount === 'string' ? primaryAccount : primaryAccount.address;
      const pubKey = typeof primaryAccount === 'string' ? undefined : primaryAccount.publicKey;

      if (ordinalsAddr) additionalAddresses.taproot = { address: typeof ordinalsAddr === 'string' ? ordinalsAddr : ordinalsAddr.address, publicKey: typeof ordinalsAddr === 'string' ? undefined : ordinalsAddr.publicKey };
      if (paymentAddr) additionalAddresses.nativeSegwit = { address: typeof paymentAddr === 'string' ? paymentAddr : paymentAddr.address, publicKey: typeof paymentAddr === 'string' ? undefined : paymentAddr.publicKey };

      connected = new ConnectedWalletClass(walletInfo, orangeProvider, {
        address: addr, publicKey: pubKey, addressType: addr?.startsWith('bc1p') || addr?.startsWith('tb1p') ? 'p2tr' : 'p2wpkh',
      });

    } else if (walletId === 'magic-eden') {
      const magicEdenProvider = (window as any).magicEden?.bitcoin;
      if (!magicEdenProvider) throw new Error('Magic Eden wallet not available');

      const token = createSatsConnectToken({ purposes: ['ordinals', 'payment'], message: 'Connect to Subfrost Conference', network: { type: 'Mainnet' } });
      const response = await magicEdenProvider.connect(token);
      const addrs = response?.addresses || [];
      if (!addrs.length) throw new Error('No addresses returned from Magic Eden wallet');

      const ordinalsAddr = addrs.find((a: any) => a.purpose === 'ordinals' || a.addressType === 'p2tr' || a.address?.startsWith('bc1p') || a.address?.startsWith('tb1p'));
      const paymentAddr = addrs.find((a: any) => a.purpose === 'payment' || a.addressType === 'p2wpkh' || a.address?.startsWith('bc1q') || a.address?.startsWith('tb1q'));
      const primaryAccount = ordinalsAddr || addrs[0];
      const addr = typeof primaryAccount === 'string' ? primaryAccount : primaryAccount.address;
      const pubKey = typeof primaryAccount === 'string' ? undefined : primaryAccount.publicKey;

      if (ordinalsAddr) additionalAddresses.taproot = { address: typeof ordinalsAddr === 'string' ? ordinalsAddr : ordinalsAddr.address, publicKey: typeof ordinalsAddr === 'string' ? undefined : ordinalsAddr.publicKey };
      if (paymentAddr) additionalAddresses.nativeSegwit = { address: typeof paymentAddr === 'string' ? paymentAddr : paymentAddr.address, publicKey: typeof paymentAddr === 'string' ? undefined : paymentAddr.publicKey };

      connected = new ConnectedWalletClass(walletInfo, magicEdenProvider, {
        address: addr, publicKey: pubKey, addressType: addr?.startsWith('bc1p') || addr?.startsWith('tb1p') ? 'p2tr' : 'p2wpkh',
      });

    } else if (walletId === 'okx') {
      const okxProvider = (window as any).okxwallet?.bitcoin;
      if (!okxProvider) throw new Error('OKX wallet not available');

      const result = await Promise.race([
        okxProvider.connect(),
        new Promise<never>((_, reject) =>
          setTimeout(() => reject(new Error('OKX connection timed out after 10s. Check your extension.')), 10000)
        ),
      ]);

      const addr = (result as any)?.address;
      const pubKey = (result as any)?.publicKey;
      if (!addr) throw new Error('No address returned from OKX');

      const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
      if (isTaproot) additionalAddresses.taproot = { address: addr, publicKey: pubKey };
      else additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKey };

      connected = new ConnectedWalletClass(walletInfo, okxProvider, {
        address: addr, publicKey: pubKey, addressType: isTaproot ? 'p2tr' : 'p2wpkh',
      });

    } else if (walletId === 'unisat') {
      const unisatProvider = (window as any).unisat;
      if (!unisatProvider) throw new Error('UniSat wallet not available');

      let accounts: string[];
      const existingAccounts = await unisatProvider.getAccounts();
      if (existingAccounts?.length > 0) {
        accounts = existingAccounts;
      } else {
        // Trigger requestAccounts but poll getAccounts to detect connection
        const requestPromise = unisatProvider.requestAccounts().catch(() => null);
        const pollForConnection = async (): Promise<string[]> => {
          for (let i = 0; i < 60; i++) {
            await new Promise(resolve => setTimeout(resolve, 500));
            try {
              const accts = await unisatProvider.getAccounts();
              if (accts?.length > 0) return accts;
            } catch { /* ignore */ }
          }
          throw new Error('UniSat connection timed out. Approve the connection in your wallet.');
        };

        accounts = await Promise.race([
          requestPromise.then((result: string[] | null) => {
            if (result && result.length > 0) return result;
            return new Promise<string[]>(() => {}); // Never resolves
          }),
          pollForConnection(),
        ]);
      }

      if (!accounts?.length) throw new Error('No accounts returned from UniSat');
      const addr = accounts[0];

      let pubKey: string | undefined;
      try { pubKey = await unisatProvider.getPublicKey(); } catch { /* ignore */ }

      const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
      if (isTaproot) additionalAddresses.taproot = { address: addr, publicKey: pubKey };
      else additionalAddresses.nativeSegwit = { address: addr, publicKey: pubKey };

      connected = new ConnectedWalletClass(walletInfo, unisatProvider, {
        address: addr, publicKey: pubKey, addressType: isTaproot ? 'p2tr' : 'p2wpkh',
      });

    } else {
      // Fallback: use generic WalletConnector from SDK
      const sdk = await loadSDK();
      const connector = new sdk.WalletConnector();
      connected = await connector.connect(walletInfo);

      // Try to extract addresses from connected wallet
      if (connected?.address) {
        const addr = connected.address;
        const isTaproot = addr.startsWith('bc1p') || addr.startsWith('tb1p') || addr.startsWith('bcrt1p');
        if (isTaproot) additionalAddresses.taproot = { address: addr };
        else additionalAddresses.nativeSegwit = { address: addr };
      }
    }

    if (!connected) throw new Error('Failed to connect wallet');

    // Persist connection state
    localStorage.setItem(STORAGE_KEYS.BROWSER_WALLET_ID, walletId);
    localStorage.setItem(STORAGE_KEYS.WALLET_TYPE, 'browser');
    if (additionalAddresses.nativeSegwit || additionalAddresses.taproot) {
      localStorage.setItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES, JSON.stringify(additionalAddresses));
    }

    // Clear any keystore session state when switching to browser wallet
    setWallet(null);

    setBrowserWallet(connected);
    setAddresses(additionalAddresses);
    setWalletType('browser');
    setConnectModalOpen(false);

    // Re-detect installed wallets
    setInstalledBrowserWallets(getInstalledWallets());
  }, []);

  const disconnect = useCallback(() => {
    if (browserWallet) {
      try { browserWallet.disconnect(); } catch { /* ignore */ }
    }
    setBrowserWallet(null);
    setWallet(null);
    setAddresses(null);
    setWalletType(null);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ID);
    localStorage.removeItem(STORAGE_KEYS.WALLET_TYPE);
    localStorage.removeItem(STORAGE_KEYS.BROWSER_WALLET_ADDRESSES);
    sessionStorage.removeItem(STORAGE_KEYS.SESSION_MNEMONIC);
  }, [browserWallet]);

  const signMessage = useCallback(async (message: string): Promise<string> => {
    // Keystore wallet signing
    if (walletType === 'keystore' && wallet) {
      return await wallet.signMessage(message, 0);
    }

    // Browser wallet signing
    if (!browserWallet) throw new Error('Wallet not connected');

    const connectedWalletId = localStorage.getItem(STORAGE_KEYS.BROWSER_WALLET_ID);

    // Wallet-specific signMessage quirks
    if (connectedWalletId === 'tokeo') {
      const tokeoProvider = (window as any).tokeo?.bitcoin;
      if (!tokeoProvider) throw new Error('Tokeo wallet not available');
      return await tokeoProvider.signMessage(message);
    }

    if (connectedWalletId === 'orange') {
      const win = window as any;
      const orangeProvider = win.OrangeBitcoinProvider || win.OrangecryptoProviders?.BitcoinProvider || win.OrangeWalletProviders?.OrangeBitcoinProvider;
      if (!orangeProvider) throw new Error('Orange wallet not available');
      const result = await orangeProvider.signMessage({ address: browserWallet.address, message });
      return result?.signature || result;
    }

    if (connectedWalletId === 'magic-eden') {
      const magicEdenProvider = (window as any).magicEden?.bitcoin;
      if (!magicEdenProvider) throw new Error('Magic Eden wallet not available');
      return await magicEdenProvider.signMessage(message, browserWallet.address);
    }

    // Standard ConnectedWallet.signMessage() for all others
    return browserWallet.signMessage(message);
  }, [browserWallet, walletType, wallet]);

  const value: WalletContextType = {
    isConnected,
    isConnectModalOpen,
    setConnectModalOpen,
    browserWallet,
    addresses,
    walletType,
    primaryAddress,
    availableBrowserWallets: BROWSER_WALLETS,
    installedBrowserWallets,
    hasStoredKeystore,
    wallet,
    connectBrowserWallet,
    disconnect,
    signMessage,
    createWallet,
    unlockWallet,
    restoreWallet,
    deleteKeystore,
  };

  return (
    <WalletContext.Provider value={value}>
      {children}
    </WalletContext.Provider>
  );
}

export function useWallet() {
  const ctx = useContext(WalletContext);
  if (!ctx) throw new Error('useWallet must be used within WalletProvider');
  return ctx;
}
