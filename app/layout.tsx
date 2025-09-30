import type React from "react"
import type { Metadata } from "next"
import Script from "next/script"
import { cn } from "@/lib/utils"
import "@/app/globals.css"

export const metadata: Metadata = {
  title: "SUBFROST",
  description: "Interoperable BTC synthetics on Bitcoin L1. Use BTCfi with frBTC. Earn yield by staking BTC to dxBTC.",

    generator: 'v0.dev',
    openGraph: {
        images: ['/Logo.png'],
    },
    icons: {
        icon: '/Logo.png',
    },
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
      <body className={cn("bg-background font-satoshi antialiased")}>{children}</body>
    </html>
  )
}
