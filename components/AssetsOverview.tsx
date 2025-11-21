/**
 * @file components/AssetsOverview.tsx
 * @description Visual overview of Subfrost native assets with ICO-era SVG graphics
 */
"use client"

import React from "react"
import { cn } from "@/lib/utils"
import Image from "next/image"

interface Asset {
  symbol: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
  badge?: string
}

const assets: Asset[] = [
  {
    symbol: "frBTC",
    name: "The BTC Synthetic",
    description: "Wrapped BTC for seamless DeFi. Auto-wrapping on swaps.",
    icon: <Image src="/btc_snowflake.svg" alt="frBTC Icon" width={100} height={100} />,
    color: "from-amber-500 to-orange-600",
    badge: "Most Popular"
  },
  {
    symbol: "frZEC",
    name: "Zcash properties, but on Bitcoin",
    description: "Brining ZEC to markets on Bitcoin.",
    icon: <Image src="/zec_snowflake.svg" alt="frZEC Icon" width={100} height={100} />,
    color: "from-purple-500 to-purple-700"
  },
  {
    symbol: "frETH",
    name: "ETH Exposure",
    description: "Ethereum access directly within Bitcoin DeFi.",
    icon: <Image src="/eth_snowflake.svg" alt="frETH Icon" width={100} height={100} />,
    color: "from-blue-500 to-blue-700"
  }
]

export default function AssetsOverview() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter mb-4">
          NATIVE ASSETS
        </h3>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          A new class of assets moving seamlessly across all Bitcoin metaprotocols and L2s
        </p>
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-6 max-w-6xl mx-auto">
        {assets.map((asset, index) => (
          <div
            key={index}
            className={cn(
              "group relative rounded-2xl p-6 transition-all duration-500",
              "bg-gradient-to-br from-slate-800/40 to-slate-900/40",
              "border border-slate-700/50 hover:border-slate-500/70",
              "backdrop-blur-sm",
              "hover:scale-105 hover:shadow-2xl hover:shadow-blue-500/10"
            )}
          >
            {/* Badge */}
            {asset.badge && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-xs font-bold text-white shadow-lg">
                {asset.badge}
              </div>
            )}

            {/* Animated border glow */}
            <div className={cn(
              "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500",
              "bg-gradient-to-br",
              asset.color,
              "blur-xl -z-10"
            )} />

            {/* Icon */}
            <div className="w-28 h-28 mx-auto mb-4">
              {asset.icon}
            </div>

            {/* Symbol */}
            <h4 className="text-2xl font-bold text-center mb-2 bg-gradient-to-r bg-clip-text text-transparent"
                style={{
                  backgroundImage: `linear-gradient(to right, var(--tw-gradient-stops))`,
                  backgroundClip: 'text',
                  WebkitBackgroundClip: 'text',
                  WebkitTextFillColor: 'transparent'
                }}>
              <span className={cn("bg-gradient-to-r", asset.color, "bg-clip-text")}>{asset.symbol}</span>
            </h4>

            {/* Name */}
            <p className="text-sm text-gray-400 text-center font-semibold mb-3">
              {asset.name}
            </p>

            {/* Description */}
            <p className="text-sm text-gray-300 text-center leading-relaxed">
              {asset.description}
            </p>

            {/* Corner accent */}
            <div className="absolute top-2 right-2 w-6 h-6 border-t-2 border-r-2 border-blue-400/30 rounded-tr-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-2 left-2 w-6 h-6 border-b-2 border-l-2 border-purple-400/30 rounded-bl-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))}
      </div>

      {/* Compatibility badge */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-3 px-6 py-3 rounded-full bg-gradient-to-r from-blue-500/10 to-purple-500/10 border border-blue-400/30">
          <div className="w-2 h-2 rounded-full bg-green-400 animate-pulse" />
          <span className="text-sm font-semibold text-gray-300">
            Compatible with all Bitcoin metaprotocols & L2s
          </span>
        </div>
      </div>
    </div>
  )
}
