'use client';

import Script from 'next/script';
import { WalletProvider } from '@/context/WalletContext';

export default function ConferenceLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <WalletProvider>
      {/* Google API scripts for Drive backup/restore */}
      <Script src="https://apis.google.com/js/api.js" strategy="lazyOnload" />
      <Script src="https://accounts.google.com/gsi/client" strategy="lazyOnload" />
      {children}
    </WalletProvider>
  );
}
