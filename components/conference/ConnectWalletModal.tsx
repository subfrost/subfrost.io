'use client';

import { useState, useRef, useCallback } from 'react';
import {
  X, ChevronRight, ChevronLeft, Wallet, ExternalLink,
  Plus, Key, RotateCcw, Eye, EyeOff, Trash2, Copy, Check,
  Upload, FileText, Cloud, AlertTriangle, Lock, Shield,
} from 'lucide-react';
import { useWallet } from '@/context/WalletContext';
import { initGoogleDrive, isDriveConfigured, backupWalletToDrive, restoreWalletFromDrive, type WalletBackupInfo } from '@/utils/clientSideDrive';
import WalletListPicker from '@/components/conference/WalletListPicker';
import type { BrowserWalletInfo } from '@/constants/wallets';

type ModalView =
  | 'select'
  | 'create'
  | 'show-mnemonic'
  | 'unlock'
  | 'restore-options'
  | 'restore-mnemonic'
  | 'restore-json'
  | 'restore-drive-picker'
  | 'restore-drive-unlock'
  | 'browser-extension';

// Wallets that are fully enabled for connection
const ENABLED_WALLET_IDS = new Set([
  'oyl', 'xverse', 'okx', 'unisat', 'phantom', 'leather',
  'tokeo', 'magic-eden', 'orange', 'wizz', 'keplr',
]);

// Shared style constants
const FONT = '"Courier New", monospace';
const BLUE = 'rgba(91,156,255,';
const BLUE_08 = BLUE + '0.8)';
const BLUE_06 = BLUE + '0.6)';
const BLUE_05 = BLUE + '0.5)';
const BLUE_04 = BLUE + '0.4)';
const BLUE_03 = BLUE + '0.3)';
const BLUE_015 = BLUE + '0.15)';
const BLUE_01 = BLUE + '0.1)';
const BLUE_006 = BLUE + '0.06)';
const WHITE_09 = 'rgba(255,255,255,0.9)';
const WHITE_085 = 'rgba(255,255,255,0.85)';
const WHITE_04 = 'rgba(255,255,255,0.4)';
const WHITE_035 = 'rgba(255,255,255,0.35)';
const WHITE_03 = 'rgba(255,255,255,0.3)';
const WHITE_025 = 'rgba(255,255,255,0.25)';
const ERR_BG = 'rgba(239,68,68,0.08)';
const ERR_BORDER = 'rgba(239,68,68,0.2)';
const ERR_TEXT = 'rgba(239,68,68,0.8)';
const SUCCESS_BG = 'rgba(34,197,94,0.08)';
const SUCCESS_BORDER = 'rgba(34,197,94,0.2)';
const SUCCESS_TEXT = 'rgba(34,197,94,0.8)';
const INPUT_BG = 'rgba(0,0,0,0.4)';
const INPUT_BORDER = 'rgba(91,156,255,0.2)';
const BTN_BG = BLUE_006;
const BTN_BORDER = BLUE_015;

function SectionLabel({ children }: { children: React.ReactNode }) {
  return (
    <div
      style={{
        fontSize: 9,
        fontFamily: FONT,
        color: BLUE_05,
        letterSpacing: 2,
        textTransform: 'uppercase',
        marginBottom: 6,
      }}
    >
      {children}
    </div>
  );
}

function ErrorBanner({ message }: { message: string }) {
  return (
    <div
      className="rounded-xl px-4 py-3 text-xs"
      style={{
        background: ERR_BG,
        border: `1px solid ${ERR_BORDER}`,
        color: ERR_TEXT,
        fontFamily: FONT,
      }}
    >
      {message}
    </div>
  );
}

function WarningBanner({ children }: { children: React.ReactNode }) {
  return (
    <div
      className="flex items-start gap-2 rounded-xl px-4 py-3"
      style={{
        background: 'rgba(245,158,11,0.06)',
        border: '1px solid rgba(245,158,11,0.15)',
      }}
    >
      <AlertTriangle
        className="h-4 w-4 flex-shrink-0 mt-0.5"
        style={{ color: 'rgba(245,158,11,0.7)' }}
      />
      <div
        className="text-xs"
        style={{ color: 'rgba(245,158,11,0.8)', fontFamily: FONT }}
      >
        {children}
      </div>
    </div>
  );
}

