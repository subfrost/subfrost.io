/**
 * @file components/VaultsOverview.tsx
 * @description Visual overview of Subfrost yield vaults and futures with ICO-era SVG graphics
 */
"use client"

import React from "react"
import { cn } from "@/lib/utils"

const DxBTCIcon = () => (
  <svg viewBox="0 0 140 140" className="w-full h-full">
    <defs>
      <linearGradient id="dxbtcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#10b981", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#047857", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="dxbtcGlow">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    {/* Outer pulsing circle */}
    <circle cx="70" cy="70" r="60" fill="none" stroke="url(#dxbtcGrad)" strokeWidth="2" opacity="0.3">
      <animate attributeName="r" values="60;65;60" dur="3s" repeatCount="indefinite" />
      <animate attributeName="opacity" values="0.3;0.6;0.3" dur="3s" repeatCount="indefinite" />
    </circle>
    
    {/* Main vault */}
    <rect x="40" y="45" width="60" height="50" rx="8" fill="url(#dxbtcGrad)" filter="url(#dxbtcGlow)" opacity="0.95">
      <animate attributeName="height" values="50;52;50" dur="2s" repeatCount="indefinite" />
    </rect>
    
    {/* Vault lock */}
    <circle cx="70" cy="70" r="12" fill="none" stroke="white" strokeWidth="2" opacity="0.9" />
    <circle cx="70" cy="70" r="8" fill="none" stroke="white" strokeWidth="1.5" opacity="0.9" />
    <circle cx="73" cy="70" r="2" fill="white" opacity="0.9" />
    
    {/* Yield arrows pointing up */}
    <g opacity="0.8">
      <path d="M 25 70 L 25 55 L 20 60 M 25 55 L 30 60" stroke="#fbbf24" strokeWidth="3" fill="none" strokeLinecap="round">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
      </path>
      <path d="M 115 70 L 115 55 L 110 60 M 115 55 L 120 60" stroke="#fbbf24" strokeWidth="3" fill="none" strokeLinecap="round">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin="0.75s" />
      </path>
    </g>
    
    {/* One-click indicator */}
    <circle cx="70" cy="20" r="15" fill="none" stroke="#34d399" strokeWidth="2" opacity="0.6">
      <animate attributeName="r" values="15;18;15" dur="2s" repeatCount="indefinite" />
    </circle>
    <text x="70" y="25" textAnchor="middle" fontSize="12" fontWeight="bold" fill="#34d399">1TX</text>
  </svg>
)

const YvFrBTCIcon = () => (
  <svg viewBox="0 0 140 140" className="w-full h-full">
    <defs>
      <linearGradient id="yvbtcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#3b82f6", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#1d4ed8", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="yvbtcGlow">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    {/* Central aggregator pool */}
    <rect x="45" y="50" width="50" height="45" rx="8" fill="url(#yvbtcGrad)" filter="url(#yvbtcGlow)" opacity="0.9" />
    
    {/* Pool liquid level with animation */}
    <rect x="50" y="70" width="40" height="20" fill="#60a5fa" opacity="0.5">
      <animate attributeName="height" values="20;25;20" dur="3s" repeatCount="indefinite" />
      <animate attributeName="y" values="70;65;70" dur="3s" repeatCount="indefinite" />
    </rect>
    
    {/* Income streams flowing in */}
    <g>
      {/* Left stream */}
      <circle cx="20" cy="30" r="6" fill="#60a5fa" opacity="0.8">
        <animate attributeName="cy" values="30;60" dur="2s" repeatCount="indefinite" />
        <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" />
      </circle>
      
      {/* Top stream */}
      <circle cx="70" cy="15" r="6" fill="#60a5fa" opacity="0.8">
        <animate attributeName="cy" values="15;50" dur="2s" repeatCount="indefinite" begin="0.7s" />
        <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" begin="0.7s" />
      </circle>
      
      {/* Right stream */}
      <circle cx="120" cy="30" r="6" fill="#60a5fa" opacity="0.8">
        <animate attributeName="cy" values="30;60" dur="2s" repeatCount="indefinite" begin="1.4s" />
        <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" begin="1.4s" />
      </circle>
    </g>
    
    {/* Rewards flowing out */}
    <circle cx="70" cy="110" r="8" fill="#fbbf24" filter="url(#yvbtcGlow)">
      <animate attributeName="r" values="8;11;8" dur="2s" repeatCount="indefinite" />
    </circle>
    <path d="M 70 95 L 70 110" stroke="#fbbf24" strokeWidth="3" strokeDasharray="3,3" opacity="0.6">
      <animate attributeName="stroke-dashoffset" values="0;6" dur="0.5s" repeatCount="indefinite" />
    </path>
    
    {/* Labels */}
    <text x="30" y="25" fontSize="10" fill="#9ca3af">fees</text>
    <text x="60" y="10" fontSize="10" fill="#9ca3af">LP</text>
    <text x="105" y="25" fontSize="10" fill="#9ca3af">volume</text>
  </svg>
)

