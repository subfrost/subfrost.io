import type React from "react"
import type { Metadata, Viewport } from "next"
import Script from "next/script"
import { cookies } from "next/headers"
import { cn } from "@/lib/utils"
import "@/app/globals.css"
import { LanguageProvider } from "@/context/LanguageContext"
import { LOCALE_COOKIE } from "@/lib/i18n/cookie"
import { htmlLang, type Locale } from "@/lib/i18n/detect"

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
    icon: [
      { url: '/brand/subfrost/Logos/svg/logomark/logomark.svg', type: 'image/svg+xml' },
      { url: '/brand/subfrost/Logos/favicon/logomark-32.png', sizes: '32x32', type: 'image/png' },
      { url: '/brand/subfrost/Logos/favicon/logomark-48.png', sizes: '48x48', type: 'image/png' },
    ],
    shortcut: '/brand/subfrost/Logos/favicon/logomark-32.png',
    apple: [
      { url: '/brand/subfrost/Logos/favicon/logomark-180.png', sizes: '180x180', type: 'image/png' },
    ],
  },
}

export const viewport: Viewport = {
  colorScheme: "light dark",
  themeColor: [
    { media: "(prefers-color-scheme: light)", color: "#ffffff" },
    { media: "(prefers-color-scheme: dark)", color: "#000000" },
  ],
}

export default async function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  const cookieStore = await cookies()
  const raw = cookieStore.get(LOCALE_COOKIE)?.value
  const initialLocale: Locale = raw === "zh" ? "zh" : "en"

  return (
    <html lang={htmlLang(initialLocale)}>
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
        <LanguageProvider initialLocale={initialLocale}>{children}</LanguageProvider>
      </body>
    </html>
  )
}
