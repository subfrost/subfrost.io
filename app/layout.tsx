import type React from "react"
import type { Metadata } from "next"
import Script from "next/script"
import { cn } from "@/lib/utils"
import "@/app/globals.css"
import { LanguageProvider } from "@/context/LanguageContext"

export const metadata: Metadata = {
  metadataBase: new URL('https://app.subfrost.io'),
  title: "SUBFROST App | Next-gen DeFi on Bitcoin",
  description: "The app built for seamless Bitcoin DeFi.",
  openGraph: {
    title: "SUBFROST App | Next-gen DeFi on Bitcoin",
    description: "The app built for seamless Bitcoin DeFi.",
    type: "website",
    url: "https://app.subfrost.io",
    siteName: "SUBFROST",
    images: [{ url: '/Logo.png', width: 1200, height: 630, alt: 'SUBFROST' }],
  },
  twitter: {
    card: "summary_large_image",
    title: "SUBFROST App | Next-gen DeFi on Bitcoin",
    description: "The app built for seamless Bitcoin DeFi.",
    images: ['/Logo.png'],
  },
  icons: {
    icon: '/Logo.png',
    apple: '/Logo.png',
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
      <body className={cn("bg-background font-satoshi antialiased")}>
        <LanguageProvider>{children}</LanguageProvider>
      </body>
    </html>
  )
}