const FtrBTCIcon = () => (
  <svg viewBox="0 0 140 140" className="w-full h-full">
    <defs>
      <linearGradient id="ftrbtcGrad" x1="0%" y1="0%" x2="100%" y2="100%">
        <stop offset="0%" style={{ stopColor: "#a78bfa", stopOpacity: 1 }} />
        <stop offset="100%" style={{ stopColor: "#7c3aed", stopOpacity: 1 }} />
      </linearGradient>
      <filter id="ftrbtcGlow">
        <feGaussianBlur stdDeviation="4" result="coloredBlur"/>
        <feMerge>
          <feMergeNode in="coloredBlur"/>
          <feMergeNode in="SourceGraphic"/>
        </feMerge>
      </filter>
    </defs>
    
    {/* Clock/futures indicator */}
    <circle cx="70" cy="70" r="45" fill="url(#ftrbtcGrad)" filter="url(#ftrbtcGlow)" opacity="0.9">
      <animate attributeName="r" values="45;48;45" dur="3s" repeatCount="indefinite" />
    </circle>
    
    {/* Clock marks */}
    <line x1="70" y1="30" x2="70" y2="35" stroke="white" strokeWidth="2" opacity="0.6" />
    <line x1="70" y1="105" x2="70" y2="110" stroke="white" strokeWidth="2" opacity="0.6" />
    <line x1="25" y1="70" x2="30" y2="70" stroke="white" strokeWidth="2" opacity="0.6" />
    <line x1="110" y1="70" x2="115" y2="70" stroke="white" strokeWidth="2" opacity="0.6" />
    
    {/* Clock hands */}
    <line x1="70" y1="70" x2="70" y2="45" stroke="white" strokeWidth="3" strokeLinecap="round" opacity="0.9">
      <animateTransform attributeName="transform" type="rotate" from="0 70 70" to="360 70 70" dur="10s" repeatCount="indefinite" />
    </line>
    <line x1="70" y1="70" x2="85" y2="70" stroke="white" strokeWidth="2" strokeLinecap="round" opacity="0.9">
      <animateTransform attributeName="transform" type="rotate" from="0 70 70" to="360 70 70" dur="60s" repeatCount="indefinite" />
    </line>
    
    {/* Center dot */}
    <circle cx="70" cy="70" r="4" fill="white" opacity="0.9" />
    
    {/* Mining blocks indicator */}
    <g opacity="0.7">
      <rect x="10" y="10" width="15" height="15" rx="2" fill="none" stroke="#a78bfa" strokeWidth="2">
        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="2s" repeatCount="indefinite" />
      </rect>
      <text x="17" y="22" textAnchor="middle" fontSize="10" fill="#a78bfa" fontWeight="bold">₿</text>
    </g>
    
    <text x="70" y="130" textAnchor="middle" fontSize="11" fill="#c4b5fd">Block Rewards</text>
  </svg>
)

interface VaultProduct {
  symbol: string
  name: string
  tagline: string
  description: string
  icon: React.ReactNode
  color: string
  badge?: string
}

