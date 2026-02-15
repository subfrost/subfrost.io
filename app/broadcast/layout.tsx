import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Broadcast - SUBFROST",
}

export default function BroadcastLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
