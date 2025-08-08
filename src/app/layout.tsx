import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});

export const metadata: Metadata = {
  title: "SUBFROST | BTCfi BTC Staking, Bitcoin Yield, and DeFi",
  description:
    "Unlock the future of decentralized finance with SUBFROST. We offer cutting-edge BTCfi solutions, including secure BTC staking, high-yield Bitcoin opportunities, and innovative DeFi products. Explore BRC2.0 and taproot metaprotocols for maximum returns.",
  keywords: [
    "SUBFROST",
    "BTCfi",
    "BTC staking",
    "Bitcoin yield",
    "DeFi",
    "BRC2.0",
    "taproot",
    "metaprotocols",
    "Bitcoin finance",
    "decentralized finance",
    "crypto yield",
    "BTC synthetics",
    "dxBTC",
  ],
  openGraph: {
    title: "SUBFROST | BTCfi BTC Staking, Bitcoin Yield, and DeFi",
    description:
      "Unlock the future of decentralized finance with SUBFROST. We offer cutting-edge BTCfi solutions, including secure BTC staking, high-yield Bitcoin opportunities, and innovative DeFi products. Explore BRC2.0 and taproot metaprotocols for maximum returns.",
    type: "website",
    url: "https://subfrost.io",
    images: [
      {
        url: "/og-image.png",
        width: 1200,
        height: 630,
        alt: "SUBFROST - BTCfi, BTC Staking, and Bitcoin Yield",
      },
    ],
  },
  twitter: {
    card: "summary_large_image",
    title: "SUBFROST | BTCfi BTC Staking, Bitcoin Yield, and DeFi",
    description:
      "Unlock the future of decentralized finance with SUBFROST. We offer cutting-edge BTCfi solutions, including secure BTC staking, high-yield Bitcoin opportunities, and innovative DeFi products. Explore BRC2.0 and taproot metaprotocols for maximum returns.",
    images: ["/og-image.png"],
  },
};

export default function RootLayout({
  children,
}: Readonly<{
  children: React.ReactNode;
}>) {
  return (
    <html lang="en">
      <body
        className={`${geistSans.variable} ${geistMono.variable} antialiased`}
      >
        {children}
      </body>
    </html>
  );
}
