/**
 * @file components/AssetsOverview.tsx
 * @description Visual overview of Subfrost native assets with ICO-era SVG graphics
 */
"use client"

import React from "react"
import { cn } from "@/lib/utils"

interface Asset {
  symbol: string
  name: string
  description: string
  icon: React.ReactNode
  color: string
  badge?: string
}

const FrBTCIcon = () => (
  <svg viewBox="0 0 120 120" className="w-full h-full">
    <defs>
      <linearGradient id="frbtcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#f59e0b", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#d97706", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="frbtcGlow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <circle cx="60" cy="60" r="45" fill="url(#frbtcGrad)" filter="url(#frbtcGlow)" opacity="0.9">
      <animate attributeName="r" values="45;48;45" dur="3s" repeatCount="indefinite" />
    </circle>
    <text x="60" y="72" textAnchor="middle" fontSize="36" fontWeight="bold" fill="white">₿</text>
    <circle cx="60" cy="60" r="50" fill="none" stroke="#fbbf24" strokeWidth="2" strokeDasharray="5,5" opacity="0.6">
      <animateTransform attributeName="transform" type="rotate" from="0 60 60" to="360 60 60" dur="20s" repeatCount="indefinite" />
    </circle>
  </svg>
)

const FrZECIcon = () => (
  <svg viewBox="0 0 120 120" className="w-full h-full">
    <defs>
      <linearGradient id="frzecGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#8b5cf6", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#6d28d9", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="frzecGlow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <circle cx="60" cy="60" r="45" fill="url(#frzecGrad)" filter="url(#frzecGlow)" opacity="0.9">
      <animate attributeName="r" values="45;48;45" dur="3s" repeatCount="indefinite" begin="1s" />
    </circle>
    <text x="60" y="72" textAnchor="middle" fontSize="36" fontWeight="bold" fill="white">Z</text>
    {/* Shield icon for privacy */}
    <path d="M 35 30 L 60 20 L 85 30 L 85 55 Q 85 75, 60 90 Q 35 75, 35 55 Z" 
          fill="none" stroke="white" strokeWidth="2" opacity="0.5">
      <animate attributeName="opacity" values="0.3;0.7;0.3" dur="2s" repeatCount="indefinite" />
    </path>
  </svg>
)

const FrETHIcon = () => (
  <svg viewBox="0 0 120 120" className="w-full h-full">
    <defs>
      <linearGradient id="frethGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#3b82f6", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#1d4ed8", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="frethGlow">
        <feGaussianBlur stdDeviation="3" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    <circle cx="60" cy="60" r="45" fill="url(#frethGrad)" filter="url(#frethGlow)" opacity="0.9">
      <animate attributeName="r" values="45;48;45" dur="3s" repeatCount="indefinite" begin="2s" />
    </circle>
    {/* Simplified ETH diamond */}
    <path d="M 60 35 L 75 60 L 60 70 L 45 60 Z" fill="white" opacity="0.9" />
    <path d="M 60 70 L 75 60 L 60 85 Z" fill="white" opacity="0.6" />
    <path d="M 60 70 L 45 60 L 60 85 Z" fill="white" opacity="0.4" />
  </svg>
)

const assets: Asset[] = [
  {
    symbol: "frBTC",
    name: "Liquid Bitcoin",
    description: "Wrapped BTC for seamless DeFi. Auto-wrapping on swaps.",
    icon: <FrBTCIcon />,
    color: "from-amber-500 to-orange-600",
    badge: "Most Popular"
  },
  {
    symbol: "frZEC",
    name: "Privacy Layer",
    description: "Zcash privacy features on Bitcoin for confidential swaps.",
    icon: <FrZECIcon />,
    color: "from-purple-500 to-purple-700"
  },
  {
    symbol: "frETH",
    name: "ETH Exposure",
    description: "Ethereum access directly within Bitcoin DeFi.",
    icon: <FrETHIcon />,
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
