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
    
    {/* Outer non-pulsing circle */}
    <circle cx="70" cy="70" r="45" fill="none" stroke="url(#dxbtcGrad)" strokeWidth="2" opacity="0.3" />
    
    {/* Main vault replaced with pulsating % */}
    <text x="70" y="90" textAnchor="middle" fontSize="50" fontWeight="bold" fill="url(#dxbtcGrad)">
      %
      <animate attributeName="opacity" values="0.7;1;0.7" dur="2s" repeatCount="indefinite" />
      <animate attributeName="font-size" values="50;54;50" dur="2s" repeatCount="indefinite" />
    </text>
    
    {/* Gold pulsating arrows pointing up below the circle */}
    <g opacity="0.8">
      {/* Left arrow */}
      <path d="M 55 140 L 55 125 L 50 130 M 55 125 L 60 130" stroke="#fbbf24" strokeWidth="3" fill="none" strokeLinecap="round">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" />
      </path>
      {/* Center arrow */}
      <path d="M 70 140 L 70 125 L 65 130 M 70 125 L 75 130" stroke="#fbbf24" strokeWidth="3" fill="none" strokeLinecap="round">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin="0.2s" />
      </path>
      {/* Right arrow */}
      <path d="M 85 140 L 85 125 L 80 130 M 85 125 L 90 130" stroke="#fbbf24" strokeWidth="3" fill="none" strokeLinecap="round">
        <animate attributeName="opacity" values="0.5;1;0.5" dur="1.5s" repeatCount="indefinite" begin="0.4s" />
      </path>
    </g>
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
      <circle cx="70" cy="30" r="6" fill="#60a5fa" opacity="0.8">
        <animate attributeName="cy" values="30;60" dur="2s" repeatCount="indefinite" begin="0.7s" />
        <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" begin="0.7s" />
      </circle>
      
      {/* Right stream */}
      <circle cx="120" cy="30" r="6" fill="#60a5fa" opacity="0.8">
        <animate attributeName="cy" values="30;60" dur="2s" repeatCount="indefinite" begin="1.4s" />
        <animate attributeName="opacity" values="0.8;0" dur="2s" repeatCount="indefinite" begin="1.4s" />
      </circle>
    </g>
    
    {/* Rewards flowing out */}
    <circle cx="70" cy="120" r="8" fill="#fbbf24">
      <animate attributeName="r" values="8;11;8" dur="2s" repeatCount="indefinite" />
    </circle>
    <path d="M 70 95 L 70 120" stroke="#fbbf24" strokeWidth="3" strokeDasharray="3,3" opacity="0.6">
      <animate attributeName="stroke-dashoffset" values="0;6" dur="0.5s" repeatCount="indefinite" />
    </path>
    
    {/* Labels */}
    <text x="12" y="25" fontSize="10" fill="#9ca3af">fees</text>
    <text x="64" y="25" fontSize="10" fill="#9ca3af">LP</text>
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
    
    {/* Mining blocks indicator - source position */}
    <g opacity="0.7">
      <rect x="-20" y="62" width="15" height="15" rx="2" fill="none" stroke="#a78bfa" strokeWidth="2">
        <animate attributeName="opacity" values="0.3;0.9;0.3" dur="2s" repeatCount="indefinite" />
      </rect>
      <text x="-12" y="74" textAnchor="middle" fontSize="10" fill="#a78bfa" fontWeight="bold">₿</text>
    </g>
    
    {/* Animated B blocks flowing into clock */}
    <g opacity="0.8">
      {/* Block 1 */}
      <g>
        <rect x="-20" y="62" width="15" height="15" rx="2" fill="#a78bfa" fillOpacity="0.3" stroke="#a78bfa" strokeWidth="1.5">
          <animate attributeName="x" values="-20;15;50" dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.5;0" dur="2.5s" repeatCount="indefinite" />
        </rect>
        <text x="-12" y="74" textAnchor="middle" fontSize="10" fill="#a78bfa" fontWeight="bold">
          ₿
          <animate attributeName="x" values="-12;23;58" dur="2.5s" repeatCount="indefinite" />
          <animate attributeName="opacity" values="1;0.5;0" dur="2.5s" repeatCount="indefinite" />
        </text>
      </g>
      
      {/* Block 2 */}
      <g>
        <rect x="-20" y="62" width="15" height="15" rx="2" fill="#a78bfa" fillOpacity="0.3" stroke="#a78bfa" strokeWidth="1.5">
          <animate attributeName="x" values="-20;15;50" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
          <animate attributeName="opacity" values="1;0.5;0" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
        </rect>
        <text x="-12" y="74" textAnchor="middle" fontSize="10" fill="#a78bfa" fontWeight="bold">
          ₿
          <animate attributeName="x" values="-12;23;58" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
          <animate attributeName="opacity" values="1;0.5;0" dur="2.5s" repeatCount="indefinite" begin="0.8s" />
        </text>
      </g>
      
      {/* Block 3 */}
      <g>
        <rect x="-20" y="62" width="15" height="15" rx="2" fill="#a78bfa" fillOpacity="0.3" stroke="#a78bfa" strokeWidth="1.5">
          <animate attributeName="x" values="-20;15;50" dur="2.5s" repeatCount="indefinite" begin="1.6s" />
          <animate attributeName="opacity" values="1;0.5;0" dur="2.5s" repeatCount="indefinite" begin="1.6s" />
        </rect>
        <text x="-12" y="74" textAnchor="middle" fontSize="10" fill="#a78bfa" fontWeight="bold">
          ₿
          <animate attributeName="x" values="-12;23;58" dur="2.5s" repeatCount="indefinite" begin="1.6s" />
          <animate attributeName="opacity" values="1;0.5;0" dur="2.5s" repeatCount="indefinite" begin="1.6s" />
        </text>
      </g>
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
    symbol: "ftrBTC",
    name: "Futures Market",
    tagline: "Mining Pool Innovation",
    description: "Block reward futures. Miners hedge lock times and users capture premiums from mining partnerships.",
    icon: <FtrBTCIcon />,
    color: "from-purple-500 to-purple-700",
  },
  {
    symbol: "yvfrBTC",
    name: "BTC Yield Aggregator",
    tagline: "Classic DeFi Vault Strategy",
    description: "Earn fees and capture incentives from deep liquidity pools across BTC, USD, DIESEL, and other markets on Bitcoin.",
    icon: <YvFrBTCIcon />,
    color: "from-blue-500 to-blue-700"
  },
  {
    symbol: "dxBTC",
    name: "dxBTC: Tokenized Yield",
    tagline: "Superior UX for BTC Staking",
    description: "Stake BTC, receive dxBTC. Auto-deployed into yield strategies that maintain full exposure to the price of BTC. Unstake anytime with no lock-up period.",
    icon: <DxBTCIcon />,
    color: "from-emerald-500 to-emerald-700"
  }
]