const products: VaultProduct[] = [
  {
    symbol: "dxBTC",
    name: "One-Click Yield",
    tagline: "The Ultimate Strategy",
    description: "Stake BTC, receive dxBTC. Auto-deployed into yield strategies. Unstake anytime with accumulated yield.",
    icon: <DxBTCIcon />,
    color: "from-emerald-500 to-emerald-700",
    badge: "Most Popular"
  },
  {
    symbol: "yvfrBTC",
    name: "Yield Aggregator",
    tagline: "Classic Vault Strategy",
    description: "Earn fees and capture incentives from deep liquidity pools across BTC/ZEC/ETH/USD markets.",
    icon: <YvFrBTCIcon />,
    color: "from-blue-500 to-blue-700"
  },
  {
    symbol: "ftrBTC",
    name: "Futures Market",
    tagline: "Mining Pool Innovation",
    description: "Block reward futures. Miners hedge lock times, users capture premiums from mining partnerships.",
    icon: <FtrBTCIcon />,
    color: "from-purple-500 to-purple-700",
    badge: "Unique Moat"
  }
]

export default function VaultsOverview() {
  return (
    <div className="space-y-12">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter mb-4">
          YIELD PRODUCTS
        </h3>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Automated vaults and futures delivering yield on native Bitcoin
        </p>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {products.map((product, index) => (
          <div
            key={index}
            className={cn(
              "group relative rounded-2xl p-8 transition-all duration-500",
              "bg-gradient-to-br from-slate-800/50 to-slate-900/50",
              "border-2 border-slate-700/50 hover:border-slate-500/70",
              "backdrop-blur-sm",
              "hover:scale-105 hover:shadow-2xl"
            )}
          >
            {/* Badge */}
            {product.badge && (
              <div className="absolute -top-3 left-1/2 transform -translate-x-1/2 px-4 py-1 rounded-full bg-gradient-to-r from-amber-500 to-orange-500 text-xs font-bold text-white shadow-lg">
                {product.badge}
              </div>
            )}

            {/* Animated glow background */}
            <div className={cn(
              "absolute inset-0 rounded-2xl opacity-0 group-hover:opacity-20 transition-opacity duration-500",
              "bg-gradient-to-br",
              product.color,
              "blur-2xl"
            )} />

            {/* Icon */}
            <div className="w-32 h-32 mx-auto mb-6">
              {product.icon}
            </div>

            {/* Symbol */}
            <h4 className="text-3xl font-bold text-center mb-2">
              <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", product.color)}>
                {product.symbol}
              </span>
            </h4>

            {/* Name */}
            <p className="text-base text-white text-center font-semibold mb-1">
              {product.name}
            </p>

            {/* Tagline */}
            <p className="text-sm text-gray-400 text-center italic mb-4">
              {product.tagline}
            </p>

            {/* Description */}
            <p className="text-sm text-gray-300 text-center leading-relaxed">
              {product.description}
            </p>

            {/* Corner accents */}
            <div className="absolute top-3 left-3 w-8 h-8 border-t-2 border-l-2 border-blue-400/40 rounded-tl-xl opacity-0 group-hover:opacity-100 transition-opacity" />
            <div className="absolute bottom-3 right-3 w-8 h-8 border-b-2 border-r-2 border-purple-400/40 rounded-br-xl opacity-0 group-hover:opacity-100 transition-opacity" />
          </div>
        ))}
      </div>

      {/* Call to action */}
      <div className="flex justify-center">
        <div className="inline-flex items-center gap-3 px-8 py-4 rounded-full bg-gradient-to-r from-emerald-500/20 to-blue-500/20 border-2 border-emerald-400/40 hover:border-emerald-400/70 transition-all duration-300 cursor-pointer group">
          <span className="text-base font-bold text-white">
            All yield in native BTC — No token dependencies
          </span>
          <div className="w-3 h-3 rounded-full bg-emerald-400 group-hover:animate-pulse" />
        </div>
      </div>
    </div>
  )
}
