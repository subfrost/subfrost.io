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
  icon: string
  hoverIcon?: string
  color: string
  badge?: string
}

const assets: Asset[] = [
  {
    symbol: "frBTC",
    name: "The BTC Synthetic",
    description: "Enabling the seamless use of native BTC in dApps, completely abstracting away the wrap process.",
    icon: "/btc_snowflake.svg",
    color: "from-amber-500 to-orange-600",
    badge: "Live!"
  },
  {
    symbol: "frUSD",
    name: "Stablecoin Utilization on Bitcoin",
    description: "The most capital-efficient bridge from USDT/USDC to Bitcoin.",
    icon: "/usdt_empty.svg",
    hoverIcon: "/usdt_snowflake.svg",
    color: "from-green-500 to-green-700"
  },
  {
    symbol: "frZEC",
    name: "Zcash Properties on Bitcoin",
    description: "Bringing ZEC to/from markets on Bitcoin.",
    icon: "/zec_empty.svg",
    hoverIcon: "/zec_snowflake.svg",
    color: "from-yellow-500 to-yellow-700"
  },
  {
    symbol: "frETH",
    name: "ETH Exposure on Bitcoin",
    description: "Ethereum access directly within Bitcoin DeFi.",
    icon: "/eth_empty.svg",
    hoverIcon: "/eth_snowflake.svg",
    color: "from-purple-500 to-purple-700"
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
          A new class of assets moving seamlessly in, out, and across all Bitcoin metaprotocols and L2s.
        </p>
      </div>

      {/* Assets Grid */}
      <div className="grid grid-cols-1 md:grid-cols-4 gap-6 max-w-6xl mx-auto">
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
              "absolute inset-[-5px] rounded-2xl opacity-0 group-hover:opacity-100 transition-opacity duration-500",
              "bg-gradient-to-br",
              asset.color,
              "blur-md -z-10"
            )} />

            {/* Icon */}
            <div className="w-28 h-28 mx-auto mb-4 flex items-center justify-center relative">
              <Image 
                src={asset.icon} 
                alt={`${asset.symbol} Icon`} 
                width={100} 
                height={100}
                className={cn(
                  "transition-opacity duration-300",
                  asset.hoverIcon && "group-hover:opacity-0"
                )}
              />
              {asset.hoverIcon && (
                <Image 
                  src={asset.hoverIcon} 
                  alt={`${asset.symbol} Icon Hover`} 
                  width={100} 
                  height={100}
                  className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 transition-opacity duration-300"
                />
              )}
            </div>

            {/* Symbol */}
            <h4 className="text-2xl font-bold text-center mb-2">
              <span className={cn(
                "bg-gradient-to-r bg-clip-text text-transparent group-hover:text-white group-hover:bg-none transition-all duration-300 delay-[50ms]",
                asset.color
              )}>{asset.symbol}</span>
            </h4>

            {/* Name */}
            <p className="text-sm text-gray-400 text-center font-semibold mb-3 group-hover:text-white transition-colors duration-300 delay-[50ms]">
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
    </div>
  )
}
