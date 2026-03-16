'use client';

import { useState, useEffect } from 'react';
import { Loader2, CloudOff, HardDrive } from 'lucide-react';
import { listWalletBackups, formatBackupDate, getRelativeTime, type WalletBackupInfo } from '@/utils/clientSideDrive';

interface WalletListPickerProps {
  onSelect: (wallet: WalletBackupInfo) => void;
  onError?: (error: string) => void;
}

export default function WalletListPicker({ onSelect, onError }: WalletListPickerProps) {
  const [wallets, setWallets] = useState<WalletBackupInfo[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      try {
        setLoading(true);
        setError(null);
        const backups = await listWalletBackups();
        if (!cancelled) {
          setWallets(backups);
        }
      } catch (err) {
        if (!cancelled) {
          const msg = err instanceof Error ? err.message : 'Failed to load wallets from Google Drive';
          setError(msg);
          onError?.(msg);
        }
      } finally {
        if (!cancelled) setLoading(false);
      }
    }

    load();
    return () => { cancelled = true; };
  }, [onError]);

  if (loading) {
    return (
      <div className="flex flex-col items-center justify-center py-10 gap-3">
        <Loader2
          className="h-6 w-6 animate-spin"
          style={{ color: 'rgba(91,156,255,0.6)' }}
        />
        <div
          style={{
            fontSize: 11,
            fontFamily: '"Courier New", monospace',
            color: 'rgba(91,156,255,0.5)',
            letterSpacing: 1,
          }}
        >
          Loading backups from Google Drive...
        </div>
      </div>
    );
  }

  if (error) {
    return (
      <div
        className="rounded-xl px-4 py-6 text-center"
        style={{
          background: 'rgba(239,68,68,0.06)',
          border: '1px solid rgba(239,68,68,0.15)',
        }}
      >
        <CloudOff
          className="h-6 w-6 mx-auto mb-2"
          style={{ color: 'rgba(239,68,68,0.5)' }}
        />
        <div
          style={{
            fontSize: 11,
            fontFamily: '"Courier New", monospace',
            color: 'rgba(239,68,68,0.8)',
          }}
        >
          {error}
        </div>
      </div>
    );
  }

  if (wallets.length === 0) {
    return (
      <div className="text-center py-10">
        <CloudOff
          className="h-8 w-8 mx-auto mb-3"
          style={{ color: 'rgba(91,156,255,0.3)' }}
        />
        <div
          style={{
            fontSize: 12,
            fontFamily: '"Courier New", monospace',
            color: 'rgba(255,255,255,0.4)',
          }}
        >
          No wallet backups found on Google Drive
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-2">
      <div
        style={{
          fontSize: 9,
          fontFamily: '"Courier New", monospace',
          color: 'rgba(91,156,255,0.4)',
          letterSpacing: 2,
          textTransform: 'uppercase',
          marginBottom: 8,
        }}
      >
        SELECT A BACKUP ({wallets.length})
      </div>
      {wallets.map((w) => (
        <button
          key={w.folderId}
          onClick={() => onSelect(w)}
          className="flex w-full items-center gap-3 rounded-xl p-3 transition-all hover:scale-[1.01] active:scale-[0.99]"
          style={{
            background: 'rgba(91,156,255,0.04)',
            border: '1px solid rgba(91,156,255,0.1)',
          }}
        >
          <div
            className="flex items-center justify-center w-9 h-9 rounded-lg flex-shrink-0"
            style={{ background: 'rgba(91,156,255,0.08)' }}
          >
            <HardDrive className="h-4 w-4" style={{ color: 'rgba(91,156,255,0.6)' }} />
          </div>
          <div className="flex-1 text-left min-w-0">
            <div
              className="text-sm truncate"
              style={{
                color: 'rgba(255,255,255,0.85)',
                fontFamily: '"Courier New", monospace',
              }}
            >
              {w.walletLabel}
            </div>
            <div
              className="text-xs mt-0.5"
              style={{
                color: 'rgba(255,255,255,0.3)',
                fontFamily: '"Courier New", monospace',
              }}
            >
              {formatBackupDate(w.timestamp)} ({getRelativeTime(w.timestamp)})
            </div>
          </div>
          {w.hasPasswordHint && (
            <div
              className="text-[9px] px-1.5 py-0.5 rounded"
              style={{
                background: 'rgba(91,156,255,0.1)',
                color: 'rgba(91,156,255,0.6)',
                fontFamily: '"Courier New", monospace',
              }}
            >
              HINT
            </div>
          )}
        </button>
      ))}
    </div>
  );
}
