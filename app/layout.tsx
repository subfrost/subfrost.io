import type React from "react"
import type { Metadata, Viewport } from "next"
import Script from "next/script"
import { cn } from "@/lib/utils"
import "@/app/globals.css"
import { LanguageProvider } from "@/context/LanguageContext"

export const metadata: Metadata = {
  metadataBase: new URL('https://subfrost.io'),
  title: "SUBFROST | Bitcoin-native Layer 0",
  description: "SUBFROST is the Bitcoin-native Layer 0 unlocking seamless DeFi experiences. Trade native assets, access yield products, and bridge any EVM or UTXO asset directly to Bitcoin L1.",
  alternates: {
    canonical: "https://subfrost.io",
  },
  keywords: [
    "SUBFROST",
    "Bitcoin DeFi",
    "Bitcoin native yield",
    "frBTC",
    "Bitcoin Layer 0",
    "Alkanes",
    "self-custodial Bitcoin wallet",
  ],
  robots: {
    index: true,
    follow: true,
    googleBot: {
      index: true,
      follow: true,
      "max-image-preview": "large",
      "max-snippet": -1,
      "max-video-preview": -1,
    },
  },
  openGraph: {
    title: "SUBFROST | Bitcoin-native Layer 0",
    description: "SUBFROST is the Bitcoin-native Layer 0 unlocking seamless DeFi experiences. Trade native assets, access yield products, and bridge any EVM or UTXO asset directly to Bitcoin L1.",
    type: "website",
    url: "https://subfrost.io",
    siteName: "SUBFROST",
    images: [{ url: '/Logo.png', alt: "SUBFROST - Bitcoin's Next-Gen DeFi Experience" }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SUBFROST | Bitcoin-native Layer 0",
    description: "SUBFROST is the Bitcoin-native Layer 0 unlocking seamless DeFi experiences. Trade native assets, access yield products, and bridge any EVM or UTXO asset directly to Bitcoin L1.",
    images: ['/Logo.png'],
  },
  icons: {
    icon: '/brand/subfrost/Logos/svg/logomark/logomark.svg',
    shortcut: '/brand/subfrost/Logos/svg/logomark/logomark.svg',
    apple: '/brand/subfrost/Logos/pfp/pfp_light.png',
  },
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en">
      <head>
        <Script src="https://www.googletagmanager.com/gtag/js?id=G-0RV3B8BK4B" strategy="afterInteractive" />
        <Script id="google-analytics" strategy="afterInteractive">
          {`
            window.dataLayer = window.dataLayer || [];
            function gtag(){dataLayer.push(arguments);}
            gtag('js', new Date());

            gtag('config', 'G-0RV3B8BK4B');
          `}
        </Script>
      </head>
      <body className={cn("bg-background font-satoshi antialiased")}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
