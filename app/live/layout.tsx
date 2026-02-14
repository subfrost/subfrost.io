import type React from "react"
import type { Metadata } from "next"

export const metadata: Metadata = {
  title: "Live - SUBFROST",
}

export default function LiveLayout({
  children,
}: {
  children: React.ReactNode
}) {
  return children
}
