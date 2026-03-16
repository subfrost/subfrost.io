'use client';

import { useState } from 'react';
import { X, ChevronRight, Wallet, ExternalLink } from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import type { BrowserWalletInfo } from '@/constants/wallets';

type ModalView = 'select' | 'browser-extension';

// Wallets that are fully enabled for connection
const ENABLED_WALLET_IDS = new Set(['oyl', 'xverse', 'okx', 'unisat', 'phantom', 'leather', 'tokeo', 'magic-eden', 'orange', 'wizz', 'keplr']);

export default function ConnectWalletModal() {
  const {
    isConnectModalOpen,
    setConnectModalOpen,
    availableBrowserWallets,
    installedBrowserWallets,
    connectBrowserWallet,
  } = useWallet();

  const [view, setView] = useState<ModalView>('select');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  if (!isConnectModalOpen) return null;

  const handleClose = () => {
    setConnectModalOpen(false);
    setView('select');
    setError(null);
    setIsLoading(false);
    setConnectingWallet(null);
  };

  const handleConnect = async (wallet: BrowserWalletInfo) => {
    setIsLoading(true);
    setConnectingWallet(wallet.name);
    setError(null);
    try {
      await connectBrowserWallet(wallet.id);
      handleClose();
    } catch (err) {
      console.error('Wallet connection error:', err);
      setError(err instanceof Error ? err.message : 'Failed to connect wallet');
    } finally {
      setIsLoading(false);
      setConnectingWallet(null);
    }
  };

  // Separate installed vs available wallets
  const installedIds = new Set(installedBrowserWallets.map(w => w.id));
  const installedWallets = availableBrowserWallets.filter(w => installedIds.has(w.id));
  const availableWallets = availableBrowserWallets.filter(w => !installedIds.has(w.id));

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center">
      {/* Backdrop */}
      <div
        className="absolute inset-0 bg-black/70 backdrop-blur-sm"
        onClick={handleClose}
      />

      {/* Modal */}
      <div
        className="relative w-full max-w-sm mx-4 rounded-3xl overflow-hidden"
        style={{
          background: 'linear-gradient(145deg, rgba(15,20,35,0.98), rgba(8,12,24,0.99))',
          border: '1px solid rgba(91,156,255,0.15)',
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            {view === 'browser-extension' && (
              <button
                onClick={() => { setView('select'); setError(null); }}
                className="p-1 -ml-1 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: 'rgba(91,156,255,0.7)' }}
              >
                <ChevronRight className="h-4 w-4 rotate-180" />
              </button>
            )}
            <span
              style={{
                fontSize: 12,
                fontFamily: '"Courier New", monospace',
                color: 'rgba(91,156,255,0.8)',
                letterSpacing: 3,
                textTransform: 'uppercase',
              }}
            >
              {view === 'select' ? 'CONNECT WALLET' : 'SELECT WALLET'}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: 'rgba(255,255,255,0.4)' }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div className="px-6 py-5 max-h-[70vh] overflow-y-auto" style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}>
          {/* Select View */}
          {view === 'select' && (
            <div className="space-y-3">
              <button
                onClick={() => setView('browser-extension')}
                className="flex w-full items-center gap-3 rounded-xl p-4 transition-all hover:scale-[1.01] active:scale-[0.99]"
                style={{
                  background: 'rgba(91,156,255,0.06)',
                  border: '1px solid rgba(91,156,255,0.15)',
                }}
              >
                <div
                  className="flex items-center justify-center w-10 h-10 rounded-xl"
                  style={{ background: 'rgba(91,156,255,0.1)' }}
                >
                  <Wallet className="h-5 w-5" style={{ color: 'rgba(91,156,255,0.8)' }} />
                </div>
                <div className="flex-1 text-left">
                  <div
                    className="text-sm font-medium"
                    style={{ color: 'rgba(255,255,255,0.9)', fontFamily: '"Courier New", monospace' }}
                  >
                    Browser Extension
                  </div>
                  <div
                    className="text-xs mt-0.5"
                    style={{ color: 'rgba(255,255,255,0.35)', fontFamily: '"Courier New", monospace' }}
                  >
                    {installedBrowserWallets.length > 0
                      ? `${installedBrowserWallets.length} wallet${installedBrowserWallets.length > 1 ? 's' : ''} detected`
                      : 'Connect your Bitcoin wallet'}
                  </div>
                </div>
                <ChevronRight className="h-4 w-4" style={{ color: 'rgba(91,156,255,0.4)' }} />
              </button>
            </div>
          )}

          {/* Browser Extension View */}
          {view === 'browser-extension' && (
            <div className="space-y-4">
              {/* Connecting state */}
              {connectingWallet && (
                <div
                  className="flex items-center gap-3 rounded-xl p-4"
                  style={{ background: 'rgba(91,156,255,0.06)', border: '1px solid rgba(91,156,255,0.15)' }}
                >
                  <div className="w-5 h-5 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(91,156,255,0.8)', borderTopColor: 'transparent' }} />
                  <div style={{ fontSize: 12, fontFamily: '"Courier New", monospace', color: 'rgba(91,156,255,0.8)' }}>
                    Connecting to {connectingWallet}... Check your wallet extension.
                  </div>
                </div>
              )}

              {/* Error */}
              {error && (
                <div
                  className="rounded-xl px-4 py-3 text-xs"
                  style={{
                    background: 'rgba(239,68,68,0.08)',
                    border: '1px solid rgba(239,68,68,0.2)',
                    color: 'rgba(239,68,68,0.8)',
                    fontFamily: '"Courier New", monospace',
                  }}
                >
                  {error}
                </div>
              )}

              {/* Installed Wallets */}
              {installedWallets.length > 0 && (
                <div>
                  <div
                    className="mb-2"
                    style={{
                      fontSize: 9,
                      fontFamily: '"Courier New", monospace',
                      color: 'rgba(91,156,255,0.4)',
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                    }}
                  >
                    INSTALLED
                  </div>
                  <div className="space-y-1.5">
                    {installedWallets.map((wallet) => {
                      const isEnabled = ENABLED_WALLET_IDS.has(wallet.id);
                      return (
                        <button
                          key={wallet.id}
                          onClick={() => isEnabled && !isLoading && handleConnect(wallet)}
                          disabled={!isEnabled || isLoading}
                          className="flex w-full items-center gap-3 rounded-xl p-3 transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed"
                          style={{
                            background: isEnabled ? 'rgba(91,156,255,0.04)' : 'rgba(255,255,255,0.02)',
                            border: '1px solid rgba(91,156,255,0.1)',
                          }}
                        >
                          {/* eslint-disable-next-line @next/next/no-img-element */}
                          <img
                            src={wallet.icon}
                            alt={wallet.name}
                            className="w-8 h-8 rounded-lg"
                          />
                          <span
                            className="flex-1 text-left text-sm"
                            style={{ color: 'rgba(255,255,255,0.85)', fontFamily: '"Courier New", monospace' }}
                          >
                            {wallet.name}
                          </span>
                          {connectingWallet === wallet.name ? (
                            <div className="w-4 h-4 border-2 rounded-full animate-spin" style={{ borderColor: 'rgba(91,156,255,0.8)', borderTopColor: 'transparent' }} />
                          ) : (
                            <ChevronRight className="h-4 w-4" style={{ color: 'rgba(91,156,255,0.3)' }} />
                          )}
                        </button>
                      );
                    })}
                  </div>
                </div>
              )}

              {/* Available (not installed) Wallets */}
              {availableWallets.length > 0 && (
                <div>
                  <div
                    className="mb-2"
                    style={{
                      fontSize: 9,
                      fontFamily: '"Courier New", monospace',
                      color: 'rgba(255,255,255,0.25)',
                      letterSpacing: 2,
                      textTransform: 'uppercase',
                    }}
                  >
                    AVAILABLE
                  </div>
                  <div className="space-y-1.5">
                    {availableWallets.map((wallet) => (
                      <a
                        key={wallet.id}
                        href={wallet.website}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="flex w-full items-center gap-3 rounded-xl p-3 transition-all hover:bg-white/[0.02]"
                        style={{ border: '1px solid rgba(255,255,255,0.05)' }}
                      >
                        {/* eslint-disable-next-line @next/next/no-img-element */}
                        <img
                          src={wallet.icon}
                          alt={wallet.name}
                          className="w-8 h-8 rounded-lg opacity-40"
                        />
                        <span
                          className="flex-1 text-left text-sm"
                          style={{ color: 'rgba(255,255,255,0.35)', fontFamily: '"Courier New", monospace' }}
                        >
                          {wallet.name}
                        </span>
                        <ExternalLink className="h-3.5 w-3.5" style={{ color: 'rgba(255,255,255,0.2)' }} />
                      </a>
                    ))}
                  </div>
                </div>
              )}

              {/* Empty state */}
              {installedWallets.length === 0 && availableWallets.length === 0 && (
                <div
                  className="text-center py-8"
                  style={{ fontSize: 12, fontFamily: '"Courier New", monospace', color: 'rgba(255,255,255,0.3)' }}
                >
                  No wallets found
                </div>
              )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
