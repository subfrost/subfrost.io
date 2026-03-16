'use client';

import { WalletProvider } from '@/context/WalletContext';

export default function ConferenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return <WalletProvider>{children}</WalletProvider>;
}
