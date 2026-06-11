import type { Metadata } from "next"
import "./globals.css"

export const metadata: Metadata = {
  title: {
    default: "SUBFROST News",
    template: "%s — SUBFROST News",
  },
  description:
    "News, research, and updates from SUBFROST — Bitcoin-native yield, frBTC, and the Alkanes ecosystem.",
  metadataBase: new URL("https://news.subfrost.io"),
  openGraph: {
    siteName: "SUBFROST News",
    type: "website",
  },
}

export default function RootLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return (
    <html lang="en" className="dark">
      <body>{children}</body>
    </html>
  )
}