function PasswordInput({
  value,
  onChange,
  placeholder = 'Enter password',
  autoFocus = false,
}: {
  value: string;
  onChange: (v: string) => void;
  placeholder?: string;
  autoFocus?: boolean;
}) {
  const [show, setShow] = useState(false);
  return (
    <div className="relative">
      <input
        type={show ? 'text' : 'password'}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        placeholder={placeholder}
        autoFocus={autoFocus}
        className="w-full rounded-xl px-4 py-3 pr-10 text-sm outline-none focus:ring-1"
        style={{
          background: INPUT_BG,
          border: `1px solid ${INPUT_BORDER}`,
          color: WHITE_09,
          fontFamily: FONT,
        }}
      />
      <button
        type="button"
        onClick={() => setShow(!show)}
        className="absolute right-3 top-1/2 -translate-y-1/2 p-0.5"
        style={{ color: BLUE_04 }}
      >
        {show ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
      </button>
    </div>
  );
}

function ActionButton({
  onClick,
  disabled,
  loading,
  children,
  variant = 'primary',
}: {
  onClick: () => void;
  disabled?: boolean;
  loading?: boolean;
  children: React.ReactNode;
  variant?: 'primary' | 'secondary';
}) {
  const isPrimary = variant === 'primary';
  return (
    <button
      onClick={onClick}
      disabled={disabled || loading}
      className="flex items-center justify-center gap-2 rounded-xl px-4 py-3 text-sm font-medium transition-all hover:scale-[1.01] active:scale-[0.99] disabled:opacity-40 disabled:cursor-not-allowed w-full"
      style={{
        background: isPrimary ? 'rgba(91,156,255,0.12)' : BTN_BG,
        border: `1px solid ${isPrimary ? 'rgba(91,156,255,0.25)' : BTN_BORDER}`,
        color: isPrimary ? BLUE_08 : WHITE_085,
        fontFamily: FONT,
      }}
    >
      {loading && (
        <div
          className="w-4 h-4 border-2 rounded-full animate-spin flex-shrink-0"
          style={{ borderColor: BLUE_08, borderTopColor: 'transparent' }}
        />
      )}
      {children}
    </button>
  );
}

function BackButton({ onClick }: { onClick: () => void }) {
  return (
    <button
      onClick={onClick}
      className="flex items-center gap-1 text-xs transition-colors hover:opacity-80"
      style={{ color: BLUE_05, fontFamily: FONT }}
    >
      <ChevronLeft className="h-3.5 w-3.5" />
      Back
    </button>
  );
}

function NavButton({
  icon: Icon,
  label,
  subtitle,
  onClick,
}: {
  icon: React.ElementType;
  label: string;
  subtitle?: string;
  onClick: () => void;
}) {
  return (
    <button
      onClick={onClick}
      className="flex w-full items-center gap-3 rounded-xl p-4 transition-all hover:scale-[1.01] active:scale-[0.99]"
      style={{ background: BTN_BG, border: `1px solid ${BTN_BORDER}` }}
    >
      <div
        className="flex items-center justify-center w-10 h-10 rounded-xl flex-shrink-0"
        style={{ background: BLUE_01 }}
      >
        <Icon className="h-5 w-5" style={{ color: BLUE_08 }} />
      </div>
      <div className="flex-1 text-left">
        <div className="text-sm font-medium" style={{ color: WHITE_09, fontFamily: FONT }}>
          {label}
        </div>
        {subtitle && (
          <div className="text-xs mt-0.5" style={{ color: WHITE_035, fontFamily: FONT }}>
            {subtitle}
          </div>
        )}
      </div>
      <ChevronRight className="h-4 w-4 flex-shrink-0" style={{ color: BLUE_04 }} />
    </button>
  );
}

export default function ConnectWalletModal() {
  const {
    isConnectModalOpen,
    setConnectModalOpen,
    hasStoredKeystore,
    createWallet,
    unlockWallet,
    restoreWallet,
    deleteKeystore,
    availableBrowserWallets,
    installedBrowserWallets,
    connectBrowserWallet,
  } = useWallet();

  const [view, setView] = useState<ModalView>('select');
  const [error, setError] = useState<string | null>(null);
  const [isLoading, setIsLoading] = useState(false);

  // Browser extension state
  const [connectingWallet, setConnectingWallet] = useState<string | null>(null);

  // Create wallet state
  const [createPassword, setCreatePassword] = useState('');
  const [createConfirmPassword, setCreateConfirmPassword] = useState('');

  // Show mnemonic state
  const [generatedMnemonic, setGeneratedMnemonic] = useState('');
  const [mnemonicSaved, setMnemonicSaved] = useState(false);
  const [copied, setCopied] = useState(false);
  const [backupProgress, setBackupProgress] = useState<number | null>(null);
  const [backupDone, setBackupDone] = useState(false);

  // Unlock state
  const [unlockPassword, setUnlockPassword] = useState('');

  // Delete confirmation
  const [showDeleteConfirm, setShowDeleteConfirm] = useState(false);

  // Restore mnemonic state
  const [restoreMnemonic, setRestoreMnemonic] = useState('');
  const [restorePassword, setRestorePassword] = useState('');

  // Restore JSON state
  const [jsonFile, setJsonFile] = useState<string | null>(null);
  const [jsonFileName, setJsonFileName] = useState<string | null>(null);
  const [jsonPassword, setJsonPassword] = useState('');
  const fileInputRef = useRef<HTMLInputElement>(null);

  // Restore Drive state
  const [selectedDriveWallet, setSelectedDriveWallet] = useState<WalletBackupInfo | null>(null);
  const [driveKeystoreJson, setDriveKeystoreJson] = useState<string | null>(null);
  const [drivePasswordHint, setDrivePasswordHint] = useState<string | null>(null);
  const [drivePassword, setDrivePassword] = useState('');

  if (!isConnectModalOpen) return null;

  const resetState = () => {
    setView('select');
    setError(null);
    setIsLoading(false);
    setConnectingWallet(null);
    setCreatePassword('');
    setCreateConfirmPassword('');
    setGeneratedMnemonic('');
    setMnemonicSaved(false);
    setCopied(false);
    setBackupProgress(null);
    setBackupDone(false);
    setUnlockPassword('');
    setShowDeleteConfirm(false);
    setRestoreMnemonic('');
    setRestorePassword('');
    setJsonFile(null);
    setJsonFileName(null);
    setJsonPassword('');
    setSelectedDriveWallet(null);
    setDriveKeystoreJson(null);
    setDrivePasswordHint(null);
    setDrivePassword('');
  };

  const handleClose = () => {
    setConnectModalOpen(false);
    resetState();
  };

  const goTo = (v: ModalView) => {
    setError(null);
    setView(v);
  };

  // ===== Browser Extension =====

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

  const installedIds = new Set(installedBrowserWallets.map((w) => w.id));
  const installedWallets = availableBrowserWallets.filter((w) => installedIds.has(w.id));
  const availableWallets = availableBrowserWallets.filter((w) => !installedIds.has(w.id));

  // ===== Create Wallet =====

  const handleCreate = async () => {
    if (!createPassword) {
      setError('Password is required');
      return;
    }
    if (createPassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (createPassword !== createConfirmPassword) {
      setError('Passwords do not match');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const result = await createWallet(createPassword);
      setGeneratedMnemonic(result.mnemonic);
      setCreatePassword('');
      setCreateConfirmPassword('');
      goTo('show-mnemonic');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to create wallet');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== Show Mnemonic =====

  const handleCopyMnemonic = () => {
    navigator.clipboard.writeText(generatedMnemonic);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handleBackupToDrive = async () => {
    setBackupProgress(10);
    setError(null);
    try {
      await initGoogleDrive();
      setBackupProgress(30);
      const encryptedRaw = localStorage.getItem('subfrost_encrypted_keystore');
      if (!encryptedRaw) throw new Error('No keystore found to backup');
      setBackupProgress(50);
      await backupWalletToDrive(encryptedRaw);
      setBackupProgress(100);
      setBackupDone(true);
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Backup failed');
      setBackupProgress(null);
    }
  };

  const handleMnemonicContinue = () => {
    setGeneratedMnemonic('');
    handleClose();
  };

  // ===== Unlock =====

  const handleUnlock = async () => {
    if (!unlockPassword) {
      setError('Password is required');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await unlockWallet(unlockPassword);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet. Check your password.');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== Delete Keystore =====

  const handleDelete = () => {
    deleteKeystore();
    setShowDeleteConfirm(false);
    goTo('select');
  };

  // ===== Restore from Mnemonic =====

  const handleRestoreMnemonic = async () => {
    const trimmed = restoreMnemonic.trim();
    if (!trimmed) {
      setError('Recovery phrase is required');
      return;
    }
    const words = trimmed.split(/\s+/);
    if (words.length !== 12 && words.length !== 24) {
      setError('Recovery phrase must be 12 or 24 words');
      return;
    }
    if (!restorePassword || restorePassword.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      await restoreWallet(trimmed, restorePassword);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore wallet');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== Restore from JSON =====

  const handleFileUpload = (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;
    setJsonFileName(file.name);
    const reader = new FileReader();
    reader.onload = (ev) => {
      setJsonFile(ev.target?.result as string);
    };
    reader.readAsText(file);
  };

  const handleRestoreJson = async () => {
    if (!jsonFile) {
      setError('Please select a keystore file');
      return;
    }
    if (!jsonPassword) {
      setError('Password is required');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const dynamicRequire = new Function('mod', 'return require(mod)');
      const { unlockKeystore } = dynamicRequire('@alkanes/ts-sdk');
      let parsed: any;
      try { parsed = JSON.parse(jsonFile); } catch { parsed = jsonFile; }
      const result = await unlockKeystore(parsed, jsonPassword);
      const mnemonic = result.mnemonic || result;
      await restoreWallet(mnemonic, jsonPassword);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to restore from keystore file');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== Restore from Drive =====

  const handleDriveSelect = async (wallet: WalletBackupInfo) => {
    setIsLoading(true);
    setError(null);
    try {
      const result = await restoreWalletFromDrive(wallet.folderId);
      setSelectedDriveWallet(wallet);
      setDriveKeystoreJson(result.encryptedKeystore);
      setDrivePasswordHint(result.passwordHint);
      goTo('restore-drive-unlock');
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to load wallet from Drive');
    } finally {
      setIsLoading(false);
    }
  };

  const handleDriveUnlock = async () => {
    if (!drivePassword) {
      setError('Password is required');
      return;
    }
    if (!driveKeystoreJson) {
      setError('No keystore data loaded');
      return;
    }
    setIsLoading(true);
    setError(null);
    try {
      const dynamicRequire = new Function('mod', 'return require(mod)');
      const { unlockKeystore } = dynamicRequire('@alkanes/ts-sdk');
      let parsed: any;
      try { parsed = JSON.parse(driveKeystoreJson); } catch { parsed = driveKeystoreJson; }
      const result = await unlockKeystore(parsed, drivePassword);
      const mnemonic = result.mnemonic || result;
      await restoreWallet(mnemonic, drivePassword);
      handleClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to unlock wallet. Check your password.');
    } finally {
      setIsLoading(false);
    }
  };

  // ===== Header title per view =====

  const viewTitles: Record<ModalView, string> = {
    'select': 'CONNECT WALLET',
    'create': 'CREATE WALLET',
    'show-mnemonic': 'RECOVERY PHRASE',
    'unlock': 'UNLOCK WALLET',
    'restore-options': 'RESTORE WALLET',
    'restore-mnemonic': 'SEED PHRASE',
    'restore-json': 'KEYSTORE FILE',
    'restore-drive-picker': 'GOOGLE DRIVE',
    'restore-drive-unlock': 'UNLOCK BACKUP',
    'browser-extension': 'SELECT WALLET',
  };

  const showBack = view !== 'select' && view !== 'show-mnemonic';

  const handleBack = () => {
    setError(null);
    switch (view) {
      case 'create':
      case 'unlock':
      case 'restore-options':
      case 'browser-extension':
        goTo('select');
        break;
      case 'restore-mnemonic':
      case 'restore-json':
      case 'restore-drive-picker':
        goTo('restore-options');
        break;
      case 'restore-drive-unlock':
        goTo('restore-drive-picker');
        break;
      default:
        goTo('select');
    }
  };

  // ===== Mnemonic words for grid =====
  const mnemonicWords = generatedMnemonic ? generatedMnemonic.split(/\s+/) : [];

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
          border: `1px solid ${BLUE_015}`,
          boxShadow: '0 25px 60px rgba(0,0,0,0.6)',
        }}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-white/5">
          <div className="flex items-center gap-2">
            {showBack && (
              <button
                onClick={handleBack}
                className="p-1 -ml-1 rounded-lg hover:bg-white/5 transition-colors"
                style={{ color: 'rgba(91,156,255,0.7)' }}
              >
                <ChevronLeft className="h-4 w-4" />
              </button>
            )}
            <span
              style={{
                fontSize: 12,
                fontFamily: FONT,
                color: BLUE_08,
                letterSpacing: 3,
                textTransform: 'uppercase',
              }}
            >
              {viewTitles[view]}
            </span>
          </div>
          <button
            onClick={handleClose}
            className="p-1.5 rounded-lg hover:bg-white/5 transition-colors"
            style={{ color: WHITE_04 }}
          >
            <X className="h-4 w-4" />
          </button>
        </div>

        {/* Content */}
        <div
          className="px-6 py-5 max-h-[70vh] overflow-y-auto"
          style={{ scrollbarWidth: 'thin', scrollbarColor: '#333 transparent' }}
        >
          {/* ========== SELECT VIEW ========== */}
          {view === 'select' && (
            <div className="space-y-3">
              {/* Unlock Existing Wallet */}
              {hasStoredKeystore && (
                <NavButton
                  icon={Lock}
                  label="Unlock Existing Wallet"
                  subtitle="Decrypt your stored wallet"
                  onClick={() => goTo('unlock')}
                />
              )}

              {/* Create New Wallet */}
              <NavButton
                icon={Plus}
                label="Create New Wallet"
                subtitle="Generate a new recovery phrase"
                onClick={() => goTo('create')}
              />

              {/* Restore Wallet */}
              <NavButton
                icon={RotateCcw}
                label="Restore Wallet"
                subtitle="From seed phrase, file, or backup"
                onClick={() => goTo('restore-options')}
              />

              {/* Browser Extension */}
              <NavButton
                icon={Wallet}
                label="Browser Extension"
                subtitle={
                  installedBrowserWallets.length > 0
                    ? `${installedBrowserWallets.length} wallet${installedBrowserWallets.length > 1 ? 's' : ''} detected`
                    : 'Connect your Bitcoin wallet'
                }
                onClick={() => goTo('browser-extension')}
              />

              {/* Delete Stored Wallet */}
              {hasStoredKeystore && (
                <div className="pt-2 text-center">
                  {!showDeleteConfirm ? (
                    <button
                      onClick={() => setShowDeleteConfirm(true)}
                      className="text-xs transition-colors hover:opacity-80 inline-flex items-center gap-1"
                      style={{ color: 'rgba(239,68,68,0.5)', fontFamily: FONT }}
                    >
                      <Trash2 className="h-3 w-3" />
                      Delete Stored Wallet
                    </button>
                  ) : (
                    <div
                      className="rounded-xl px-4 py-3 space-y-3"
                      style={{ background: ERR_BG, border: `1px solid ${ERR_BORDER}` }}
                    >
                      <div className="text-xs" style={{ color: ERR_TEXT, fontFamily: FONT }}>
                        This will permanently delete your stored wallet. Make sure you have your recovery phrase backed up.
                      </div>
                      <div className="flex gap-2">
                        <button
                          onClick={() => setShowDeleteConfirm(false)}
                          className="flex-1 rounded-lg py-2 text-xs transition-colors"
                          style={{
                            background: 'rgba(255,255,255,0.05)',
                            border: '1px solid rgba(255,255,255,0.1)',
                            color: WHITE_085,
                            fontFamily: FONT,
                          }}
                        >
                          Cancel
                        </button>
                        <button
                          onClick={handleDelete}
                          className="flex-1 rounded-lg py-2 text-xs transition-colors"
                          style={{
                            background: 'rgba(239,68,68,0.15)',
                            border: '1px solid rgba(239,68,68,0.3)',
                            color: ERR_TEXT,
                            fontFamily: FONT,
                          }}
                        >
                          Delete
                        </button>
                      </div>
                    </div>
                  )}
                </div>
              )}
            </div>
          )}

          {/* ========== CREATE VIEW ========== */}
          {view === 'create' && (
            <div className="space-y-4">
              <div>
                <SectionLabel>PASSWORD</SectionLabel>
                <PasswordInput
                  value={createPassword}
                  onChange={setCreatePassword}
                  placeholder="Enter a strong password (min 8 chars)"
                  autoFocus
                />
              </div>
              <div>
                <SectionLabel>CONFIRM PASSWORD</SectionLabel>
                <PasswordInput
                  value={createConfirmPassword}
                  onChange={setCreateConfirmPassword}
                  placeholder="Confirm your password"
                />
              </div>
              <WarningBanner>
                After creating your wallet, you will be shown a recovery phrase. Write it down and store it safely. It is the only way to recover your wallet.
              </WarningBanner>
              {error && <ErrorBanner message={error} />}
              <div className="flex gap-2 pt-1">
                <ActionButton onClick={() => goTo('select')} variant="secondary">
                  Back
                </ActionButton>
                <ActionButton
                  onClick={handleCreate}
                  loading={isLoading}
                  disabled={!createPassword || !createConfirmPassword}
                >
                  Create
                </ActionButton>
              </div>
            </div>
          )}

          {/* ========== SHOW MNEMONIC VIEW ========== */}
          {view === 'show-mnemonic' && (
            <div className="space-y-4">
              <div
                className="flex items-start gap-2 rounded-xl px-4 py-3"
                style={{
                  background: 'rgba(239,68,68,0.06)',
                  border: '1px solid rgba(239,68,68,0.15)',
                }}
              >
                <Shield
                  className="h-4 w-4 flex-shrink-0 mt-0.5"
                  style={{ color: 'rgba(239,68,68,0.7)' }}
                />
                <div className="text-xs" style={{ color: 'rgba(239,68,68,0.8)', fontFamily: FONT }}>
                  Write down these words in order. Anyone with this phrase can access your wallet. Never share it.
                </div>
              </div>

              {/* Mnemonic Grid */}
              <div
                className="rounded-xl p-4"
                style={{ background: 'rgba(0,0,0,0.3)', border: `1px solid ${BLUE_015}` }}
              >
                <div className="grid grid-cols-3 gap-2">
                  {mnemonicWords.map((word, i) => (
                    <div
                      key={i}
                      className="flex items-center gap-1.5 rounded-lg px-2 py-1.5"
                      style={{ background: 'rgba(91,156,255,0.04)' }}
                    >
                      <span
                        className="text-[9px] w-4 text-right flex-shrink-0"
                        style={{ color: BLUE_04, fontFamily: FONT }}
                      >
                        {i + 1}
                      </span>
                      <span
                        className="text-xs"
                        style={{ color: WHITE_09, fontFamily: FONT }}
                      >
                        {word}
                      </span>
                    </div>
                  ))}
                </div>
              </div>

              {/* Copy Button */}
              <button
                onClick={handleCopyMnemonic}
                className="flex items-center justify-center gap-2 w-full rounded-xl py-2 text-xs transition-all"
                style={{
                  background: copied ? SUCCESS_BG : 'rgba(255,255,255,0.03)',
                  border: `1px solid ${copied ? SUCCESS_BORDER : 'rgba(255,255,255,0.08)'}`,
                  color: copied ? SUCCESS_TEXT : WHITE_04,
                  fontFamily: FONT,
                }}
              >
                {copied ? (
                  <>
                    <Check className="h-3.5 w-3.5" />
                    Copied to clipboard
                  </>
                ) : (
                  <>
                    <Copy className="h-3.5 w-3.5" />
                    Copy recovery phrase
                  </>
                )}
              </button>

              {/* Saved Checkbox */}
              <label className="flex items-center gap-2 cursor-pointer select-none">
                <input
                  type="checkbox"
                  checked={mnemonicSaved}
                  onChange={(e) => setMnemonicSaved(e.target.checked)}
                  className="rounded"
                  style={{ accentColor: 'rgba(91,156,255,0.8)' }}
                />
                <span className="text-xs" style={{ color: WHITE_085, fontFamily: FONT }}>
                  I have saved my recovery phrase
                </span>
              </label>

              {/* Google Drive Backup */}
              {isDriveConfigured() && (
                <div>
                  {backupProgress !== null ? (
                    <div className="space-y-2">
                      <div
                        className="w-full h-2 rounded-full overflow-hidden"
                        style={{ background: 'rgba(91,156,255,0.1)' }}
                      >
                        <div
                          className="h-full rounded-full transition-all duration-500"
                          style={{
                            width: `${backupProgress}%`,
                            background: backupDone
                              ? 'rgba(34,197,94,0.6)'
                              : 'rgba(91,156,255,0.5)',
                          }}
                        />
                      </div>
                      <div
                        className="text-xs text-center"
                        style={{
                          color: backupDone ? SUCCESS_TEXT : BLUE_05,
                          fontFamily: FONT,
                        }}
                      >
                        {backupDone ? 'Backed up to Google Drive' : 'Uploading to Google Drive...'}
                      </div>
                    </div>
                  ) : (
                    <button
                      onClick={handleBackupToDrive}
                      className="flex items-center justify-center gap-2 w-full rounded-xl py-3 text-xs transition-all hover:scale-[1.01] active:scale-[0.99]"
                      style={{
                        background: 'rgba(91,156,255,0.06)',
                        border: `1px solid ${BLUE_015}`,
                        color: BLUE_06,
                        fontFamily: FONT,
                      }}
                    >
                      <Cloud className="h-4 w-4" />
                      Backup to Google Drive
                    </button>
                  )}
                </div>
              )}

              {error && <ErrorBanner message={error} />}

              {/* Continue / Skip */}
              <ActionButton
                onClick={handleMnemonicContinue}
                disabled={!mnemonicSaved && !backupDone}
              >
                {mnemonicSaved || backupDone ? 'Continue' : 'Skip Backup'}
              </ActionButton>

              {/* Allow skip even without checkbox if they really want */}
              {!mnemonicSaved && !backupDone && (
                <button
                  onClick={handleMnemonicContinue}
                  className="w-full text-center text-[10px] py-1 transition-colors hover:opacity-80"
                  style={{ color: 'rgba(255,255,255,0.2)', fontFamily: FONT }}
                >
                  Skip without saving (not recommended)
                </button>
              )}
            </div>
          )}

          {/* ========== UNLOCK VIEW ========== */}
          {view === 'unlock' && (
            <div className="space-y-4">
              <div>
                <SectionLabel>PASSWORD</SectionLabel>
                <PasswordInput
                  value={unlockPassword}
                  onChange={setUnlockPassword}
                  placeholder="Enter your wallet password"
                  autoFocus
                />
              </div>
              {error && <ErrorBanner message={error} />}
              <div className="flex gap-2 pt-1">
                <ActionButton onClick={() => goTo('select')} variant="secondary">
                  Back
                </ActionButton>
                <ActionButton
                  onClick={handleUnlock}
                  loading={isLoading}
                  disabled={!unlockPassword}
                >
                  Unlock
                </ActionButton>
              </div>
            </div>
          )}

          {/* ========== RESTORE OPTIONS VIEW ========== */}
          {view === 'restore-options' && (
            <div className="space-y-3">
              <NavButton
                icon={Key}
                label="Seed Phrase"
                subtitle="Enter your 12 or 24-word recovery phrase"
                onClick={() => goTo('restore-mnemonic')}
              />
              <NavButton
                icon={FileText}
                label="Keystore File"
                subtitle="Upload a JSON keystore file"
                onClick={() => goTo('restore-json')}
              />
              <NavButton
                icon={Cloud}
                label="Google Drive"
                subtitle="Restore from a cloud backup"
                onClick={() => goTo('restore-drive-picker')}
              />
            </div>
          )}

          {/* ========== RESTORE MNEMONIC VIEW ========== */}
          {view === 'restore-mnemonic' && (
            <div className="space-y-4">
              <div>
                <SectionLabel>RECOVERY PHRASE</SectionLabel>
                <textarea
                  value={restoreMnemonic}
                  onChange={(e) => setRestoreMnemonic(e.target.value)}
                  placeholder="Enter your 12 or 24-word recovery phrase, separated by spaces"
                  rows={4}
                  autoFocus
                  className="w-full rounded-xl px-4 py-3 text-sm outline-none resize-none focus:ring-1"
                  style={{
                    background: INPUT_BG,
                    border: `1px solid ${INPUT_BORDER}`,
                    color: WHITE_09,
                    fontFamily: FONT,
                    scrollbarWidth: 'thin',
                    scrollbarColor: '#333 transparent',
                  }}
                />
              </div>
              <div>
                <SectionLabel>NEW PASSWORD</SectionLabel>
                <PasswordInput
                  value={restorePassword}
                  onChange={setRestorePassword}
                  placeholder="Set a password (min 8 chars)"
                />
              </div>
              {error && <ErrorBanner message={error} />}
              <div className="flex gap-2 pt-1">
                <ActionButton onClick={() => goTo('restore-options')} variant="secondary">
                  Back
                </ActionButton>
                <ActionButton
                  onClick={handleRestoreMnemonic}
                  loading={isLoading}
                  disabled={!restoreMnemonic.trim() || !restorePassword}
                >
                  Restore
                </ActionButton>
              </div>
            </div>
          )}

          {/* ========== RESTORE JSON VIEW ========== */}
          {view === 'restore-json' && (
            <div className="space-y-4">
              <div>
                <SectionLabel>KEYSTORE FILE</SectionLabel>
                <input
                  ref={fileInputRef}
                  type="file"
                  accept=".json,application/json"
                  onChange={handleFileUpload}
                  className="hidden"
                />
                <button
                  onClick={() => fileInputRef.current?.click()}
                  className="flex flex-col items-center justify-center w-full rounded-xl py-6 transition-all hover:scale-[1.01] active:scale-[0.99]"
                  style={{
                    background: jsonFile ? SUCCESS_BG : INPUT_BG,
                    border: `1px dashed ${jsonFile ? SUCCESS_BORDER : INPUT_BORDER}`,
                  }}
                >
                  {jsonFile ? (
                    <>
                      <Check className="h-6 w-6 mb-2" style={{ color: SUCCESS_TEXT }} />
                      <div className="text-xs" style={{ color: SUCCESS_TEXT, fontFamily: FONT }}>
                        File loaded
                      </div>
                      <div className="text-[10px] mt-1" style={{ color: WHITE_03, fontFamily: FONT }}>
                        {jsonFileName}
                      </div>
                    </>
                  ) : (
                    <>
                      <Upload className="h-6 w-6 mb-2" style={{ color: BLUE_04 }} />
                      <div className="text-xs" style={{ color: WHITE_04, fontFamily: FONT }}>
                        Click to upload keystore JSON
                      </div>
                    </>
                  )}
                </button>
              </div>
              <div>
                <SectionLabel>PASSWORD</SectionLabel>
                <PasswordInput
                  value={jsonPassword}
                  onChange={setJsonPassword}
                  placeholder="Keystore password"
                />
              </div>
              {error && <ErrorBanner message={error} />}
              <div className="flex gap-2 pt-1">
                <ActionButton onClick={() => goTo('restore-options')} variant="secondary">
                  Back
                </ActionButton>
                <ActionButton
                  onClick={handleRestoreJson}
                  loading={isLoading}
                  disabled={!jsonFile || !jsonPassword}
                >
                  Restore
                </ActionButton>
              </div>
            </div>
          )}

          {/* ========== RESTORE DRIVE PICKER VIEW ========== */}
          {view === 'restore-drive-picker' && (
            <div className="space-y-4">
              {error && <ErrorBanner message={error} />}
              <WalletListPicker
                onSelect={handleDriveSelect}
                onError={(msg) => setError(msg)}
              />
              {isLoading && (
                <div className="flex items-center justify-center gap-2 py-2">
                  <div
                    className="w-4 h-4 border-2 rounded-full animate-spin"
                    style={{ borderColor: BLUE_08, borderTopColor: 'transparent' }}
                  />
                  <span className="text-xs" style={{ color: BLUE_05, fontFamily: FONT }}>
                    Loading wallet data...
                  </span>
                </div>
              )}
            </div>
          )}

          {/* ========== RESTORE DRIVE UNLOCK VIEW ========== */}
          {view === 'restore-drive-unlock' && (
            <div className="space-y-4">
              {/* Selected wallet info */}
              {selectedDriveWallet && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{ background: 'rgba(91,156,255,0.04)', border: `1px solid ${BLUE_01}` }}
                >
                  <div className="text-sm" style={{ color: WHITE_085, fontFamily: FONT }}>
                    {selectedDriveWallet.walletLabel}
                  </div>
                  <div className="text-[10px] mt-1" style={{ color: WHITE_03, fontFamily: FONT }}>
                    Backed up {selectedDriveWallet.timestamp
                      ? new Date(selectedDriveWallet.timestamp).toLocaleDateString()
                      : 'unknown date'}
                  </div>
                </div>
              )}

              {/* Password hint */}
              {drivePasswordHint && (
                <div
                  className="rounded-xl px-4 py-3"
                  style={{
                    background: 'rgba(245,158,11,0.06)',
                    border: '1px solid rgba(245,158,11,0.15)',
                  }}
                >
                  <div
                    className="text-[9px] uppercase mb-1"
                    style={{ color: 'rgba(245,158,11,0.5)', fontFamily: FONT, letterSpacing: 2 }}
                  >
                    PASSWORD HINT
                  </div>
                  <div className="text-xs" style={{ color: 'rgba(245,158,11,0.8)', fontFamily: FONT }}>
                    {drivePasswordHint}
                  </div>
                </div>
              )}

              <div>
                <SectionLabel>PASSWORD</SectionLabel>
                <PasswordInput
                  value={drivePassword}
                  onChange={setDrivePassword}
                  placeholder="Enter your wallet password"
                  autoFocus
                />
              </div>
              {error && <ErrorBanner message={error} />}
              <div className="flex gap-2 pt-1">
                <ActionButton onClick={() => goTo('restore-drive-picker')} variant="secondary">
                  Back
                </ActionButton>
                <ActionButton
                  onClick={handleDriveUnlock}
                  loading={isLoading}
                  disabled={!drivePassword}
                >
                  Unlock
                </ActionButton>
              </div>
            </div>
          )}

          {/* ========== BROWSER EXTENSION VIEW ========== */}
          {view === 'browser-extension' && (
            <div className="space-y-4">
              {/* Connecting state */}
              {connectingWallet && (
                <div
                  className="flex items-center gap-3 rounded-xl p-4"
                  style={{ background: BLUE_006, border: `1px solid ${BLUE_015}` }}
                >
                  <div
                    className="w-5 h-5 border-2 rounded-full animate-spin"
                    style={{ borderColor: BLUE_08, borderTopColor: 'transparent' }}
                  />
                  <div style={{ fontSize: 12, fontFamily: FONT, color: BLUE_08 }}>
                    Connecting to {connectingWallet}... Check your wallet extension.
                  </div>
                </div>
              )}

              {/* Error */}
              {error && <ErrorBanner message={error} />}

              {/* Installed Wallets */}
              {installedWallets.length > 0 && (
                <div>
                  <div
                    className="mb-2"
                    style={{
                      fontSize: 9,
                      fontFamily: FONT,
                      color: BLUE_04,
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
                            border: `1px solid ${BLUE_01}`,
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
                            style={{ color: WHITE_085, fontFamily: FONT }}
                          >
                            {wallet.name}
                          </span>
                          {connectingWallet === wallet.name ? (
                            <div
                              className="w-4 h-4 border-2 rounded-full animate-spin"
                              style={{ borderColor: BLUE_08, borderTopColor: 'transparent' }}
                            />
                          ) : (
                            <ChevronRight className="h-4 w-4" style={{ color: BLUE_03 }} />
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
                      fontFamily: FONT,
                      color: WHITE_025,
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
                          style={{ color: WHITE_035, fontFamily: FONT }}
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
                  style={{ fontSize: 12, fontFamily: FONT, color: WHITE_03 }}
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
