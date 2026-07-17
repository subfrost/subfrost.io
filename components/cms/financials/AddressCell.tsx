"use client"

import { useState } from "react"
import { Check, Copy, ExternalLink } from "lucide-react"
import { explorerAddrUrl, type ExplorerChain } from "@/lib/explorers"

/** Detect the explorer chain for an address by prefix.
 *  bc1… / 1… / 3… → bitcoin (mempool.space); 0x… → bsc (bscscan). */
export function chainForAddress(address: string): ExplorerChain {
  const a = address.trim()
  if (a.startsWith("0x")) return "bsc"
  if (/^(bc1|[13])/.test(a)) return "bitcoin"
  return "bsc"
}

/** Middle-ellipsis so an address always fits its cell on a 390px screen. */
export function middleEllipsis(s: string, head = 6, tail = 4): string {
  if (s.length <= head + tail + 1) return s
  return `${s.slice(0, head)}…${s.slice(-tail)}`
}

/** A single-line address display that never blows out the row width: a
 *  middle-ellipsised mono label, a copy-to-clipboard button, and an explorer
 *  deep-link (bscscan for EVM/0x, mempool.space for BTC). */
export function AddressCell({
  address,
  label,
  className = "",
}: {
  address: string
  /** Optional human label shown instead of the raw hex (address still copied/linked). */
  label?: string | null
  className?: string
}) {
  const [copied, setCopied] = useState(false)
  const chain = chainForAddress(address)

  async function copy() {
    try {
      await navigator.clipboard.writeText(address)
      setCopied(true)
      setTimeout(() => setCopied(false), 1200)
    } catch {
      /* clipboard unavailable — no-op */
    }
  }

  return (
    <span className={`inline-flex min-w-0 max-w-full items-center gap-1.5 ${className}`}>
      <span
        className="truncate font-mono text-xs text-zinc-400"
        title={address}
      >
        {label ?? middleEllipsis(address)}
      </span>
      <button
        type="button"
        onClick={copy}
        title={copied ? "Copied" : "Copy address"}
        aria-label={copied ? "Copied" : "Copy address"}
        className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-zinc-200"
      >
        {copied ? <Check className="h-3.5 w-3.5 text-emerald-400" /> : <Copy className="h-3.5 w-3.5" />}
      </button>
      <a
        href={explorerAddrUrl(chain, address)}
        target="_blank"
        rel="noreferrer"
        title={chain === "bitcoin" ? "View on mempool.space" : "View on bscscan"}
        aria-label="View on explorer"
        className="shrink-0 rounded p-0.5 text-zinc-500 hover:bg-zinc-800 hover:text-sky-400"
      >
        <ExternalLink className="h-3.5 w-3.5" />
      </a>
    </span>
  )
}