export default function VaultsOverview() {
  return (
    <div className="mt-14 pt-10 border-t border-slate-300/20 space-y-12">
      {/* Header */}
      <div className="text-center">
        <h3 className="text-3xl md:text-4xl font-bold uppercase tracking-wider text-white snow-title-no-filter mb-4">
          SUBFROST YIELD PRODUCTS
        </h3>
        <p className="text-lg text-gray-400 max-w-2xl mx-auto">
          Futures Instruments. Automated Vaults & Gauges. Unified Yield. All on Bitcoin.
        </p>
      </div>

      {/* Products Grid */}
      <div className="grid grid-cols-1 md:grid-cols-3 gap-8 max-w-6xl mx-auto">
        {products.map((product, index) => (
          <div
            key={index}
            className={cn(
              "group relative rounded-2xl p-8 transition-all duration-500",
              "bg-gradient-to-br from-slate-800/60 to-slate-900/60",
              "shadow-lg shadow-black/20",
              "before:absolute before:inset-x-0 before:top-0 before:h-4 before:rounded-t-2xl before:border-t before:border-l before:border-r before:border-white/10 before:pointer-events-none before:[mask-image:linear-gradient(to_right,transparent,black_5%,black_95%,transparent)]",
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
              "blur-md"
            )} />

            {/* Icon */}
            <div className="w-32 h-32 mx-auto mb-6">
              {product.icon}
            </div>

            {/* Name */}
            <h4 className="text-xl md:text-2xl font-bold text-center mb-2">
              <span className={cn("bg-gradient-to-r bg-clip-text text-transparent", product.color)}>
                {product.name}
              </span>
            </h4>

            {/* Tagline */}
            <p className="text-sm text-gray-400 text-center italic mb-4">
              {product.tagline}
            </p>

            {/* Description */}
            <p className="text-sm text-gray-300 text-center leading-relaxed">
              {product.description}
            </p>
          </div>
        ))}
      </div>
    </div>
  )
}
